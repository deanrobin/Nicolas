#!/bin/bash
set -e

cd "$(dirname "$0")"

JAR="target/nicolas-backend-0.1.0-SNAPSHOT.jar"

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
# 用 jar 文件名匹配（不带相对路径），适配任意启动方式
JAR_NAME="nicolas-backend-0.1.0-SNAPSHOT.jar"
echo "Checking for running instances of $JAR_NAME ..."
PIDS=$(pgrep -f "$JAR_NAME" || true)
if [ -n "$PIDS" ]; then
  echo "Found existing PIDs: $PIDS"
  for pid in $PIDS; do
    CMD=$(ps -p "$pid" -o args= 2>/dev/null | head -c 120)
    echo "  -> Killing PID $pid : $CMD"
    kill -9 "$pid" 2>/dev/null || echo "     (kill failed, maybe already gone)"
  done
  sleep 2
  # 二次确认
  REMAIN=$(pgrep -f "$JAR_NAME" || true)
  if [ -n "$REMAIN" ]; then
    echo "WARN: still running after kill: $REMAIN"
  else
    echo "All old instances killed."
  fi
else
  echo "No existing instance found."
fi

# ── 启动 (nohup 后台 + 丢弃日志) ──────────────────────────────────────────
echo "==== Nicolas — Java Start ===="
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
