// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title  AgentEscrow
 * @notice Nicolas 中转/托管合约 — 部署在 XLayer。
 *
 *         设计要点：
 *           - 仅接收白名单 Token（默认 XLayer USDT，免 Gas 转账）
 *           - 用区块数（block.number）作为锁定窗口
 *           - 卖家或任意人都可在锁定到期后触发放款
 *           - 买家可在卖家逾期未交付时自主取消并退款
 *           - 卖家可主动全额退款（无理由退款）
 *           - Owner 可强制中断订单 / 紧急暂停新订单 / 救援任意 ERC-20
 *           - 仲裁者（单签）处理纠纷
 *           - 订单可附带 metadataHash，方便链下 indexer 关联
 */
contract AgentEscrow is ReentrancyGuard, Ownable2Step, Pausable {
    using SafeERC20 for IERC20;

    // ─── Types ────────────────────────────────────────────────────────────────

    enum OrderStatus {
        None,         // 占位，未创建
        EscrowHeld,   // 已托管，等待卖家交付
        Delivered,    // 卖家已交付，区块锁定中
        Completed,    // 已完成（放款给卖家）
        Disputed,     // 买家已发起纠纷
        Refunded,     // 已全额退款给买家
        Cancelled,    // 卖家逾期未交付，买家已取消退款
        Interrupted   // Owner 强制中断，资金冻结
    }

    struct Order {
        address buyer;
        address seller;
        address token;
        uint256 amount;
        uint256 fee;             // 创建时按当时 feeBps 锁定
        uint256 lockBlocks;      // 交付后等待的区块数
        uint256 deliverByBlock;  // 卖家最迟交付区块（0 = 不限）
        uint256 deliveredAtBlock;
        bytes32 metadataHash;    // off-chain 引用（IPFS CID 或 JSON 哈希）
        OrderStatus status;
    }

    // ─── Storage ──────────────────────────────────────────────────────────────

    mapping(bytes32 => Order) public orders;
    mapping(address => bool) public whitelistedTokens;

    address public feeRecipient;
    uint256 public feeBps;                       // 基点
    uint256 public constant MAX_FEE_BPS = 1000;  // 上限 10%

    address public arbitrator;                   // 单签仲裁者

    /// @notice 默认锁定区块数（XLayer ~3s/block，28800 ≈ 24h）
    uint256 public defaultLockBlocks = 28_800;

    // ─── Events ───────────────────────────────────────────────────────────────

    event OrderCreated(
        bytes32 indexed orderId,
        address indexed buyer,
        address indexed seller,
        address token,
        uint256 amount,
        uint256 lockBlocks,
        uint256 deliverByBlock,
        bytes32 metadataHash
    );
    event OrderDelivered(bytes32 indexed orderId, uint256 deliveredAtBlock, uint256 unlockBlock);
    event OrderCompleted(bytes32 indexed orderId, address indexed seller, uint256 sellerAmount, uint256 feeAmount);
    event OrderDisputed(bytes32 indexed orderId, address indexed buyer);
    event OrderCancelled(bytes32 indexed orderId, address indexed buyer, uint256 refundAmount);
    event OrderRefundedBySeller(bytes32 indexed orderId, address indexed seller, uint256 refundAmount);
    event OrderInterrupted(bytes32 indexed orderId, string reason);
    event DisputeResolved(
        bytes32 indexed orderId,
        uint256 buyerRefund,
        uint256 sellerAmount,
        uint256 feeAmount
    );

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
    error DeliverDeadlineNotReached();
    error ZeroAmount();
    error FeeTooHigh();
    error InvalidAddress();
    error InvalidBps();

    // ─── Constructor ──────────────────────────────────────────────────────────

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
     * @param orderId          链下生成的唯一订单 ID
     * @param seller           卖家地址
     * @param token            支付 Token（必须在白名单中）
     * @param amount           金额
     * @param lockBlocks       交付后锁定区块数；0 = defaultLockBlocks
     * @param deliverByBlock   卖家最迟交付区块；0 = 不限
     * @param metadataHash     off-chain 引用（可选，传 bytes32(0) 表示无）
     */
    function createOrder(
        bytes32 orderId,
        address seller,
        address token,
        uint256 amount,
        uint256 lockBlocks,
        uint256 deliverByBlock,
        bytes32 metadataHash
    ) external nonReentrant whenNotPaused {
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
            deliverByBlock: deliverByBlock,
            deliveredAtBlock: 0,
            metadataHash: metadataHash,
            status: OrderStatus.EscrowHeld
        });

        emit OrderCreated(orderId, msg.sender, seller, token, amount, lock, deliverByBlock, metadataHash);
    }

    /**
     * @notice 买家确认交付，立即放款给卖家。可在 EscrowHeld 或 Delivered 状态调用。
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
     * @notice 买家在锁定窗口内发起纠纷。
     */
    function raiseDispute(bytes32 orderId) external {
        Order storage order = _requireOrder(orderId);
        if (order.buyer != msg.sender) revert Unauthorized();
        if (order.status != OrderStatus.Delivered) revert InvalidStatus(order.status);
        if (block.number > order.deliveredAtBlock + order.lockBlocks) revert LockExpired();

        order.status = OrderStatus.Disputed;
        emit OrderDisputed(orderId, msg.sender);
    }

    /**
     * @notice 卖家逾期未交付时，买家可取消订单并全额退款（免手续费）。
     *         仅当 status == EscrowHeld 且 deliverByBlock > 0 且 block.number > deliverByBlock 时可调用。
     */
    function cancelExpiredOrder(bytes32 orderId) external nonReentrant {
        Order storage order = _requireOrder(orderId);
        if (order.buyer != msg.sender) revert Unauthorized();
        if (order.status != OrderStatus.EscrowHeld) revert InvalidStatus(order.status);
        if (order.deliverByBlock == 0 || block.number <= order.deliverByBlock) {
            revert DeliverDeadlineNotReached();
        }

        uint256 refundAmount = order.amount;
        order.status = OrderStatus.Cancelled;
        IERC20(order.token).safeTransfer(order.buyer, refundAmount);
        emit OrderCancelled(orderId, order.buyer, refundAmount);
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

    /**
     * @notice 卖家主动全额退款给买家（免手续费）。
     *         可在 EscrowHeld / Delivered / Disputed 状态调用，提供"无理由退款"能力。
     */
    function sellerRefund(bytes32 orderId) external nonReentrant {
        Order storage order = _requireOrder(orderId);
        if (order.seller != msg.sender) revert Unauthorized();
        if (
            order.status != OrderStatus.EscrowHeld &&
            order.status != OrderStatus.Delivered &&
            order.status != OrderStatus.Disputed
        ) {
            revert InvalidStatus(order.status);
        }

        uint256 refundAmount = order.amount;
        order.status = OrderStatus.Refunded;
        IERC20(order.token).safeTransfer(order.buyer, refundAmount);
        emit OrderRefundedBySeller(orderId, order.seller, refundAmount);
    }

    // ─── Anyone ───────────────────────────────────────────────────────────────

    /**
     * @notice 区块锁定到期且无纠纷时，任意人可触发放款。
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
     * @param buyerRefundBps  10000=全退（免手续费）；0=全部放款给卖家；中间值按净额比例分配并收取手续费
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
     */
    function rescueTokens(address token, address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert InvalidAddress();
        IERC20(token).safeTransfer(to, amount);
        emit TokensRescued(token, to, amount);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
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

    /// @dev 解决 Ownable / Ownable2Step 在 OZ v5 中的 transferOwnership 多重继承
    function transferOwnership(address newOwner) public override(Ownable, Ownable2Step) onlyOwner {
        Ownable2Step.transferOwnership(newOwner);
    }

    function _transferOwnership(address newOwner) internal override(Ownable, Ownable2Step) {
        Ownable2Step._transferOwnership(newOwner);
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

    /// @notice 是否可调用 cancelExpiredOrder（卖家逾期未交付）。
    function isCancellable(bytes32 orderId) external view returns (bool) {
        Order storage order = orders[orderId];
        if (order.status != OrderStatus.EscrowHeld) return false;
        if (order.deliverByBlock == 0) return false;
        return block.number > order.deliverByBlock;
    }

    /// @notice 给定金额预计算手续费（用于前端展示）。
    function previewFee(uint256 amount) external view returns (uint256) {
        return (amount * feeBps) / 10_000;
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

        emit OrderCompleted(orderId, order.seller, sellerAmount, order.fee);
    }
}
