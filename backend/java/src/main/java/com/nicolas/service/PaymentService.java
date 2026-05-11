package com.nicolas.service;

import com.nicolas.config.ChainConfig;
import com.nicolas.exception.BizException;
import com.nicolas.model.entity.AgentListing;
import com.nicolas.model.entity.PaymentOrder;
import com.nicolas.model.entity.SkillListing;
import com.nicolas.model.entity.UserWallet;
import com.nicolas.repository.AgentListingRepository;
import com.nicolas.repository.PaymentOrderRepository;
import com.nicolas.repository.SkillListingRepository;
import com.nicolas.repository.UserWalletRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigInteger;
import java.util.List;

@Service
public class PaymentService {

    private static final Logger log = LoggerFactory.getLogger(PaymentService.class);

    private static final List<String> ACTIVE_STATUSES =
        List.of("pending_payment", "confirming", "paid");

    private final PaymentOrderRepository orderRepo;
    private final SkillListingRepository skillRepo;
    private final AgentListingRepository agentRepo;
    private final UserWalletRepository walletRepo;
    private final ChainConfig chainConfig;
    private final ChainQueryService chainQuery;
    private final PaymentConfirmationJob confirmationJob;

    public PaymentService(PaymentOrderRepository orderRepo,
                          SkillListingRepository skillRepo,
                          AgentListingRepository agentRepo,
                          UserWalletRepository walletRepo,
                          ChainConfig chainConfig,
                          ChainQueryService chainQuery,
                          PaymentConfirmationJob confirmationJob) {
        this.orderRepo = orderRepo;
        this.skillRepo = skillRepo;
        this.agentRepo = agentRepo;
        this.walletRepo = walletRepo;
        this.chainConfig = chainConfig;
        this.chainQuery = chainQuery;
        this.confirmationJob = confirmationJob;
    }

    @Transactional
    public PaymentOrder createSkillOrder(Long buyerId, Long skillId) {
        SkillListing skill = skillRepo.findById(skillId)
            .orElseThrow(() -> BizException.notFound("Skill not found"));
        if (!"approved".equals(skill.getStatus())) {
            throw BizException.badRequest("Skill is not available for purchase");
        }
        if (orderRepo.existsByBuyerIdAndListingIdAndOrderTypeAndStatusIn(
                buyerId, skillId, "SKILL", ACTIVE_STATUSES)) {
            throw BizException.conflict("You already have an active order for this skill");
        }
        return createOrder(buyerId, "SKILL", skillId, skill.getMerchantId(), skill.getPriceUsdt());
    }

    @Transactional
    public PaymentOrder createAgentOrder(Long buyerId, Long agentId) {
        AgentListing agent = agentRepo.findById(agentId)
            .orElseThrow(() -> BizException.notFound("Agent not found"));
        if (!"approved".equals(agent.getStatus())) {
            throw BizException.badRequest("Agent is not available for purchase");
        }
        if (orderRepo.existsByBuyerIdAndListingIdAndOrderTypeAndStatusIn(
                buyerId, agentId, "AGENT", ACTIVE_STATUSES)) {
            throw BizException.conflict("You already have an active order for this agent");
        }
        return createOrder(buyerId, "AGENT", agentId, agent.getMerchantId(), agent.getPriceUsdt());
    }

    /**
     * Common path for both kinds of buy. Snapshots the buyer's bound wallet
     * address onto the order so the confirmation job can later assert that the
     * on-chain {@code from} matches — this is the manual-pay flow's only defence
     * against a stranger pasting somebody else's tx hash to claim a free skill.
     */
    private PaymentOrder createOrder(Long buyerId, String orderType, Long listingId,
                                     Long merchantId, java.math.BigDecimal price) {
        UserWallet wallet = walletRepo.findByUserId(buyerId)
            .orElseThrow(() -> BizException.badRequest(
                "Bind a wallet under Settings → Wallet before buying"));

        String platformWallet = chainConfig.getOperatorAddress();
        if (!StringUtils.hasText(platformWallet)) {
            throw BizException.badRequest("Platform wallet not configured — contact support");
        }

        PaymentOrder order = new PaymentOrder();
        order.setOrderType(orderType);
        order.setListingId(listingId);
        order.setBuyerId(buyerId);
        order.setMerchantId(merchantId);
        order.setAmountUsdt(price);
        order.setPlatformWalletAddress(platformWallet);
        order.setBuyerWalletAddress(wallet.getAddress());
        order.setStatus("pending_payment");
        return orderRepo.save(order);
    }

    @Transactional
    public PaymentOrder submitTxHash(Long buyerId, Long orderId, String txHash) {
        PaymentOrder order = orderRepo.findById(orderId)
            .orElseThrow(() -> BizException.notFound("Order not found"));
        if (!order.getBuyerId().equals(buyerId)) {
            throw BizException.forbidden("Not your order");
        }
        if (!"pending_payment".equals(order.getStatus())) {
            throw BizException.badRequest("Order is already in status: " + order.getStatus());
        }
        if (!StringUtils.hasText(txHash)) {
            throw BizException.badRequest("tx_hash is required");
        }
        String normalized = txHash.trim().toLowerCase();
        if (!normalized.matches("^0x[0-9a-f]{64}$")) {
            throw BizException.badRequest("tx_hash must be 0x-prefixed 32-byte hex");
        }
        // Reject reuse early. The DB also has a UNIQUE(tx_hash) safeguard as a
        // backstop against the read-then-write race.
        orderRepo.findByTxHash(normalized).ifPresent(existing -> {
            throw BizException.conflict(
                "This tx hash is already attached to another order (id=" + existing.getId() + ")");
        });

        order.setTxHash(normalized);
        order.setStatus("confirming");
        orderRepo.save(order);

        // Payout is no longer scheduled inline — the weekly SettlementCutoffJob
        // creates payout_jobs for every paid + undisputed + unsettled order at
        // cutoff time (default Fri 12:00). This keeps manual-pay and x402 paths
        // on the same settlement cadence.
        //
        // Run the same confirmation pass the scheduler runs every 30s, once,
        // synchronously — when the buyer's tx is already mined with enough
        // confirmations (often the case if they paste the hash a few seconds
        // after broadcasting), the response can return `paid` immediately
        // instead of making them wait for the next scheduler tick. Any
        // failure (RPC down, not mined yet, mismatched receipt) just leaves
        // the order in `confirming` and the scheduler retries.
        try {
            BigInteger head = chainQuery.currentBlockNumber();
            confirmationJob.confirm(order, head);
        } catch (Exception e) {
            log.warn("Inline confirmation skipped for order {}: {}", order.getId(), e.getMessage());
        }

        return order;
    }

    public List<PaymentOrder> getMyOrders(Long buyerId) {
        return orderRepo.findByBuyerIdOrderByCreatedAtDesc(buyerId);
    }

    public PaymentOrder getOrder(Long buyerId, Long orderId) {
        PaymentOrder order = orderRepo.findById(orderId)
            .orElseThrow(() -> BizException.notFound("Order not found"));
        if (!order.getBuyerId().equals(buyerId)) {
            throw BizException.forbidden("Not your order");
        }
        return order;
    }
}
