FROM python:3.13-slim AS base

WORKDIR /app

# Install uv from official image
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# ── Dependencies ──────────────────────────────────────────────────────────────
# Copy lockfile + manifest first so this layer is cached unless deps change
COPY pyproject.toml uv.lock ./

RUN uv sync --frozen --no-dev --no-install-project

# ── Application code ──────────────────────────────────────────────────────────
COPY app/ ./app/

ENV PYTHONPATH=/app \
    PYTHONUNBUFFERED=1 \
    UV_PROJECT_ENVIRONMENT=/app/.venv \
    UV_CACHE_DIR=/app/.cache/uv

# Create data dir, cache dir, and non-root user
RUN mkdir -p /app/data /app/.cache/uv && \
    addgroup --system sandbox && \
    adduser --system --ingroup sandbox sandbox && \
    chown -R sandbox:sandbox /app

USER sandbox

EXPOSE 6532

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:6532/health')" || exit 1

CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "6532"]
