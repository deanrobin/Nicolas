#!/bin/bash
set -e

cd "$(dirname "$0")"

JAR="target/agents-bazaar-backend-0.1.0-SNAPSHOT.jar"

if [ ! -f "$JAR" ]; then
  echo "JAR not found. Run build.sh first."
  exit 1
fi

# ── 加载环境变量 ─────────────────────────────────────────────────────────
if [ -f "env.sh" ]; then
  echo "Loading env.sh ..."
  # shellcheck disable=SC1091
  . ./env.sh
else
  echo "WARN: env.sh not found, using defaults / current shell env"
fi

# ── 查找已运行的进程并 kill ───────────────────────────────────────────────
echo "Checking for running instances ..."
PIDS=$(pgrep -f "$JAR" || true)
if [ -n "$PIDS" ]; then
  echo "Killing old PIDs: $PIDS"
  kill -9 $PIDS
  sleep 1
fi

# ── 启动 (nohup 后台 + 丢弃日志) ──────────────────────────────────────────
echo "==== Agents Bazaar — Java Start ===="
echo "  DB   : ${DB_HOST:-localhost}:${DB_PORT:-3306}"
echo "  Port : ${SERVER_PORT:-8080}"
echo ""

nohup java \
  -Dfile.encoding=UTF-8 \
  -Duser.timezone=Asia/Shanghai \
  -jar "$JAR" \
  > /dev/null 2>&1 &

NEW_PID=$!
echo "Started PID: $NEW_PID"
echo "Use 'ps -ef | grep $JAR' to verify."
