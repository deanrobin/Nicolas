package com.nicolas.service;

import com.nicolas.config.ChainConfig;
import com.nicolas.exception.BizException;
import com.nicolas.model.entity.PaymentOrder;
import com.nicolas.model.entity.SkillListing;
import com.nicolas.repository.MerchantRepository;
import com.nicolas.repository.PaymentOrderRepository;
import com.nicolas.repository.SkillListingRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.List;

@Service
public class PaymentService {

    private static final List<String> ACTIVE_STATUSES =
        List.of("pending_payment", "confirming", "paid");

    private final PaymentOrderRepository orderRepo;
    private final SkillListingRepository skillRepo;
    private final MerchantRepository merchantRepo;
    private final ChainConfig chainConfig;

    public PaymentService(PaymentOrderRepository orderRepo,
                          SkillListingRepository skillRepo,
                          MerchantRepository merchantRepo,
                          ChainConfig chainConfig) {
        this.orderRepo = orderRepo;
        this.skillRepo = skillRepo;
        this.merchantRepo = merchantRepo;
        this.chainConfig = chainConfig;
    }

    @Transactional
    public PaymentOrder createSkillOrder(Long buyerId, Long skillId) {
        SkillListing skill = skillRepo.findById(skillId)
            .orElseThrow(() -> BizException.notFound("Skill not found"));
        if (!"approved".equals(skill.getStatus())) {
            throw BizException.badRequest("Skill is not available for purchase");
        }

        // Prevent duplicate active orders
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
        return orderRepo.save(order);
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
