package com.nicolas.service;

import com.alibaba.fastjson2.JSONObject;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.Map;

/**
 * Thin client for OnchainOS — used to broadcast pre-signed transactions
 * and to query transaction status. Auth headers (api key / secret /
 * passphrase / project id) are pulled from env vars; if none are
 * configured the client still works for endpoints that don't require auth.
 *
 * <p>Required env keys: ONCHAINOS_BASE_URL, ONCHAINOS_API_KEY,
 * ONCHAINOS_API_SECRET, ONCHAINOS_PASSPHRASE, ONCHAINOS_PROJECT_ID.
 */
@Service
public class OnchainOsClient {

    private final WebClient client;
    private final String apiKey;
    private final String passphrase;
    private final String projectId;

    public OnchainOsClient(
            @Value("${onchainos.base-url}") String baseUrl,
            @Value("${onchainos.api-key:}") String apiKey,
            @Value("${onchainos.passphrase:}") String passphrase,
            @Value("${onchainos.project-id:}") String projectId) {
        this.client = WebClient.builder().baseUrl(baseUrl).build();
        this.apiKey = apiKey;
        this.passphrase = passphrase;
        this.projectId = projectId;
    }

    /**
     * Broadcast a pre-signed raw transaction.
     *
     * <p>XLayer chain index in OKX OS is "196".
     */
    public JSONObject broadcastRawTx(String signedTx) {
        Map<String, Object> body = Map.of(
                "chainIndex", "196",
                "signedTx", signedTx
        );
        return client.post()
                .uri("/api/v5/wallet/pre-transaction/broadcast-transaction")
                .contentType(MediaType.APPLICATION_JSON)
                .headers(h -> {
                    if (StringUtils.hasText(apiKey))     h.add("OK-ACCESS-KEY", apiKey);
                    if (StringUtils.hasText(passphrase)) h.add("OK-ACCESS-PASSPHRASE", passphrase);
                    if (StringUtils.hasText(projectId))  h.add("OK-ACCESS-PROJECT", projectId);
                })
                .bodyValue(body)
                .retrieve()
                .bodyToMono(JSONObject.class)
                .block();
    }

    /**
     * Query a transaction's status by hash.
     */
    public JSONObject getTxStatus(String txHash) {
        return client.get()
                .uri(uri -> uri
                        .path("/api/v5/wallet/post-transaction/transaction-detail-by-txhash")
                        .queryParam("chainIndex", "196")
                        .queryParam("txHash", txHash)
                        .build())
                .headers(h -> {
                    if (StringUtils.hasText(apiKey))     h.add("OK-ACCESS-KEY", apiKey);
                    if (StringUtils.hasText(passphrase)) h.add("OK-ACCESS-PASSPHRASE", passphrase);
                    if (StringUtils.hasText(projectId))  h.add("OK-ACCESS-PROJECT", projectId);
                })
                .retrieve()
                .bodyToMono(JSONObject.class)
                .block();
    }
}
