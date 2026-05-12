package com.nicolas.service;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONArray;
import com.alibaba.fastjson2.JSONObject;
import com.nicolas.config.PaymentConfig;
import com.nicolas.exception.BizException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.Base64;
import java.util.Map;

/**
 * Thin HMAC-signed client for the OKX Facilitator x402 endpoints
 * ({@code /api/v6/pay/x402/verify} and {@code /settle}).
 *
 * <p>Reuses the OnchainOS API key / secret / passphrase (same OKX account) but
 * speaks to a distinct host root ({@code https://web3.okx.com}), so it has its
 * own {@link WebClient}. Body is serialized to compact JSON via FastJSON and
 * the exact same byte string is fed into the HMAC prehash to avoid drift between
 * "what we signed" and "what we sent".
 */
@Service
public class OkxFacilitatorClient {

    private static final Logger log = LoggerFactory.getLogger(OkxFacilitatorClient.class);

    private static final DateTimeFormatter ISO_UTC =
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(java.time.ZoneOffset.UTC);

    private static final String VERIFY_PATH = "/api/v6/pay/x402/verify";
    private static final String SETTLE_PATH = "/api/v6/pay/x402/settle";

    private final WebClient client;
    private final PaymentConfig paymentConfig;
    private final String apiKey;
    private final String apiSecret;
    private final String passphrase;

    public OkxFacilitatorClient(
            PaymentConfig paymentConfig,
            @Value("${onchainos.api-key:}")     String apiKey,
            @Value("${onchainos.api-secret:}")  String apiSecret,
            @Value("${onchainos.passphrase:}")  String passphrase) {
        this.paymentConfig = paymentConfig;
        this.apiKey = apiKey;
        this.apiSecret = apiSecret;
        this.passphrase = passphrase;
        this.client = WebClient.builder()
                .baseUrl(paymentConfig.getX402().getFacilitatorBaseUrl())
                .build();
    }

    /** True iff API key + secret + passphrase are all populated. */
    public boolean isConfigured() {
        return StringUtils.hasText(apiKey)
            && StringUtils.hasText(apiSecret)
            && StringUtils.hasText(passphrase);
    }

    /**
     * Call OKX {@code /verify}. Returns the parsed {@code data} object, or
     * throws {@link BizException} on transport / HTTP / OKX-level error.
     */
    public JSONObject verify(Object paymentPayload, Object paymentRequirements) {
        Map<String, Object> body = Map.of(
                "x402Version",         paymentConfig.getX402().getVersion(),
                "paymentPayload",      paymentPayload,
                "paymentRequirements", paymentRequirements
        );
        return signedPost(VERIFY_PATH, body);
    }

    /**
     * Call OKX {@code /settle}. With {@code syncSettle = true} (the default
     * configured value) OKX blocks until the transaction is on-chain before
     * returning, so the response {@code data.transaction} is the canonical
     * tx hash we can record on the order.
     */
    public JSONObject settle(Object paymentPayload, Object paymentRequirements) {
        Map<String, Object> body = Map.of(
                "x402Version",         paymentConfig.getX402().getVersion(),
                "paymentPayload",      paymentPayload,
                "paymentRequirements", paymentRequirements,
                "syncSettle",          paymentConfig.getX402().isSyncSettle()
        );
        return signedPost(SETTLE_PATH, body);
    }

    private JSONObject signedPost(String path, Map<String, Object> body) {
        if (!isConfigured()) {
            throw BizException.badRequest(
                "OKX x402 credentials missing — set ONCHAINOS_API_KEY / _SECRET / _PASSPHRASE");
        }

        String bodyJson = JSON.toJSONString(body);
        String timestamp = ISO_UTC.format(Instant.now());
        String sign = base64HmacSha256(apiSecret, timestamp + "POST" + path + bodyJson);

        try {
            // Read as String, then JSON.parseObject — bodyToMono(JSONObject.class)
            // would route through Spring's default WebClient codec (Jackson, since
            // FastJsonHttpMessageConverter is only registered with Spring MVC, not
            // WebClient). Jackson's MapDeserializer materialises nested objects as
            // plain LinkedHashMap, so subsequent `data instanceof JSONObject` checks
            // silently fail and we lose every nested field. Parsing via FastJSON2
            // explicitly guarantees JSONObject all the way down the tree.
            String raw = client.post()
                    .uri(path)
                    .header("OK-ACCESS-KEY",        apiKey)
                    .header("OK-ACCESS-SIGN",       sign)
                    .header("OK-ACCESS-PASSPHRASE", passphrase)
                    .header("OK-ACCESS-TIMESTAMP",  timestamp)
                    .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                    .bodyValue(bodyJson)
                    .retrieve()
                    .bodyToMono(String.class)
                    .block();

            if (!StringUtils.hasText(raw)) {
                throw new BizException(502, "OKX " + path + " returned no body");
            }
            log.info("OKX {} response: {}", path, raw);

            JSONObject parsed;
            try {
                parsed = JSON.parseObject(raw);
            } catch (Exception parseErr) {
                throw new BizException(502,
                    "OKX " + path + " returned non-JSON body: " + truncate(raw));
            }

            String code = parsed.getString("code");
            if (code != null && !"0".equals(code)) {
                log.warn("OKX {} returned non-zero code: {}", path, parsed);
                throw new BizException(502,
                    "OKX " + path + " error: code=" + code + " msg=" + parsed.getString("msg"));
            }
            return extractDataObject(parsed);
        } catch (WebClientResponseException e) {
            int status = e.getStatusCode().value();
            log.warn("OKX {} HTTP {}: {}", path, status, e.getResponseBodyAsString());
            throw new BizException(502,
                "OKX " + path + " HTTP " + status + " — check API credentials / region");
        }
    }

    /**
     * OKX wraps payloads as {@code data: {...}} or {@code data: [{...}]}. Tolerates
     * raw {@link Map} / {@link java.util.List} forms in case the response slipped
     * past the FastJSON2 parse path (e.g. a third party patches the codec).
     */
    private static JSONObject extractDataObject(JSONObject raw) {
        Object data = raw.get("data");
        if (data instanceof JSONObject obj) return obj;
        if (data instanceof Map<?, ?> map) return new JSONObject((Map<String, Object>) coerceMap(map));
        if (data instanceof JSONArray arr && !arr.isEmpty()) {
            Object first = arr.get(0);
            if (first instanceof JSONObject obj2) return obj2;
            if (first instanceof Map<?, ?> firstMap) {
                return new JSONObject((Map<String, Object>) coerceMap(firstMap));
            }
        }
        if (data instanceof java.util.List<?> list && !list.isEmpty()) {
            Object first = list.get(0);
            if (first instanceof JSONObject obj3) return obj3;
            if (first instanceof Map<?, ?> firstMap) {
                return new JSONObject((Map<String, Object>) coerceMap(firstMap));
            }
        }
        return new JSONObject();
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> coerceMap(Map<?, ?> m) {
        return (Map<String, Object>) m;
    }

    private static String truncate(String s) {
        if (s == null) return "";
        return s.length() > 500 ? s.substring(0, 500) + "…" : s;
    }

    private static String base64HmacSha256(String secret, String prehash) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] digest = mac.doFinal(prehash.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(digest);
        } catch (Exception e) {
            throw new IllegalStateException("HMAC-SHA256 init failed", e);
        }
    }
}
