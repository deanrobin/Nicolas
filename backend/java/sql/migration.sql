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


-- [2026-05-05] V004 审核状态机扩展：新增 init / needs_human
-- 列定义不变（VARCHAR(20)），仅修订 COMMENT 让 schema 文档与实际状态机对齐。
--   pending      submitted, waiting for the auditor worker
--   init         user is editing; worker MUST NOT pick this row
--   approved     auditor accepted; visible on the public marketplace
--   rejected     auditor rejected; user may edit & resubmit
--   needs_human  auditor low confidence; service_provider must decide
-- 已有数据无需迁移，旧值（pending/approved/rejected）继续合法。
ALTER TABLE merchants
    MODIFY COLUMN status VARCHAR(20) NOT NULL DEFAULT 'pending'
    COMMENT 'pending | init | approved | rejected | needs_human';

ALTER TABLE agent_listings
    MODIFY COLUMN status VARCHAR(20) NOT NULL DEFAULT 'pending'
    COMMENT 'pending | init | approved | rejected | needs_human';

ALTER TABLE skill_listings
    MODIFY COLUMN status VARCHAR(20) NOT NULL DEFAULT 'pending'
    COMMENT 'pending | init | approved | rejected | needs_human';


-- [2026-05-06] V005 Agent 部署模式 + 服务输入输出 + Skill 文件路径
-- agent 分为外部调用（EXTERNAL）和平台托管（HOSTED，V1 展示"敬请期待"）。
-- service_input / service_output 由商家填写，描述 Agent/Skill 的接口约定。
-- skill 文件实体存服务器，file_path 记相对路径；download_url 保留供外链兼容。
ALTER TABLE agent_listings
    ADD COLUMN deployment_mode VARCHAR(16) NOT NULL DEFAULT 'EXTERNAL'
        COMMENT 'EXTERNAL=商家外部URL; HOSTED=平台托管(V1 coming soon)',
    ADD COLUMN service_input TEXT COMMENT '服务输入描述',
    ADD COLUMN service_output TEXT COMMENT '服务输出描述';

ALTER TABLE skill_listings
    ADD COLUMN file_path VARCHAR(512)
        COMMENT '服务器存储路径（由平台托管的 Skill 文件）',
    ADD COLUMN service_input TEXT COMMENT '服务输入描述',
    ADD COLUMN service_output TEXT COMMENT '服务输出描述';
