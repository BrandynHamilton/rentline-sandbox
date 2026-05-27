FROM python:3.13-slim

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Install dependencies
COPY pyproject.toml .
RUN uv sync --no-dev

# Copy application code
COPY app/ ./app/

ENV PYTHONPATH=/app

EXPOSE 6532

CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "6532"]
