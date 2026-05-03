package com.nicolas.model.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public class MerchantRegisterRequest {

    @NotBlank
    @Size(max = 100)
    private String brandName;

    @Size(max = 2000)
    private String description;

    @Size(max = 255)
    private String contactEmail;

    @Size(max = 255)
    private String website;

    /** individual | studio | company */
    private String category;

    public String getBrandName() { return brandName; }
    public void setBrandName(String brandName) { this.brandName = brandName; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getContactEmail() { return contactEmail; }
    public void setContactEmail(String contactEmail) { this.contactEmail = contactEmail; }
    public String getWebsite() { return website; }
    public void setWebsite(String website) { this.website = website; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
}
