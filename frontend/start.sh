#!/bin/bash
set -e

cd "$(dirname "$0")"

PID_FILE="frontend.pid"
LOG_FILE="frontend.log"

# ── kill 已有的 vite 进程 ─────────────────────────────────────────────────
echo "Checking for running Vite instances ..."
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo "Killing PID $OLD_PID from $PID_FILE"
    kill -9 "$OLD_PID" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
fi

# 兜底：按命令名清理
PIDS=$(pgrep -f "vite" || true)
if [ -n "$PIDS" ]; then
  echo "Killing stray vite PIDs: $PIDS"
  kill -9 $PIDS 2>/dev/null || true
fi
sleep 1

# ── 安装依赖（如果 node_modules 不存在）───────────────────────────────────
if [ ! -d "node_modules" ]; then
  echo "node_modules not found, running npm install ..."
  npm install
fi

# ── 启动 Vite dev server（后台）──────────────────────────────────────────
echo "==== Nicolas — Frontend Start ===="
echo "  Binding to 0.0.0.0:5173 (external access enabled)"
echo "  Logs : $(pwd)/$LOG_FILE"
echo ""

nohup npm run dev -- --host 0.0.0.0 --port 5173 > "$LOG_FILE" 2>&1 &
NEW_PID=$!
echo "$NEW_PID" > "$PID_FILE"

echo "Started PID: $NEW_PID"
echo ""

# ── 等几秒看是否启动成功 ─────────────────────────────────────────────────
sleep 3
if kill -0 "$NEW_PID" 2>/dev/null; then
  echo "✓ Vite is running."
  PUBLIC_IP=$(curl -s --max-time 2 ifconfig.me 2>/dev/null || echo "<your-server-ip>")
  echo ""
  echo "Access:"
  echo "  Local:  http://localhost:5173"
  echo "  Public: http://${PUBLIC_IP}:5173"
  echo ""
  echo "Tail logs:  tail -f $(pwd)/$LOG_FILE"
  echo "Stop:       kill \$(cat $(pwd)/$PID_FILE)"
else
  echo "✗ Vite failed to start. Last log:"
  echo "─────────────────────────────────────"
  tail -30 "$LOG_FILE"
  echo "─────────────────────────────────────"
  exit 1
fi
