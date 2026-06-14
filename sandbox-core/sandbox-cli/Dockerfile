FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies (including devDependencies needed for build)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build
COPY tsconfig.json tsup.config.ts ./
COPY src/ ./src/
COPY SKILL.md llms.txt ./
RUN npm run build

# ── Runtime image ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Only copy production deps + compiled output
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/SKILL.md /app/llms.txt ./

# Non-root user
RUN addgroup -S sandbox && adduser -S sandbox -G sandbox
USER sandbox

# The CLI / MCP server runs over stdio — no port to expose.
# When used as an MCP server: docker run --rm -i sandbox-cli
# When used as a CLI tool:    docker run --rm -it sandbox-cli node dist/index.js game list
ENTRYPOINT ["node", "dist/index.js"]
