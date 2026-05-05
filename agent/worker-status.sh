#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$SCRIPT_DIR/logs/worker.pid"
LOG_FILE="$SCRIPT_DIR/logs/worker.log"

if [ ! -f "$PID_FILE" ]; then
  echo "Worker: STOPPED (no PID file)"
  exit 0
fi

PID=$(cat "$PID_FILE")
if kill -0 "$PID" 2>/dev/null; then
  echo "Worker: RUNNING (PID $PID)"
  echo ""
  echo "Last 20 log lines:"
  tail -20 "$LOG_FILE" 2>/dev/null || echo "(no logs yet)"
else
  echo "Worker: STOPPED (stale PID $PID)"
  rm -f "$PID_FILE"
fi
