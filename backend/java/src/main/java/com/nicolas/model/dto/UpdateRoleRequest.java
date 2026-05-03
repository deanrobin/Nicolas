package com.nicolas.model.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public class UpdateRoleRequest {

    @NotBlank
    @Pattern(regexp = "buyer|seller|both", message = "Role must be buyer, seller, or both")
    private String role;

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }
}
