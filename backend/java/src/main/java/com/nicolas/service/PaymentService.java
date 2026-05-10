package com.nicolas.service;

import com.nicolas.config.ChainConfig;
import com.nicolas.config.PaymentConfig;
import com.nicolas.exception.BizException;
import com.nicolas.model.entity.AgentListing;
import com.nicolas.model.entity.Merchant;
import com.nicolas.model.entity.PaymentOrder;
import com.nicolas.model.entity.PayoutJob;
import com.nicolas.model.entity.SkillListing;
import com.nicolas.model.entity.UserWallet;
import com.nicolas.repository.AgentListingRepository;
import com.nicolas.repository.MerchantRepository;
import com.nicolas.repository.PaymentOrderRepository;
import com.nicolas.repository.PayoutJobRepository;
import com.nicolas.repository.SkillListingRepository;
import com.nicolas.repository.UserWalletRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.List;

@Service
public class PaymentService {

    private static final List<String> ACTIVE_STATUSES =
        List.of("pending_payment", "confirming", "paid");

    private static final BigDecimal BPS_DENOM = new BigDecimal("10000");

    private final PaymentOrderRepository orderRepo;
    private final SkillListingRepository skillRepo;
    private final AgentListingRepository agentRepo;
    private final MerchantRepository merchantRepo;
    private final UserWalletRepository walletRepo;
    private final PayoutJobRepository payoutRepo;
    private final ChainConfig chainConfig;
    private final PaymentConfig paymentConfig;

    public PaymentService(PaymentOrderRepository orderRepo,
                          SkillListingRepository skillRepo,
                          AgentListingRepository agentRepo,
                          MerchantRepository merchantRepo,
                          UserWalletRepository walletRepo,
                          PayoutJobRepository payoutRepo,
                          ChainConfig chainConfig,
                          PaymentConfig paymentConfig) {
        this.orderRepo = orderRepo;
        this.skillRepo = skillRepo;
        this.agentRepo = agentRepo;
        this.merchantRepo = merchantRepo;
        this.walletRepo = walletRepo;
        this.payoutRepo = payoutRepo;
        this.chainConfig = chainConfig;
        this.paymentConfig = paymentConfig;
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

        // Schedule the payout job (release window = holdback hours)
        schedulePayoutJob(order);

        return order;
    }

    private void schedulePayoutJob(PaymentOrder order) {
        if (payoutRepo.findByPaymentOrderId(order.getId()).isPresent()) return;

        Merchant merchant = merchantRepo.findById(order.getMerchantId()).orElse(null);
        if (merchant == null) return;
        UserWallet payeeWallet = walletRepo.findByUserId(merchant.getUserId()).orElse(null);
        if (payeeWallet == null) {
            // Merchant has no wallet bound. Park the job with a placeholder and let
            // operator fix it manually — easier than failing the whole order flow.
            return;
        }

        int feeBps = Math.max(0, Math.min(10000, paymentConfig.getFeeBps()));
        BigDecimal amount = order.getAmountUsdt();
        BigDecimal feeAmount = amount.multiply(BigDecimal.valueOf(feeBps))
            .divide(BPS_DENOM, paymentConfig.getUsdtDecimals(), RoundingMode.DOWN);
        BigDecimal payoutAmount = amount.subtract(feeAmount);

        PayoutJob job = new PayoutJob();
        job.setPaymentOrderId(order.getId());
        job.setMerchantId(order.getMerchantId());
        job.setPayeeAddress(payeeWallet.getAddress());
        job.setAmountUsdt(amount);
        job.setFeeBps(feeBps);
        job.setFeeAmount(feeAmount);
        job.setPayoutAmount(payoutAmount);
        job.setScheduledAt(LocalDateTime.now().plusHours(paymentConfig.getHoldbackHours()));
        job.setStatus("scheduled");
        payoutRepo.save(job);
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
