#!/bin/bash
set -e

echo "==== Agents Bazaar — Java Build ===="

cd "$(dirname "$0")"

echo "[1/2] Cleaning previous build..."
mvn clean -q

echo "[2/2] Building JAR (skip tests)..."
mvn package -DskipTests -q

echo ""
echo "✓ Build complete: target/agents-bazaar-backend-0.1.0-SNAPSHOT.jar"
