#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$SCRIPT_DIR/logs/worker.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "PID file not found. Worker may not be running."
  exit 0
fi

PID=$(cat "$PID_FILE")

if kill -0 "$PID" 2>/dev/null; then
  echo "Stopping worker (PID $PID)..."
  kill -TERM "$PID"
  # Wait up to 10s for graceful shutdown
  for i in $(seq 1 10); do
    if ! kill -0 "$PID" 2>/dev/null; then
      echo "Worker stopped."
      rm -f "$PID_FILE"
      exit 0
    fi
    sleep 1
  done
  echo "Worker did not stop gracefully; force-killing..."
  kill -KILL "$PID" 2>/dev/null || true
  rm -f "$PID_FILE"
  echo "Worker killed."
else
  echo "Worker (PID $PID) is not running. Cleaning up PID file."
  rm -f "$PID_FILE"
fi
