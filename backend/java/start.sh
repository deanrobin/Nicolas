#!/bin/bash
set -e

cd "$(dirname "$0")"

JAR="target/agents-bazaar-backend-0.1.0-SNAPSHOT.jar"

if [ ! -f "$JAR" ]; then
  echo "JAR not found. Run build.sh first."
  exit 1
fi

# ── 环境变量（没有就用默认值，生产环境请提前 export 或写到 .env）────────────
export DB_HOST="${DB_HOST:-localhost}"
export DB_PORT="${DB_PORT:-3306}"
export DB_USER="${DB_USER:-root}"
export DB_PASS="${DB_PASS:-root}"
export JWT_SECRET="${JWT_SECRET:-agents-bazaar-default-secret-change-in-production-256bit}"
export JWT_EXPIRATION_DAYS="${JWT_EXPIRATION_DAYS:-7}"
export SERVER_PORT="${SERVER_PORT:-8080}"
export MAIL_DEV_MODE="${MAIL_DEV_MODE:-true}"
export LOG_PATH="${LOG_PATH:-logs}"

mkdir -p "$LOG_PATH"

echo "==== Agents Bazaar — Java Start ===="
echo "  DB   : $DB_HOST:$DB_PORT"
echo "  Port : $SERVER_PORT"
echo "  Logs : $LOG_PATH/agents-bazaar.log"
echo ""

exec java \
  -Xms256m -Xmx512m \
  -Dfile.encoding=UTF-8 \
  -Duser.timezone=Asia/Shanghai \
  -jar "$JAR"
