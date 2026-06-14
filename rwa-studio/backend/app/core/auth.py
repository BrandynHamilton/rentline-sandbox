"""
API key authentication dependency.

Protects admin-only endpoints (token deployment, factory ops) with the
ADMIN_API_KEY set in .env.

Usage in a route:
    from app.core.auth import require_admin_key

    @router.post("/deploy/property")
    def deploy(..., _: None = Depends(require_admin_key)):
        ...

If ADMIN_API_KEY is not set in .env the dependency raises a 503 so the
server does not silently accept unauthenticated requests in production.

Clients must send:
    X-Admin-Key: <your-key>
"""
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import APIKeyHeader

from app.core.config import settings

_header_scheme = APIKeyHeader(name="X-Admin-Key", auto_error=False)


def require_admin_key(api_key: str | None = Security(_header_scheme)) -> None:
    """
    FastAPI dependency — raises 401/503 if the request is not authorised.

    - 503  ADMIN_API_KEY not configured in .env (server misconfiguration)
    - 401  key missing or wrong
    """
    if not settings.admin_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Admin API key not configured on this server.",
        )
    if api_key != settings.admin_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-Admin-Key header.",
            headers={"WWW-Authenticate": "ApiKey"},
        )
