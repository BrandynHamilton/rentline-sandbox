#!/usr/bin/env bash
set -euo pipefail

TAG="v0.1.0-$(date +%Y%m%d%H%M%S)"

# ── sandbox-api ───────────────────────────────────────────────────────────────
echo "Building sandbox-api..."
docker build -t brandynham/sandbox-api -f sandbox-api/Dockerfile sandbox-api/

echo "Tagging sandbox-api as $TAG..."
docker tag brandynham/sandbox-api "brandynham/sandbox-api:$TAG"
docker push "brandynham/sandbox-api:$TAG"

docker tag brandynham/sandbox-api brandynham/sandbox-api:latest
docker push brandynham/sandbox-api:latest

# ── sandbox-cli ───────────────────────────────────────────────────────────────
echo "Building sandbox-cli..."
docker build -t brandynham/sandbox-cli -f sandbox-cli/Dockerfile sandbox-cli/

echo "Tagging sandbox-cli as $TAG..."
docker tag brandynham/sandbox-cli "brandynham/sandbox-cli:$TAG"
docker push "brandynham/sandbox-cli:$TAG"

docker tag brandynham/sandbox-cli brandynham/sandbox-cli:latest
docker push brandynham/sandbox-cli:latest

# ── sandbox-web ───────────────────────────────────────────────────────────────
echo "Building sandbox-web..."
docker build -t brandynham/sandbox-web -f sandbox-web/Dockerfile sandbox-web/

echo "Tagging sandbox-web as $TAG..."
docker tag brandynham/sandbox-web "brandynham/sandbox-web:$TAG"
docker push "brandynham/sandbox-web:$TAG"

docker tag brandynham/sandbox-web brandynham/sandbox-web:latest
docker push brandynham/sandbox-web:latest

echo "Done — pushed all three images as $TAG and latest"
