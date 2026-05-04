-- =============================================================================
-- Nicolas — 数据库迁移记录
-- 规则：只追加，禁止修改或删除已有内容；每次变更在文件末尾追加新块
-- =============================================================================

-- -----------------------------------------------------------------------------
-- [2026-05-03] V001 初始化建库建表
-- -----------------------------------------------------------------------------

CREATE DATABASE IF NOT EXISTS nicolas
    DEFAULT CHARACTER SET utf8mb4
    DEFAULT COLLATE utf8mb4_unicode_ci;

USE nicolas;

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

-- -----------------------------------------------------------------------------
-- [2026-05-03] V002 商家入驻 + Agent/Skill 上架
-- -----------------------------------------------------------------------------

-- 商家表（一个用户最多一个商家身份）
CREATE TABLE IF NOT EXISTS merchants (
    id             BIGINT       NOT NULL AUTO_INCREMENT,
    user_id        BIGINT       NOT NULL,
    brand_name     VARCHAR(100) NOT NULL,
    description    TEXT,
    contact_email  VARCHAR(255),
    website        VARCHAR(255),
    category       VARCHAR(50)  COMMENT 'individual | studio | company',
    status         VARCHAR(20)  NOT NULL DEFAULT 'pending' COMMENT 'pending | approved | rejected',
    review_reason  VARCHAR(500),
    reviewed_at    DATETIME,
    created_at     DATETIME     NOT NULL,
    updated_at     DATETIME     NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_merchants_user_id (user_id),
    KEY idx_merchants_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Agent 上架（按次付费）
CREATE TABLE IF NOT EXISTS agent_listings (
    id             BIGINT        NOT NULL AUTO_INCREMENT,
    merchant_id    BIGINT        NOT NULL,
    name           VARCHAR(100)  NOT NULL,
    description    TEXT          NOT NULL,
    category       VARCHAR(50),
    price_usdt     DECIMAL(18,6) NOT NULL COMMENT '每次调用价格',
    api_endpoint   VARCHAR(500)  COMMENT '商家提供的 Agent 调用入口',
    tags           VARCHAR(255)  COMMENT '逗号分隔',
    status         VARCHAR(20)   NOT NULL DEFAULT 'pending' COMMENT 'pending | approved | rejected',
    review_reason  VARCHAR(500),
    reviewed_at    DATETIME,
    created_at     DATETIME      NOT NULL,
    updated_at     DATETIME      NOT NULL,
    PRIMARY KEY (id),
    KEY idx_agent_listings_merchant_id (merchant_id),
    KEY idx_agent_listings_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Skill 上架（一次性买断）
CREATE TABLE IF NOT EXISTS skill_listings (
    id             BIGINT        NOT NULL AUTO_INCREMENT,
    merchant_id    BIGINT        NOT NULL,
    name           VARCHAR(100)  NOT NULL,
    description    TEXT          NOT NULL,
    category       VARCHAR(50),
    price_usdt     DECIMAL(18,6) NOT NULL COMMENT '一次买断价格',
    download_url   VARCHAR(500)  COMMENT '交付物下载地址',
    tags           VARCHAR(255)  COMMENT '逗号分隔',
    status         VARCHAR(20)   NOT NULL DEFAULT 'pending' COMMENT 'pending | approved | rejected',
    review_reason  VARCHAR(500),
    reviewed_at    DATETIME,
    created_at     DATETIME      NOT NULL,
    updated_at     DATETIME      NOT NULL,
    PRIMARY KEY (id),
    KEY idx_skill_listings_merchant_id (merchant_id),
    KEY idx_skill_listings_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- [2026-05-04] V003 服务商（平台运营方）唯一约束
-- 全平台只能有一个 role='service_provider' 的用户。
-- 用 generated column + unique index 实现"部分唯一"（只对该角色去重，
-- 其他 role 不受影响）。
ALTER TABLE users
    ADD COLUMN role_service_provider_uk VARCHAR(20)
        GENERATED ALWAYS AS (CASE WHEN role = 'service_provider' THEN 'X' END) VIRTUAL,
    ADD UNIQUE KEY uk_users_role_service_provider (role_service_provider_uk);

-- Bootstrap：把指定邮箱提升为唯一服务商（手动改邮箱后执行）
-- UPDATE users SET role = 'service_provider' WHERE email = 'ops@your-domain.com';
