#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./deploy.sh            — build and push all services
#   ./deploy.sh --api      — build and push sandbox-api only
#   ./deploy.sh --cli      — build and publish sandbox-cli to npm only

BUILD_API=true
BUILD_CLI=true

for arg in "$@"; do
  case "$arg" in
    --api) BUILD_API=true;  BUILD_CLI=false ;;
    --cli) BUILD_API=false; BUILD_CLI=true  ;;
    *) echo "Unknown flag: $arg  (valid: --api, --cli)"; exit 1 ;;
  esac
done

TAG="v0.1.0-$(date +%Y%m%d%H%M%S)"

# ── sandbox-api ───────────────────────────────────────────────────────────────
if $BUILD_API; then
  echo "Building sandbox-api..."
  docker build -t brandynham/sandbox-api -f sandbox-api/Dockerfile sandbox-api/

  echo "Tagging sandbox-api as $TAG..."
  docker tag brandynham/sandbox-api "brandynham/sandbox-api:$TAG"
  docker push "brandynham/sandbox-api:$TAG"

  docker tag brandynham/sandbox-api brandynham/sandbox-api:latest
  docker push brandynham/sandbox-api:latest

  echo "sandbox-api pushed: $TAG"
fi

# ── sandbox-cli ───────────────────────────────────────────────────────────────
if $BUILD_CLI; then
  echo "Building sandbox-cli npm package..."
  (cd sandbox-cli && npm run build)

  echo "Publishing sandbox-cli to npm..."
  (cd sandbox-cli && npm publish)

  echo "sandbox-cli published: $(node -p "require('./sandbox-cli/package.json').version")"
fi
