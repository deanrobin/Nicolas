// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title  AgentEscrow
 * @notice Relay escrow contract for Agents Bazaar.
 *
 *         Flow:
 *           1. Buyer calls createOrder() — USDC locked in this contract.
 *           2. Seller calls markDelivered() — dispute window starts.
 *           3a. Buyer calls confirmDelivery() — funds released to seller (minus fee).
 *           3b. No action after dispute window → anyone calls autoRelease().
 *           3c. Buyer calls raiseDispute() within window → arbitrator resolves.
 *
 *         Dispute resolution options:
 *           - Full refund  (buyerRefundBps = 10000): buyer gets everything, fee waived.
 *           - Partial      (0 < buyerRefundBps < 10000): fee charged, net split by ratio.
 *           - Full release (buyerRefundBps = 0): seller gets net, platform gets fee.
 */
contract AgentEscrow is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ─── Types ────────────────────────────────────────────────────────────────

    enum OrderStatus {
        EscrowHeld, // funds locked, agent executing
        Delivered,  // seller marked delivered, dispute window open
        Completed,  // buyer confirmed or auto-released
        Disputed,   // buyer raised dispute, awaiting arbitration
        Refunded    // fully refunded to buyer
    }

    struct Order {
        address buyer;
        address seller;
        address token;         // ERC-20 payment token (e.g. USDC)
        uint256 amount;        // gross amount deposited by buyer
        uint256 fee;           // platform fee portion (derived from feeBps at creation)
        uint256 deliverBy;     // unix timestamp deadline for delivery
        uint256 disputeWindow; // seconds buyer has to dispute after delivery
        uint256 deliveredAt;   // timestamp when seller marked delivered (0 if not yet)
        OrderStatus status;
    }

    // ─── Storage ──────────────────────────────────────────────────────────────

    mapping(bytes32 => Order) public orders;

    address public feeRecipient;
    uint256 public feeBps;                    // platform fee in basis points (250 = 2.5%)
    uint256 public constant MAX_FEE_BPS = 1000; // hard cap at 10%

    address public arbitrator;                // multi-sig admin for dispute resolution

    uint256 public defaultDisputeWindow = 48 hours;

    // ─── Events ───────────────────────────────────────────────────────────────

    event OrderCreated(
        bytes32 indexed orderId,
        address indexed buyer,
        address indexed seller,
        address token,
        uint256 amount,
        uint256 deliverBy
    );
    event OrderDelivered(bytes32 indexed orderId, uint256 disputeDeadline);
    event OrderCompleted(bytes32 indexed orderId, uint256 sellerAmount, uint256 feeAmount);
    event OrderDisputed(bytes32 indexed orderId, address indexed buyer);
    event OrderRefunded(bytes32 indexed orderId, uint256 buyerAmount);
    event DisputeResolved(bytes32 indexed orderId, uint256 buyerRefund, uint256 sellerAmount, uint256 feeAmount);
    event ArbitratorUpdated(address indexed newArbitrator);
    event FeeUpdated(uint256 newFeeBps);
    event FeeRecipientUpdated(address indexed newFeeRecipient);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error OrderAlreadyExists();
    error OrderNotFound();
    error InvalidStatus(OrderStatus current);
    error Unauthorized();
    error DisputeWindowStillOpen();
    error DisputeWindowExpired();
    error ZeroAmount();
    error FeeTooHigh();
    error InvalidAddress();
    error InvalidBps();

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address _feeRecipient, address _arbitrator, uint256 _feeBps) Ownable(msg.sender) {
        if (_feeRecipient == address(0) || _arbitrator == address(0)) revert InvalidAddress();
        if (_feeBps > MAX_FEE_BPS) revert FeeTooHigh();
        feeRecipient = _feeRecipient;
        arbitrator = _arbitrator;
        feeBps = _feeBps;
    }

    // ─── Buyer ────────────────────────────────────────────────────────────────

    /**
     * @notice Create an order and deposit funds into escrow.
     * @param orderId               Off-chain unique order ID (e.g. keccak256 of UUID string).
     * @param seller                Seller's wallet address.
     * @param token                 ERC-20 token to use (USDC address on target chain).
     * @param amount                Gross amount to deposit (inclusive of platform fee).
     * @param deliverBy             Delivery deadline (unix timestamp).
     * @param disputeWindowSeconds  Override dispute window; pass 0 to use defaultDisputeWindow.
     */
    function createOrder(
        bytes32 orderId,
        address seller,
        address token,
        uint256 amount,
        uint256 deliverBy,
        uint256 disputeWindowSeconds
    ) external nonReentrant {
        if (orders[orderId].buyer != address(0)) revert OrderAlreadyExists();
        if (amount == 0) revert ZeroAmount();
        if (seller == address(0) || token == address(0)) revert InvalidAddress();

        uint256 window = disputeWindowSeconds == 0 ? defaultDisputeWindow : disputeWindowSeconds;
        uint256 fee = (amount * feeBps) / 10_000;

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        orders[orderId] = Order({
            buyer: msg.sender,
            seller: seller,
            token: token,
            amount: amount,
            fee: fee,
            deliverBy: deliverBy,
            disputeWindow: window,
            deliveredAt: 0,
            status: OrderStatus.EscrowHeld
        });

        emit OrderCreated(orderId, msg.sender, seller, token, amount, deliverBy);
    }

    /**
     * @notice Buyer confirms delivery and immediately releases funds to seller.
     *         Can be called when status is EscrowHeld or Delivered.
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
     * @notice Buyer raises a dispute within the dispute window after delivery.
     */
    function raiseDispute(bytes32 orderId) external {
        Order storage order = _requireOrder(orderId);
        if (order.buyer != msg.sender) revert Unauthorized();
        if (order.status != OrderStatus.Delivered) revert InvalidStatus(order.status);
        if (block.timestamp > order.deliveredAt + order.disputeWindow) revert DisputeWindowExpired();

        order.status = OrderStatus.Disputed;
        emit OrderDisputed(orderId, msg.sender);
    }

    // ─── Seller ───────────────────────────────────────────────────────────────

    /**
     * @notice Seller marks the order as delivered, starting the dispute window.
     */
    function markDelivered(bytes32 orderId) external {
        Order storage order = _requireOrder(orderId);
        if (order.seller != msg.sender) revert Unauthorized();
        if (order.status != OrderStatus.EscrowHeld) revert InvalidStatus(order.status);

        order.status = OrderStatus.Delivered;
        order.deliveredAt = block.timestamp;
        emit OrderDelivered(orderId, block.timestamp + order.disputeWindow);
    }

    // ─── Anyone ───────────────────────────────────────────────────────────────

    /**
     * @notice Release funds to seller after dispute window expires without dispute.
     *         Anyone can call this to trigger the auto-release (e.g. keeper bot).
     */
    function autoRelease(bytes32 orderId) external nonReentrant {
        Order storage order = _requireOrder(orderId);
        if (order.status != OrderStatus.Delivered) revert InvalidStatus(order.status);
        if (block.timestamp <= order.deliveredAt + order.disputeWindow) revert DisputeWindowStillOpen();
        _release(orderId, order);
    }

    // ─── Arbitrator ───────────────────────────────────────────────────────────

    /**
     * @notice Resolve a disputed order.
     * @param orderId        The disputed order.
     * @param buyerRefundBps Percentage (bps) of gross amount returned to buyer (0–10000).
     *                       10000 = full refund (fee waived).
     *                       0     = full release to seller (fee charged).
     *                       5000  = 50% back to buyer, 50% net to seller (fee charged).
     */
    function resolveDispute(bytes32 orderId, uint256 buyerRefundBps) external nonReentrant {
        if (msg.sender != arbitrator) revert Unauthorized();
        if (buyerRefundBps > 10_000) revert InvalidBps();

        Order storage order = _requireOrder(orderId);
        if (order.status != OrderStatus.Disputed) revert InvalidStatus(order.status);

        IERC20 token = IERC20(order.token);

        if (buyerRefundBps == 10_000) {
            // Full refund: return gross amount to buyer, platform waives fee.
            order.status = OrderStatus.Refunded;
            token.safeTransfer(order.buyer, order.amount);
            emit DisputeResolved(orderId, order.amount, 0, 0);
        } else {
            // Partial or no refund: platform fee is charged, net is split by ratio.
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

    // ─── View ─────────────────────────────────────────────────────────────────

    function getOrder(bytes32 orderId) external view returns (Order memory) {
        return orders[orderId];
    }

    /**
     * @notice Returns true if the dispute window for a Delivered order has expired.
     */
    function isDisputeWindowExpired(bytes32 orderId) external view returns (bool) {
        Order storage order = orders[orderId];
        if (order.deliveredAt == 0) return false;
        return block.timestamp > order.deliveredAt + order.disputeWindow;
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

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

    function setDefaultDisputeWindow(uint256 seconds_) external onlyOwner {
        defaultDisputeWindow = seconds_;
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _requireOrder(bytes32 orderId) internal view returns (Order storage order) {
        order = orders[orderId];
        if (order.buyer == address(0)) revert OrderNotFound();
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
