package com.nicolas.model.dto;

import jakarta.validation.constraints.*;
import java.math.BigDecimal;

public class SkillListingRequest {

    @NotBlank
    @Size(max = 100)
    private String name;

    @NotBlank
    @Size(max = 2000)
    private String description;

    @Size(max = 50)
    private String category;

    @NotNull
    @DecimalMin(value = "0.0", inclusive = false)
    private BigDecimal priceUsdt;

    @Size(max = 500)
    private String downloadUrl;

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
    public String getDownloadUrl() { return downloadUrl; }
    public void setDownloadUrl(String downloadUrl) { this.downloadUrl = downloadUrl; }
    public String getTags() { return tags; }
    public void setTags(String tags) { this.tags = tags; }
}
