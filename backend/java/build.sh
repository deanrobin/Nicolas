#!/bin/bash
set -e

echo "==== Nicolas — Java Build ===="

cd "$(dirname "$0")"

echo "[1/2] Cleaning previous build..."
mvn clean -q

echo "[2/2] Building JAR (skip tests)..."
mvn package -DskipTests -q

echo ""
echo "✓ Build complete: target/nicolas-backend-0.1.0-SNAPSHOT.jar"
