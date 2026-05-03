-- =============================================================================
-- Agents Bazaar — 数据库迁移记录
-- 规则：只追加，禁止修改或删除已有内容；每次变更在文件末尾追加新块
-- =============================================================================

-- -----------------------------------------------------------------------------
-- [2026-05-03] V001 初始化建库建表
-- -----------------------------------------------------------------------------

CREATE DATABASE IF NOT EXISTS agents_bazaar
    DEFAULT CHARACTER SET utf8mb4
    DEFAULT COLLATE utf8mb4_unicode_ci;

USE agents_bazaar;

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id            BIGINT       NOT NULL AUTO_INCREMENT,
    email         VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    nickname      VARCHAR(100) NOT NULL,
    avatar_url    VARCHAR(500),
    role          VARCHAR(20)  NOT NULL DEFAULT 'buyer' COMMENT 'buyer | seller | both',
    email_verified TINYINT(1)  NOT NULL DEFAULT 0,
    created_at    DATETIME     NOT NULL,
    updated_at    DATETIME     NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 钱包绑定表
CREATE TABLE IF NOT EXISTS user_wallets (
    id       BIGINT      NOT NULL AUTO_INCREMENT,
    user_id  BIGINT      NOT NULL,
    chain    VARCHAR(20) NOT NULL DEFAULT 'evm',
    address  VARCHAR(42) NOT NULL,
    bound_at DATETIME    NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_user_wallets_address (address),
    KEY idx_user_wallets_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 邮箱验证码表
CREATE TABLE IF NOT EXISTS email_verifications (
    id         BIGINT      NOT NULL AUTO_INCREMENT,
    email      VARCHAR(255) NOT NULL,
    code       VARCHAR(10)  NOT NULL,
    expires_at DATETIME     NOT NULL,
    used       TINYINT(1)   NOT NULL DEFAULT 0,
    created_at DATETIME     NOT NULL,
    PRIMARY KEY (id),
    KEY idx_email_verifications_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 钱包签名 nonce 表
CREATE TABLE IF NOT EXISTS wallet_nonces (
    id         BIGINT      NOT NULL AUTO_INCREMENT,
    user_id    BIGINT      NOT NULL,
    nonce      VARCHAR(64) NOT NULL,
    expires_at DATETIME    NOT NULL,
    used       TINYINT(1)  NOT NULL DEFAULT 0,
    created_at DATETIME    NOT NULL,
    PRIMARY KEY (id),
    KEY idx_wallet_nonces_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
