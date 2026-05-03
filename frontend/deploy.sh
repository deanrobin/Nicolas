#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "==== Nicolas — Frontend Deploy ===="

# ── 开发模式：本地跑 Vite dev server ─────────────────────────────────────
if [ "$1" = "dev" ]; then
  echo "Starting dev server at http://localhost:5173 ..."
  npm run dev
  exit 0
fi

# ── 生产模式：构建静态文件，复制到 Nginx 目录 ────────────────────────────
NGINX_ROOT="${NGINX_ROOT:-/home/ubuntu/Nicolas/frontend/dist}"

echo "[1/2] Installing dependencies..."
npm install --silent

echo "[2/2] Building..."
npm run build

echo ""
echo "✓ Build complete → dist/"
echo ""

# 如果指定了 Nginx root 并且不是 dist 本身，则复制过去
if [ "$NGINX_ROOT" != "$(pwd)/dist" ] && [ -n "$NGINX_ROOT" ]; then
  echo "Copying to $NGINX_ROOT ..."
  rm -rf "$NGINX_ROOT"
  cp -r dist "$NGINX_ROOT"
  echo "✓ Files copied."
fi

# 重新加载 Nginx（如果在服务器上）
if command -v nginx &>/dev/null; then
  echo "Reloading Nginx..."
  sudo nginx -t && sudo systemctl reload nginx
  echo "✓ Nginx reloaded."
fi

echo ""
echo "Done! Site is live."
