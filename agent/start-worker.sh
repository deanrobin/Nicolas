#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$SCRIPT_DIR/logs/worker.log"
PID_FILE="$SCRIPT_DIR/logs/worker.pid"

mkdir -p "$SCRIPT_DIR/logs"

# Check if already running
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    echo "Worker is already running (PID $PID). Use stop-worker.sh to stop it first."
    exit 1
  else
    rm -f "$PID_FILE"
  fi
fi

# Activate venv
if [ ! -f "$SCRIPT_DIR/.venv/bin/activate" ]; then
  echo "Virtual environment not found. Run: python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"
  exit 1
fi

source "$SCRIPT_DIR/.venv/bin/activate"

echo "Starting auditor worker..."
nohup python -m worker >> "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"

sleep 1
if kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "Worker started (PID $(cat "$PID_FILE"))"
  echo "Logs: $LOG_FILE"
else
  echo "Worker failed to start. Check logs: $LOG_FILE"
  rm -f "$PID_FILE"
  exit 1
fi
