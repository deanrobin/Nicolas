// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {AgentEscrow} from "../src/AgentEscrow.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Minimal mock USDC for testing
contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract AgentEscrowTest is Test {
    AgentEscrow escrow;
    MockUSDC usdc;

    address owner = makeAddr("owner");
    address feeRecipient = makeAddr("feeRecipient");
    address arbitrator = makeAddr("arbitrator");
    address buyer = makeAddr("buyer");
    address seller = makeAddr("seller");

    uint256 constant FEE_BPS = 250; // 2.5%
    uint256 constant ORDER_AMOUNT = 1_000_000; // 1 USDC (6 decimals)

    bytes32 constant ORDER_ID = keccak256("order_abc123");

    function setUp() public {
        vm.startPrank(owner);
        escrow = new AgentEscrow(feeRecipient, arbitrator, FEE_BPS);
        vm.stopPrank();

        usdc = new MockUSDC();
        usdc.mint(buyer, 10 * ORDER_AMOUNT);

        vm.prank(buyer);
        usdc.approve(address(escrow), type(uint256).max);
    }

    function _createOrder() internal {
        vm.prank(buyer);
        escrow.createOrder(ORDER_ID, seller, address(usdc), ORDER_AMOUNT, block.timestamp + 1 days, 0);
    }

    // ─── createOrder ──────────────────────────────────────────────────────────

    function test_createOrder_lockedFunds() public {
        _createOrder();
        assertEq(usdc.balanceOf(address(escrow)), ORDER_AMOUNT);
        (address b, address s,,,,,,,AgentEscrow.OrderStatus status) = _unpackOrder(ORDER_ID);
        assertEq(b, buyer);
        assertEq(s, seller);
        assertEq(uint8(status), uint8(AgentEscrow.OrderStatus.EscrowHeld));
    }

    function test_createOrder_reverts_duplicate() public {
        _createOrder();
        vm.expectRevert(AgentEscrow.OrderAlreadyExists.selector);
        vm.prank(buyer);
        escrow.createOrder(ORDER_ID, seller, address(usdc), ORDER_AMOUNT, block.timestamp + 1 days, 0);
    }

    function test_createOrder_reverts_zeroAmount() public {
        vm.expectRevert(AgentEscrow.ZeroAmount.selector);
        vm.prank(buyer);
        escrow.createOrder(ORDER_ID, seller, address(usdc), 0, block.timestamp + 1 days, 0);
    }

    // ─── Happy path: confirm delivery ─────────────────────────────────────────

    function test_confirmDelivery_releaseFunds() public {
        _createOrder();
        vm.prank(buyer);
        escrow.confirmDelivery(ORDER_ID);

        uint256 expectedFee = (ORDER_AMOUNT * FEE_BPS) / 10_000;
        assertEq(usdc.balanceOf(seller), ORDER_AMOUNT - expectedFee);
        assertEq(usdc.balanceOf(feeRecipient), expectedFee);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    // ─── Happy path: auto-release ─────────────────────────────────────────────

    function test_autoRelease_afterWindow() public {
        _createOrder();
        vm.prank(seller);
        escrow.markDelivered(ORDER_ID);

        vm.warp(block.timestamp + 49 hours);
        escrow.autoRelease(ORDER_ID);

        uint256 expectedFee = (ORDER_AMOUNT * FEE_BPS) / 10_000;
        assertEq(usdc.balanceOf(seller), ORDER_AMOUNT - expectedFee);
    }

    function test_autoRelease_reverts_windowOpen() public {
        _createOrder();
        vm.prank(seller);
        escrow.markDelivered(ORDER_ID);

        vm.expectRevert(AgentEscrow.DisputeWindowStillOpen.selector);
        escrow.autoRelease(ORDER_ID);
    }

    // ─── Dispute: full refund ─────────────────────────────────────────────────

    function test_dispute_fullRefund() public {
        _createOrder();
        vm.prank(seller);
        escrow.markDelivered(ORDER_ID);

        vm.prank(buyer);
        escrow.raiseDispute(ORDER_ID);

        vm.prank(arbitrator);
        escrow.resolveDispute(ORDER_ID, 10_000);

        assertEq(usdc.balanceOf(buyer), 10 * ORDER_AMOUNT); // got everything back
        assertEq(usdc.balanceOf(seller), 0);
        assertEq(usdc.balanceOf(feeRecipient), 0); // fee waived on full refund
    }

    // ─── Dispute: partial refund (50/50) ──────────────────────────────────────

    function test_dispute_partialRefund() public {
        _createOrder();
        vm.prank(seller);
        escrow.markDelivered(ORDER_ID);

        vm.prank(buyer);
        escrow.raiseDispute(ORDER_ID);

        vm.prank(arbitrator);
        escrow.resolveDispute(ORDER_ID, 5_000); // 50% to buyer

        uint256 fee = (ORDER_AMOUNT * FEE_BPS) / 10_000;
        uint256 net = ORDER_AMOUNT - fee;
        assertEq(usdc.balanceOf(buyer), 10 * ORDER_AMOUNT - ORDER_AMOUNT + net / 2);
        assertEq(usdc.balanceOf(seller), net / 2);
        assertEq(usdc.balanceOf(feeRecipient), fee);
    }

    // ─── Dispute: no refund (full release to seller) ──────────────────────────

    function test_dispute_noRefund() public {
        _createOrder();
        vm.prank(seller);
        escrow.markDelivered(ORDER_ID);

        vm.prank(buyer);
        escrow.raiseDispute(ORDER_ID);

        vm.prank(arbitrator);
        escrow.resolveDispute(ORDER_ID, 0);

        uint256 fee = (ORDER_AMOUNT * FEE_BPS) / 10_000;
        assertEq(usdc.balanceOf(seller), ORDER_AMOUNT - fee);
        assertEq(usdc.balanceOf(feeRecipient), fee);
    }

    // ─── Access control ───────────────────────────────────────────────────────

    function test_resolveDispute_onlyArbitrator() public {
        _createOrder();
        vm.prank(seller);
        escrow.markDelivered(ORDER_ID);
        vm.prank(buyer);
        escrow.raiseDispute(ORDER_ID);

        vm.expectRevert(AgentEscrow.Unauthorized.selector);
        vm.prank(buyer);
        escrow.resolveDispute(ORDER_ID, 10_000);
    }

    function test_raiseDispute_afterWindowReverts() public {
        _createOrder();
        vm.prank(seller);
        escrow.markDelivered(ORDER_ID);

        vm.warp(block.timestamp + 49 hours);

        vm.expectRevert(AgentEscrow.DisputeWindowExpired.selector);
        vm.prank(buyer);
        escrow.raiseDispute(ORDER_ID);
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function test_setFee_onlyOwner() public {
        vm.prank(owner);
        escrow.setFee(500);
        assertEq(escrow.feeBps(), 500);

        vm.expectRevert();
        vm.prank(buyer);
        escrow.setFee(100);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    function _unpackOrder(bytes32 id)
        internal
        view
        returns (
            address b,
            address s,
            address token,
            uint256 amount,
            uint256 fee,
            uint256 deliverBy,
            uint256 disputeWindow,
            uint256 deliveredAt,
            AgentEscrow.OrderStatus status
        )
    {
        AgentEscrow.Order memory o = escrow.getOrder(id);
        return (o.buyer, o.seller, o.token, o.amount, o.fee, o.deliverBy, o.disputeWindow, o.deliveredAt, o.status);
    }
}
