package com.nicolas.model.dto;

import jakarta.validation.constraints.*;
import java.math.BigDecimal;

public class AgentListingRequest {

    @NotBlank
    @Size(min = 2, max = 100)
    private String name;

    @NotBlank
    @Size(min = 20, max = 5000)
    private String description;

    @Size(max = 50)
    private String category;

    @NotNull
    @DecimalMin(value = "0.01", inclusive = true)
    @DecimalMax(value = "10000", inclusive = true)
    private BigDecimal priceUsdt;

    @Size(max = 500)
    private String apiEndpoint;

    @Size(max = 255)
    private String tags;

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public BigDecimal getPriceUsdt() { return priceUsdt; }
    public void setPriceUsdt(BigDecimal priceUsdt) { this.priceUsdt = priceUsdt; }
    public String getApiEndpoint() { return apiEndpoint; }
    public void setApiEndpoint(String apiEndpoint) { this.apiEndpoint = apiEndpoint; }
    public String getTags() { return tags; }
    public void setTags(String tags) { this.tags = tags; }
}
