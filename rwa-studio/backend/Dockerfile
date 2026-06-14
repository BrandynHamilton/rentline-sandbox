FROM python:3.12-slim

WORKDIR /app

# System deps for web3.py (secp256k1, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libffi-dev \
    libssl-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv for fast dependency resolution
RUN pip install --no-cache-dir --timeout=120 uv

# Copy dependency manifest first for layer caching
COPY backend/pyproject.toml .

# Install dependencies
RUN uv pip install --system --no-cache \
    fastapi \
    "uvicorn[standard]" \
    pydantic \
    pydantic-settings \
    sqlalchemy \
    httpx \
    "web3>=6.0.0" \
    eth-account \
    requests \
    python-dotenv

# Copy application source
COPY backend/app/ ./app/

# Broadcast files are mounted as a volume at runtime (contracts/broadcast → /app/contracts/broadcast)
# so the config.py broadcast fallback works without baking addresses into the image.
RUN mkdir -p /app/contracts/broadcast /app/metadata

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV METADATA_DIR=/app/metadata
ENV DATABASE_URL=sqlite:////app/data/rwa_issuer.db

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
