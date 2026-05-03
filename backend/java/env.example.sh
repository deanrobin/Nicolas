#!/usr/bin/env bash
# Agents Bazaar — 环境变量配置模板
# 使用方法：
#   cp env.example.sh env.sh   # 复制一份
#   vim env.sh                 # 填写真实值
#   source env.sh              # 加载到当前 shell
# env.sh 已加入 .gitignore，不会被提交

# ── 数据库 ────────────────────────────────────────────────────────────────
export DB_HOST=127.0.0.1
export DB_PORT=3306
export DB_NAME=nicolas
export DB_USER=your_db_user
export DB_PASS=your_db_password

# ── JWT ───────────────────────────────────────────────────────────────────
# 生产环境必须换成 256-bit 随机字符串
# 生成命令：openssl rand -hex 32
export JWT_SECRET=change_me_use_openssl_rand_hex_32
export JWT_EXPIRATION_DAYS=7

# ── 邮件 (SMTP) ───────────────────────────────────────────────────────────
export MAIL_HOST=smtp.gmail.com
export MAIL_PORT=587
export MAIL_USER=your_email@gmail.com
export MAIL_PASS=your_smtp_app_password
export MAIL_FROM=noreply@agents-bazaar.xyz
# true = 不发真实邮件，验证码打印到日志（本地开发用）
export MAIL_DEV_MODE=true

# ── 服务端口 ──────────────────────────────────────────────────────────────
export SERVER_PORT=8080

# ── Python 后端地址 ───────────────────────────────────────────────────────
export PYTHON_BACKEND_URL=http://localhost:8000

# ── 日志路径 ──────────────────────────────────────────────────────────────
export LOG_PATH=/root/Nicolas/backend/java/logs

echo "✓ Agents Bazaar 环境变量已加载"
echo "  DB:   ${DB_USER}@${DB_HOST}:${DB_PORT}"
echo "  PORT: ${SERVER_PORT}"
echo "  MAIL_DEV_MODE: ${MAIL_DEV_MODE}"
