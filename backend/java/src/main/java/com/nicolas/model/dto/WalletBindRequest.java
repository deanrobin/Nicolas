package com.nicolas.model.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public class WalletBindRequest {

    @NotBlank
    @Pattern(regexp = "^0x[0-9a-fA-F]{40}$", message = "Invalid EVM address")
    private String address;

    @NotBlank(message = "Signature is required")
    private String signature;

    public String getAddress() { return address; }
    public void setAddress(String address) { this.address = address; }

    public String getSignature() { return signature; }
    public void setSignature(String signature) { this.signature = signature; }
}
