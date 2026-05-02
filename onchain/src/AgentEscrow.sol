// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title  AgentEscrow
 * @notice Agents Bazaar 中转/托管合约 — 部署在 XLayer。
 *
 *         设计要点：
 *           - 仅接收白名单 Token（默认 XLayer USDT，免 Gas 转账）
 *           - 用区块数（block.number）替代时间作为锁定窗口
 *           - 卖家或任意人都可在锁定到期后触发放款
 *           - Owner 可强制中断任意订单（资金冻结），并随后通过 rescueTokens 处置
 *           - 仲裁者（单签）处理纠纷，可全退/部分退/全放款
 *           - 手续费默认 0，可由 Owner 调整（上限 10%）
 */
contract AgentEscrow is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ─── Types ────────────────────────────────────────────────────────────────

    enum OrderStatus {
        None,         // 占位，未创建
        EscrowHeld,   // 已托管，等待卖家交付
        Delivered,    // 卖家已交付，区块锁定中
        Completed,    // 已完成（放款给卖家）
        Disputed,     // 买家已发起纠纷
        Refunded,     // 已全额退款给买家
        Interrupted   // Owner 强制中断，资金冻结
    }

    struct Order {
        address buyer;
        address seller;
        address token;          // 必须在 whitelistedTokens 中
        uint256 amount;         // 买家锁入的总额
        uint256 fee;            // 创建订单时按当时 feeBps 锁定的手续费
        uint256 lockBlocks;     // 交付后需要等待的区块数
        uint256 deliveredAtBlock; // 卖家 markDelivered 时的区块号
        OrderStatus status;
    }

    // ─── Storage ──────────────────────────────────────────────────────────────

    mapping(bytes32 => Order) public orders;
    mapping(address => bool) public whitelistedTokens;

    address public feeRecipient;
    uint256 public feeBps;                       // 基点，250 = 2.5%
    uint256 public constant MAX_FEE_BPS = 1000;  // 硬上限 10%

    address public arbitrator;                   // 单签仲裁者

    /// @notice 默认锁定区块数（XLayer 出块约 3s，28800 块 ≈ 24 小时）
    uint256 public defaultLockBlocks = 28_800;

    // ─── Events ───────────────────────────────────────────────────────────────

    event OrderCreated(
        bytes32 indexed orderId,
        address indexed buyer,
        address indexed seller,
        address token,
        uint256 amount,
        uint256 lockBlocks
    );
    event OrderDelivered(bytes32 indexed orderId, uint256 deliveredAtBlock, uint256 unlockBlock);
    event OrderCompleted(bytes32 indexed orderId, uint256 sellerAmount, uint256 feeAmount);
    event OrderDisputed(bytes32 indexed orderId, address indexed buyer);
    event OrderInterrupted(bytes32 indexed orderId, string reason);
    event DisputeResolved(bytes32 indexed orderId, uint256 buyerRefund, uint256 sellerAmount, uint256 feeAmount);

    event TokenWhitelisted(address indexed token, bool allowed);
    event ArbitratorUpdated(address indexed newArbitrator);
    event FeeUpdated(uint256 newFeeBps);
    event FeeRecipientUpdated(address indexed newFeeRecipient);
    event LockBlocksUpdated(uint256 newLockBlocks);
    event TokensRescued(address indexed token, address indexed to, uint256 amount);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error OrderAlreadyExists();
    error OrderNotFound();
    error InvalidStatus(OrderStatus current);
    error Unauthorized();
    error TokenNotWhitelisted(address token);
    error LockStillActive();
    error LockExpired();
    error ZeroAmount();
    error FeeTooHigh();
    error InvalidAddress();
    error InvalidBps();

    // ─── Constructor ──────────────────────────────────────────────────────────

    /**
     * @param _feeRecipient   手续费接收地址
     * @param _arbitrator     仲裁者地址（单签）
     * @param _feeBps         初始费率（基点），通常传 0
     * @param _initialToken   初始白名单 Token（XLayer USDT）
     */
    constructor(
        address _feeRecipient,
        address _arbitrator,
        uint256 _feeBps,
        address _initialToken
    ) Ownable(msg.sender) {
        if (_feeRecipient == address(0) || _arbitrator == address(0)) revert InvalidAddress();
        if (_feeBps > MAX_FEE_BPS) revert FeeTooHigh();
        feeRecipient = _feeRecipient;
        arbitrator = _arbitrator;
        feeBps = _feeBps;

        if (_initialToken != address(0)) {
            whitelistedTokens[_initialToken] = true;
            emit TokenWhitelisted(_initialToken, true);
        }
    }

    // ─── Buyer ────────────────────────────────────────────────────────────────

    /**
     * @notice 买家创建订单并锁入 USDT。
     * @param orderId      链下生成的唯一订单 ID（建议 keccak256(uuid)）
     * @param seller       卖家地址
     * @param token        支付 Token，必须在白名单中
     * @param amount       金额
     * @param lockBlocks   锁定区块数；传 0 使用 defaultLockBlocks
     */
    function createOrder(
        bytes32 orderId,
        address seller,
        address token,
        uint256 amount,
        uint256 lockBlocks
    ) external nonReentrant {
        if (orders[orderId].status != OrderStatus.None) revert OrderAlreadyExists();
        if (amount == 0) revert ZeroAmount();
        if (seller == address(0)) revert InvalidAddress();
        if (!whitelistedTokens[token]) revert TokenNotWhitelisted(token);

        uint256 lock = lockBlocks == 0 ? defaultLockBlocks : lockBlocks;
        uint256 fee = (amount * feeBps) / 10_000;

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        orders[orderId] = Order({
            buyer: msg.sender,
            seller: seller,
            token: token,
            amount: amount,
            fee: fee,
            lockBlocks: lock,
            deliveredAtBlock: 0,
            status: OrderStatus.EscrowHeld
        });

        emit OrderCreated(orderId, msg.sender, seller, token, amount, lock);
    }

    /**
     * @notice 买家确认交付，立即放款给卖家（可在 EscrowHeld 或 Delivered 状态）。
     */
    function confirmDelivery(bytes32 orderId) external nonReentrant {
        Order storage order = _requireOrder(orderId);
        if (order.buyer != msg.sender) revert Unauthorized();
        if (order.status != OrderStatus.EscrowHeld && order.status != OrderStatus.Delivered) {
            revert InvalidStatus(order.status);
        }
        _release(orderId, order);
    }

    /**
     * @notice 买家在区块锁定窗口内发起纠纷。
     */
    function raiseDispute(bytes32 orderId) external {
        Order storage order = _requireOrder(orderId);
        if (order.buyer != msg.sender) revert Unauthorized();
        if (order.status != OrderStatus.Delivered) revert InvalidStatus(order.status);
        if (block.number > order.deliveredAtBlock + order.lockBlocks) revert LockExpired();

        order.status = OrderStatus.Disputed;
        emit OrderDisputed(orderId, msg.sender);
    }

    // ─── Seller ───────────────────────────────────────────────────────────────

    /**
     * @notice 卖家标记已交付，开始区块倒计时。
     */
    function markDelivered(bytes32 orderId) external {
        Order storage order = _requireOrder(orderId);
        if (order.seller != msg.sender) revert Unauthorized();
        if (order.status != OrderStatus.EscrowHeld) revert InvalidStatus(order.status);

        order.status = OrderStatus.Delivered;
        order.deliveredAtBlock = block.number;
        emit OrderDelivered(orderId, block.number, block.number + order.lockBlocks);
    }

    // ─── Anyone ───────────────────────────────────────────────────────────────

    /**
     * @notice 区块锁定到期且无纠纷时，任意人可触发放款（卖家/Keeper 都可）。
     */
    function autoRelease(bytes32 orderId) external nonReentrant {
        Order storage order = _requireOrder(orderId);
        if (order.status != OrderStatus.Delivered) revert InvalidStatus(order.status);
        if (block.number <= order.deliveredAtBlock + order.lockBlocks) revert LockStillActive();
        _release(orderId, order);
    }

    // ─── Arbitrator ───────────────────────────────────────────────────────────

    /**
     * @notice 仲裁者解决纠纷。
     * @param buyerRefundBps  返给买家的比例（基点）
     *                        10000 = 全退（免手续费）
     *                        0     = 全部放款给卖家（按净额）
     *                        中间值 = 净额按比例分给买卖双方，平台收取手续费
     */
    function resolveDispute(bytes32 orderId, uint256 buyerRefundBps) external nonReentrant {
        if (msg.sender != arbitrator) revert Unauthorized();
        if (buyerRefundBps > 10_000) revert InvalidBps();

        Order storage order = _requireOrder(orderId);
        if (order.status != OrderStatus.Disputed) revert InvalidStatus(order.status);

        IERC20 token = IERC20(order.token);

        if (buyerRefundBps == 10_000) {
            order.status = OrderStatus.Refunded;
            token.safeTransfer(order.buyer, order.amount);
            emit DisputeResolved(orderId, order.amount, 0, 0);
        } else {
            order.status = OrderStatus.Completed;
            uint256 netAmount = order.amount - order.fee;
            uint256 buyerRefund = (netAmount * buyerRefundBps) / 10_000;
            uint256 sellerAmount = netAmount - buyerRefund;

            if (buyerRefund > 0) token.safeTransfer(order.buyer, buyerRefund);
            if (sellerAmount > 0) token.safeTransfer(order.seller, sellerAmount);
            if (order.fee > 0) token.safeTransfer(feeRecipient, order.fee);

            emit DisputeResolved(orderId, buyerRefund, sellerAmount, order.fee);
        }
    }

    // ─── Owner-only ───────────────────────────────────────────────────────────

    /**
     * @notice 强制中断订单，资金冻结。可作用于 EscrowHeld/Delivered/Disputed。
     *         中断后请通过 rescueTokens 手动处置资金。
     */
    function forceInterrupt(bytes32 orderId, string calldata reason) external onlyOwner {
        Order storage order = _requireOrder(orderId);
        if (
            order.status != OrderStatus.EscrowHeld &&
            order.status != OrderStatus.Delivered &&
            order.status != OrderStatus.Disputed
        ) {
            revert InvalidStatus(order.status);
        }
        order.status = OrderStatus.Interrupted;
        emit OrderInterrupted(orderId, reason);
    }

    /**
     * @notice 紧急救援：Owner 提取合约内任意 ERC-20 余额到指定地址。
     *         典型用途：处置 Interrupted 订单的资金、回收误转入合约的代币。
     */
    function rescueTokens(address token, address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert InvalidAddress();
        IERC20(token).safeTransfer(to, amount);
        emit TokensRescued(token, to, amount);
    }

    function setTokenWhitelist(address token, bool allowed) external onlyOwner {
        if (token == address(0)) revert InvalidAddress();
        whitelistedTokens[token] = allowed;
        emit TokenWhitelisted(token, allowed);
    }

    function setArbitrator(address _arbitrator) external onlyOwner {
        if (_arbitrator == address(0)) revert InvalidAddress();
        arbitrator = _arbitrator;
        emit ArbitratorUpdated(_arbitrator);
    }

    function setFee(uint256 _feeBps) external onlyOwner {
        if (_feeBps > MAX_FEE_BPS) revert FeeTooHigh();
        feeBps = _feeBps;
        emit FeeUpdated(_feeBps);
    }

    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        if (_feeRecipient == address(0)) revert InvalidAddress();
        feeRecipient = _feeRecipient;
        emit FeeRecipientUpdated(_feeRecipient);
    }

    function setDefaultLockBlocks(uint256 _lockBlocks) external onlyOwner {
        defaultLockBlocks = _lockBlocks;
        emit LockBlocksUpdated(_lockBlocks);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function getOrder(bytes32 orderId) external view returns (Order memory) {
        return orders[orderId];
    }

    /// @notice 当前是否可以调用 autoRelease。
    function isReleasable(bytes32 orderId) external view returns (bool) {
        Order storage order = orders[orderId];
        if (order.status != OrderStatus.Delivered) return false;
        return block.number > order.deliveredAtBlock + order.lockBlocks;
    }

    /// @notice 是否仍处于纠纷窗口内（可以 raiseDispute）。
    function isInDisputeWindow(bytes32 orderId) external view returns (bool) {
        Order storage order = orders[orderId];
        if (order.status != OrderStatus.Delivered) return false;
        return block.number <= order.deliveredAtBlock + order.lockBlocks;
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _requireOrder(bytes32 orderId) internal view returns (Order storage order) {
        order = orders[orderId];
        if (order.status == OrderStatus.None) revert OrderNotFound();
    }

    function _release(bytes32 orderId, Order storage order) internal {
        uint256 sellerAmount = order.amount - order.fee;
        order.status = OrderStatus.Completed;

        IERC20 token = IERC20(order.token);
        token.safeTransfer(order.seller, sellerAmount);
        if (order.fee > 0) token.safeTransfer(feeRecipient, order.fee);

        emit OrderCompleted(orderId, sellerAmount, order.fee);
    }
}
