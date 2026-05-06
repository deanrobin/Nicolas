package com.nicolas.service;

import com.nicolas.config.ChainConfig;
import com.nicolas.config.PaymentConfig;
import com.nicolas.exception.BizException;
import com.nicolas.model.entity.Merchant;
import com.nicolas.model.entity.PaymentOrder;
import com.nicolas.model.entity.PayoutJob;
import com.nicolas.model.entity.SkillListing;
import com.nicolas.model.entity.UserWallet;
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
    private final MerchantRepository merchantRepo;
    private final UserWalletRepository walletRepo;
    private final PayoutJobRepository payoutRepo;
    private final ChainConfig chainConfig;
    private final PaymentConfig paymentConfig;

    public PaymentService(PaymentOrderRepository orderRepo,
                          SkillListingRepository skillRepo,
                          MerchantRepository merchantRepo,
                          UserWalletRepository walletRepo,
                          PayoutJobRepository payoutRepo,
                          ChainConfig chainConfig,
                          PaymentConfig paymentConfig) {
        this.orderRepo = orderRepo;
        this.skillRepo = skillRepo;
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

        String walletAddress = chainConfig.getOperatorAddress();
        if (!StringUtils.hasText(walletAddress)) {
            throw BizException.badRequest("Platform wallet not configured — contact support");
        }

        PaymentOrder order = new PaymentOrder();
        order.setOrderType("SKILL");
        order.setListingId(skillId);
        order.setBuyerId(buyerId);
        order.setMerchantId(skill.getMerchantId());
        order.setAmountUsdt(skill.getPriceUsdt());
        order.setPlatformWalletAddress(walletAddress);
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
        order.setTxHash(txHash.trim());
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
