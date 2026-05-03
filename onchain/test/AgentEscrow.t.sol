// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {AgentEscrow} from "../src/AgentEscrow.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDT is ERC20 {
    constructor() ERC20("Tether USD", "USDT") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract AgentEscrowTest is Test {
    AgentEscrow escrow;
    MockUSDT usdt;
    MockUSDT otherToken;

    address owner = makeAddr("owner");
    address feeRecipient = makeAddr("feeRecipient");
    address arbitrator = makeAddr("arbitrator");
    address buyer = makeAddr("buyer");
    address seller = makeAddr("seller");
    address rescueTo = makeAddr("rescueTo");

    uint256 constant FEE_BPS = 0;
    uint256 constant ORDER_AMOUNT = 1_000_000;
    bytes32 constant ORDER_ID = keccak256("order_001");
    bytes32 constant METADATA = keccak256("ipfs://service-spec");

    function setUp() public {
        usdt = new MockUSDT();
        otherToken = new MockUSDT();

        vm.prank(owner);
        escrow = new AgentEscrow(feeRecipient, arbitrator, FEE_BPS, address(usdt));

        usdt.mint(buyer, 10 * ORDER_AMOUNT);
        otherToken.mint(buyer, 10 * ORDER_AMOUNT);

        vm.startPrank(buyer);
        usdt.approve(address(escrow), type(uint256).max);
        otherToken.approve(address(escrow), type(uint256).max);
        vm.stopPrank();
    }

    function _create() internal {
        vm.prank(buyer);
        escrow.createOrder(ORDER_ID, seller, address(usdt), ORDER_AMOUNT, 0, 0, METADATA);
    }

    function _createWithDeadline(uint256 deliverByBlock) internal {
        vm.prank(buyer);
        escrow.createOrder(ORDER_ID, seller, address(usdt), ORDER_AMOUNT, 0, deliverByBlock, METADATA);
    }

    // ─── 白名单 ───────────────────────────────────────────────────────────────

    function test_initialToken_isWhitelisted() public view {
        assertTrue(escrow.whitelistedTokens(address(usdt)));
    }

    function test_createOrder_revertsForNonWhitelistedToken() public {
        vm.expectRevert(abi.encodeWithSelector(AgentEscrow.TokenNotWhitelisted.selector, address(otherToken)));
        vm.prank(buyer);
        escrow.createOrder(ORDER_ID, seller, address(otherToken), ORDER_AMOUNT, 0, 0, bytes32(0));
    }

    function test_owner_canWhitelistAndRevoke() public {
        vm.prank(owner);
        escrow.setTokenWhitelist(address(otherToken), true);
        assertTrue(escrow.whitelistedTokens(address(otherToken)));

        vm.prank(buyer);
        escrow.createOrder(ORDER_ID, seller, address(otherToken), ORDER_AMOUNT, 0, 0, bytes32(0));

        vm.prank(owner);
        escrow.setTokenWhitelist(address(otherToken), false);
        assertFalse(escrow.whitelistedTokens(address(otherToken)));
    }

    function test_setTokenWhitelist_onlyOwner() public {
        vm.expectRevert();
        vm.prank(buyer);
        escrow.setTokenWhitelist(address(otherToken), true);
    }

    // ─── 创建订单 ─────────────────────────────────────────────────────────────

    function test_createOrder_locksFundsAndStoresMetadata() public {
        _create();
        assertEq(usdt.balanceOf(address(escrow)), ORDER_AMOUNT);
        AgentEscrow.Order memory o = escrow.getOrder(ORDER_ID);
        assertEq(o.buyer, buyer);
        assertEq(o.seller, seller);
        assertEq(o.amount, ORDER_AMOUNT);
        assertEq(o.metadataHash, METADATA);
        assertEq(uint8(o.status), uint8(AgentEscrow.OrderStatus.EscrowHeld));
    }

    function test_createOrder_revertsForDuplicate() public {
        _create();
        vm.expectRevert(AgentEscrow.OrderAlreadyExists.selector);
        vm.prank(buyer);
        escrow.createOrder(ORDER_ID, seller, address(usdt), ORDER_AMOUNT, 0, 0, METADATA);
    }

    // ─── 立即确认 ─────────────────────────────────────────────────────────────

    function test_confirmDelivery_releasesFunds() public {
        _create();
        vm.prank(buyer);
        escrow.confirmDelivery(ORDER_ID);
        assertEq(usdt.balanceOf(seller), ORDER_AMOUNT);
        assertEq(usdt.balanceOf(address(escrow)), 0);
    }

    // ─── 区块锁定 + 自动放款 ──────────────────────────────────────────────────

    function test_autoRelease_revertsBeforeLockExpires() public {
        _create();
        vm.prank(seller);
        escrow.markDelivered(ORDER_ID);

        vm.roll(block.number + escrow.defaultLockBlocks());
        vm.expectRevert(AgentEscrow.LockStillActive.selector);
        escrow.autoRelease(ORDER_ID);
    }

    function test_autoRelease_succeedsAfterLockExpires() public {
        _create();
        vm.prank(seller);
        escrow.markDelivered(ORDER_ID);

        vm.roll(block.number + escrow.defaultLockBlocks() + 1);
        address keeper = makeAddr("keeper");
        vm.prank(keeper);
        escrow.autoRelease(ORDER_ID);

        assertEq(usdt.balanceOf(seller), ORDER_AMOUNT);
    }

    // ─── 卖家逾期 → 买家取消 ──────────────────────────────────────────────────

    function test_cancelExpiredOrder_succeeds_afterDeadline() public {
        uint256 deadline = block.number + 100;
        _createWithDeadline(deadline);

        vm.roll(deadline + 1);
        vm.prank(buyer);
        escrow.cancelExpiredOrder(ORDER_ID);

        assertEq(usdt.balanceOf(buyer), 10 * ORDER_AMOUNT);
        AgentEscrow.Order memory o = escrow.getOrder(ORDER_ID);
        assertEq(uint8(o.status), uint8(AgentEscrow.OrderStatus.Cancelled));
    }

    function test_cancelExpiredOrder_revertsBeforeDeadline() public {
        _createWithDeadline(block.number + 100);
        vm.expectRevert(AgentEscrow.DeliverDeadlineNotReached.selector);
        vm.prank(buyer);
        escrow.cancelExpiredOrder(ORDER_ID);
    }

    function test_cancelExpiredOrder_revertsWhenNoDeadlineSet() public {
        _create(); // deliverByBlock = 0
        vm.roll(block.number + 1_000_000);
        vm.expectRevert(AgentEscrow.DeliverDeadlineNotReached.selector);
        vm.prank(buyer);
        escrow.cancelExpiredOrder(ORDER_ID);
    }

    function test_cancelExpiredOrder_revertsAfterDelivered() public {
        _createWithDeadline(block.number + 100);
        vm.prank(seller);
        escrow.markDelivered(ORDER_ID); // 卖家已交付，订单进入 Delivered
        vm.roll(block.number + 200);

        vm.expectRevert();
        vm.prank(buyer);
        escrow.cancelExpiredOrder(ORDER_ID);
    }

    function test_isCancellable_view() public {
        _createWithDeadline(block.number + 100);
        assertFalse(escrow.isCancellable(ORDER_ID));
        vm.roll(block.number + 101);
        assertTrue(escrow.isCancellable(ORDER_ID));
    }

    // ─── 卖家无理由退款 ───────────────────────────────────────────────────────

    function test_sellerRefund_fromEscrowHeld() public {
        _create();
        vm.prank(seller);
        escrow.sellerRefund(ORDER_ID);
        assertEq(usdt.balanceOf(buyer), 10 * ORDER_AMOUNT);
    }

    function test_sellerRefund_fromDelivered() public {
        _create();
        vm.prank(seller);
        escrow.markDelivered(ORDER_ID);
        vm.prank(seller);
        escrow.sellerRefund(ORDER_ID);
        assertEq(usdt.balanceOf(buyer), 10 * ORDER_AMOUNT);
    }

    function test_sellerRefund_fromDisputed() public {
        _create();
        vm.prank(seller);
        escrow.markDelivered(ORDER_ID);
        vm.prank(buyer);
        escrow.raiseDispute(ORDER_ID);
        vm.prank(seller);
        escrow.sellerRefund(ORDER_ID);
        assertEq(usdt.balanceOf(buyer), 10 * ORDER_AMOUNT);
    }

    function test_sellerRefund_onlySeller() public {
        _create();
        vm.expectRevert(AgentEscrow.Unauthorized.selector);
        vm.prank(buyer);
        escrow.sellerRefund(ORDER_ID);
    }

    // ─── 纠纷流程 ─────────────────────────────────────────────────────────────

    function test_dispute_fullRefund_waivesFee() public {
        vm.prank(owner);
        escrow.setFee(500);
        _create();
        vm.prank(seller);
        escrow.markDelivered(ORDER_ID);
        vm.prank(buyer);
        escrow.raiseDispute(ORDER_ID);

        vm.prank(arbitrator);
        escrow.resolveDispute(ORDER_ID, 10_000);
        assertEq(usdt.balanceOf(buyer), 10 * ORDER_AMOUNT);
        assertEq(usdt.balanceOf(feeRecipient), 0);
    }

    function test_dispute_partialRefund_chargesFee() public {
        vm.prank(owner);
        escrow.setFee(500);
        _create();
        vm.prank(seller);
        escrow.markDelivered(ORDER_ID);
        vm.prank(buyer);
        escrow.raiseDispute(ORDER_ID);

        vm.prank(arbitrator);
        escrow.resolveDispute(ORDER_ID, 5_000);

        uint256 fee = (ORDER_AMOUNT * 500) / 10_000;
        uint256 net = ORDER_AMOUNT - fee;
        assertEq(usdt.balanceOf(seller), net / 2);
        assertEq(usdt.balanceOf(feeRecipient), fee);
    }

    function test_dispute_onlyArbitrator() public {
        _create();
        vm.prank(seller);
        escrow.markDelivered(ORDER_ID);
        vm.prank(buyer);
        escrow.raiseDispute(ORDER_ID);

        vm.expectRevert(AgentEscrow.Unauthorized.selector);
        vm.prank(buyer);
        escrow.resolveDispute(ORDER_ID, 10_000);

        vm.expectRevert(AgentEscrow.Unauthorized.selector);
        vm.prank(owner);
        escrow.resolveDispute(ORDER_ID, 10_000);
    }

    // ─── 强制中断 ─────────────────────────────────────────────────────────────

    function test_forceInterrupt_freezesOrder() public {
        _create();
        vm.prank(owner);
        escrow.forceInterrupt(ORDER_ID, "suspicious");

        AgentEscrow.Order memory o = escrow.getOrder(ORDER_ID);
        assertEq(uint8(o.status), uint8(AgentEscrow.OrderStatus.Interrupted));

        vm.expectRevert();
        vm.prank(buyer);
        escrow.confirmDelivery(ORDER_ID);

        vm.expectRevert();
        vm.prank(seller);
        escrow.markDelivered(ORDER_ID);

        vm.expectRevert();
        vm.prank(seller);
        escrow.sellerRefund(ORDER_ID);
    }

    function test_forceInterrupt_onlyOwner() public {
        _create();
        vm.expectRevert();
        vm.prank(buyer);
        escrow.forceInterrupt(ORDER_ID, "x");
    }

    // ─── 紧急救援 ─────────────────────────────────────────────────────────────

    function test_rescueTokens_ownerCanWithdraw() public {
        _create();
        vm.prank(owner);
        escrow.forceInterrupt(ORDER_ID, "manual");

        vm.prank(owner);
        escrow.rescueTokens(address(usdt), rescueTo, ORDER_AMOUNT);
        assertEq(usdt.balanceOf(rescueTo), ORDER_AMOUNT);
    }

    function test_rescueTokens_onlyOwner() public {
        _create();
        vm.expectRevert();
        vm.prank(buyer);
        escrow.rescueTokens(address(usdt), rescueTo, ORDER_AMOUNT);
    }

    // ─── 暂停 ─────────────────────────────────────────────────────────────────

    function test_pause_blocksNewOrders() public {
        vm.prank(owner);
        escrow.pause();

        vm.expectRevert(); // Pausable: paused
        vm.prank(buyer);
        escrow.createOrder(ORDER_ID, seller, address(usdt), ORDER_AMOUNT, 0, 0, METADATA);
    }

    function test_pause_doesNotBlockExistingOrders() public {
        _create();
        vm.prank(owner);
        escrow.pause();

        // 已有订单仍可正常流转
        vm.prank(seller);
        escrow.markDelivered(ORDER_ID);
        vm.prank(buyer);
        escrow.confirmDelivery(ORDER_ID);
        assertEq(usdt.balanceOf(seller), ORDER_AMOUNT);
    }

    function test_unpause_restoresOrderCreation() public {
        vm.startPrank(owner);
        escrow.pause();
        escrow.unpause();
        vm.stopPrank();
        _create(); // 不应 revert
    }

    function test_pause_onlyOwner() public {
        vm.expectRevert();
        vm.prank(buyer);
        escrow.pause();
    }

    // ─── 两步交接 Owner ───────────────────────────────────────────────────────

    function test_ownership_twoStepTransfer() public {
        address newOwner = makeAddr("newOwner");

        vm.prank(owner);
        escrow.transferOwnership(newOwner);

        // 旧 owner 仍然是 owner，直到 newOwner 接受
        assertEq(escrow.owner(), owner);
        assertEq(escrow.pendingOwner(), newOwner);

        vm.prank(newOwner);
        escrow.acceptOwnership();
        assertEq(escrow.owner(), newOwner);
    }

    // ─── 视图与预览 ───────────────────────────────────────────────────────────

    function test_previewFee() public {
        vm.prank(owner);
        escrow.setFee(250);
        assertEq(escrow.previewFee(1_000_000), 25_000);
    }
}
