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
    uint256 constant ORDER_AMOUNT = 1_000_000; // 1 USDT (6 decimals)
    bytes32 constant ORDER_ID = keccak256("order_001");

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
        escrow.createOrder(ORDER_ID, seller, address(usdt), ORDER_AMOUNT, 0);
    }

    // ─── 白名单 ───────────────────────────────────────────────────────────────

    function test_initialToken_isWhitelisted() public view {
        assertTrue(escrow.whitelistedTokens(address(usdt)));
    }

    function test_createOrder_revertsForNonWhitelistedToken() public {
        vm.expectRevert(abi.encodeWithSelector(AgentEscrow.TokenNotWhitelisted.selector, address(otherToken)));
        vm.prank(buyer);
        escrow.createOrder(ORDER_ID, seller, address(otherToken), ORDER_AMOUNT, 0);
    }

    function test_owner_canWhitelistAndRevoke() public {
        vm.prank(owner);
        escrow.setTokenWhitelist(address(otherToken), true);
        assertTrue(escrow.whitelistedTokens(address(otherToken)));

        vm.prank(buyer);
        escrow.createOrder(ORDER_ID, seller, address(otherToken), ORDER_AMOUNT, 0);

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

    function test_createOrder_locksFunds() public {
        _create();
        assertEq(usdt.balanceOf(address(escrow)), ORDER_AMOUNT);
        AgentEscrow.Order memory o = escrow.getOrder(ORDER_ID);
        assertEq(o.buyer, buyer);
        assertEq(o.seller, seller);
        assertEq(o.amount, ORDER_AMOUNT);
        assertEq(o.lockBlocks, escrow.defaultLockBlocks());
        assertEq(uint8(o.status), uint8(AgentEscrow.OrderStatus.EscrowHeld));
    }

    function test_createOrder_customLockBlocks() public {
        vm.prank(buyer);
        escrow.createOrder(ORDER_ID, seller, address(usdt), ORDER_AMOUNT, 100);
        AgentEscrow.Order memory o = escrow.getOrder(ORDER_ID);
        assertEq(o.lockBlocks, 100);
    }

    function test_createOrder_revertsForDuplicate() public {
        _create();
        vm.expectRevert(AgentEscrow.OrderAlreadyExists.selector);
        vm.prank(buyer);
        escrow.createOrder(ORDER_ID, seller, address(usdt), ORDER_AMOUNT, 0);
    }

    // ─── 立即确认 ─────────────────────────────────────────────────────────────

    function test_confirmDelivery_releasesFunds() public {
        _create();
        vm.prank(buyer);
        escrow.confirmDelivery(ORDER_ID);
        assertEq(usdt.balanceOf(seller), ORDER_AMOUNT); // fee = 0
        assertEq(usdt.balanceOf(address(escrow)), 0);
    }

    // ─── 区块锁定 + 自动放款 ──────────────────────────────────────────────────

    function test_autoRelease_revertsBeforeLockExpires() public {
        _create();
        vm.prank(seller);
        escrow.markDelivered(ORDER_ID);

        // 锁定期内
        vm.roll(block.number + escrow.defaultLockBlocks());
        vm.expectRevert(AgentEscrow.LockStillActive.selector);
        escrow.autoRelease(ORDER_ID);
    }

    function test_autoRelease_succeedsAfterLockExpires() public {
        _create();
        vm.prank(seller);
        escrow.markDelivered(ORDER_ID);

        vm.roll(block.number + escrow.defaultLockBlocks() + 1);
        // 任意人都可触发
        address keeper = makeAddr("keeper");
        vm.prank(keeper);
        escrow.autoRelease(ORDER_ID);

        assertEq(usdt.balanceOf(seller), ORDER_AMOUNT);
    }

    function test_isReleasable_view() public {
        _create();
        vm.prank(seller);
        escrow.markDelivered(ORDER_ID);

        assertFalse(escrow.isReleasable(ORDER_ID));
        vm.roll(block.number + escrow.defaultLockBlocks() + 1);
        assertTrue(escrow.isReleasable(ORDER_ID));
    }

    // ─── 纠纷流程 ─────────────────────────────────────────────────────────────

    function test_raiseDispute_revertsAfterLockExpires() public {
        _create();
        vm.prank(seller);
        escrow.markDelivered(ORDER_ID);
        vm.roll(block.number + escrow.defaultLockBlocks() + 1);

        vm.expectRevert(AgentEscrow.LockExpired.selector);
        vm.prank(buyer);
        escrow.raiseDispute(ORDER_ID);
    }

    function test_dispute_fullRefund_waivesFee() public {
        vm.prank(owner);
        escrow.setFee(500); // 5% fee
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
        escrow.setFee(500); // 5%
        _create();
        vm.prank(seller);
        escrow.markDelivered(ORDER_ID);
        vm.prank(buyer);
        escrow.raiseDispute(ORDER_ID);

        vm.prank(arbitrator);
        escrow.resolveDispute(ORDER_ID, 5_000); // 50% to buyer

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
        escrow.forceInterrupt(ORDER_ID, "suspicious activity");

        AgentEscrow.Order memory o = escrow.getOrder(ORDER_ID);
        assertEq(uint8(o.status), uint8(AgentEscrow.OrderStatus.Interrupted));

        // 中断后所有正常流转都失败
        vm.expectRevert();
        vm.prank(buyer);
        escrow.confirmDelivery(ORDER_ID);

        vm.expectRevert();
        vm.prank(seller);
        escrow.markDelivered(ORDER_ID);
    }

    function test_forceInterrupt_onlyOwner() public {
        _create();
        vm.expectRevert();
        vm.prank(buyer);
        escrow.forceInterrupt(ORDER_ID, "x");
    }

    function test_forceInterrupt_worksOnDeliveredAndDisputed() public {
        _create();
        vm.prank(seller);
        escrow.markDelivered(ORDER_ID);
        vm.prank(owner);
        escrow.forceInterrupt(ORDER_ID, "delivered phase");

        bytes32 id2 = keccak256("order_002");
        vm.prank(buyer);
        escrow.createOrder(id2, seller, address(usdt), ORDER_AMOUNT, 0);
        vm.prank(seller);
        escrow.markDelivered(id2);
        vm.prank(buyer);
        escrow.raiseDispute(id2);
        vm.prank(owner);
        escrow.forceInterrupt(id2, "disputed phase");
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

    function test_rescueTokens_worksForAnyToken() public {
        // 误转入的非白名单 token 也能救出
        otherToken.mint(address(escrow), 500);
        vm.prank(owner);
        escrow.rescueTokens(address(otherToken), rescueTo, 500);
        assertEq(otherToken.balanceOf(rescueTo), 500);
    }

    // ─── 管理员配置 ───────────────────────────────────────────────────────────

    function test_setFee_capped() public {
        vm.prank(owner);
        vm.expectRevert(AgentEscrow.FeeTooHigh.selector);
        escrow.setFee(1001);

        vm.prank(owner);
        escrow.setFee(1000);
        assertEq(escrow.feeBps(), 1000);
    }

    function test_setDefaultLockBlocks() public {
        vm.prank(owner);
        escrow.setDefaultLockBlocks(100);
        assertEq(escrow.defaultLockBlocks(), 100);
    }

    function test_setArbitrator() public {
        address newArb = makeAddr("newArb");
        vm.prank(owner);
        escrow.setArbitrator(newArb);
        assertEq(escrow.arbitrator(), newArb);
    }
}
