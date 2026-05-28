import os
from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from app.core.database import SessionLocal

ADMIN_API_KEY = os.getenv("ADMIN_API_KEY", "")
API_KEYS = set(k.strip() for k in os.getenv("API_KEYS", "").split(",") if k.strip())

# Routes that don't require auth
PUBLIC_PATHS = {
    "/health",
    "/config",
    "/docs",
    "/redoc",
    "/openapi.json",
    "/docs/oauth2-redirect",
}

# Prefixes that don't require auth
PUBLIC_PREFIXES = (
    "/webhooks/",  # MT webhooks use their own signature verification
    "/auth/",      # Auth endpoints use Bearer token (Clerk) not API key
)

# Prefixes accessible with user-level API keys
USER_PREFIXES = (
    "/properties",
    "/payments",
    "/treasury",
    "/api/properties",
    "/api/payments",
    "/api/treasury",
)

# Prefixes that require admin key
ADMIN_PREFIXES = (
    "/admin",
)


class APIKeyMiddleware(BaseHTTPMiddleware):
    """
    Three-tier API key authentication:

    - ADMIN_API_KEY: full access (all endpoints including /admin/mint)
    - API_KEYS: user-level access (properties, payments, treasury only)
    - DB-backed rl_... keys: user-level access scoped to the issuing user;
      sets request.state.user so Depends(get_current_user) works transparently.

    If neither ADMIN_API_KEY nor API_KEYS are set, middleware is permissive (dev mode).
    """

    async def dispatch(self, request: Request, call_next):
        try:
            path = request.url.path

            # Allow CORS preflight requests
            if request.method == "OPTIONS":
                return await call_next(request)

            # Skip public paths
            if path in PUBLIC_PATHS:
                return await call_next(request)

            # Skip public prefixes
            for prefix in PUBLIC_PREFIXES:
                if path.startswith(prefix):
                    return await call_next(request)

            # If user already authenticated via Clerk (Bearer token), skip API key check
            if hasattr(request.state, "user") and request.state.user is not None:
                return await call_next(request)

            # If Bearer token present, let ClerkAuthMiddleware handle it - skip all API key checks
            auth_header = request.headers.get("Authorization", "")
            if auth_header.startswith("Bearer "):
                return await call_next(request)

            api_key = request.headers.get("X-API-Key", "")

            # DB-backed user keys (rl_...) — checked first, before GET bypass,
            # so that request.state.user is populated for protected GET routes.
            if api_key and api_key.startswith("sb_"):
                from app.api.routes.api_keys import verify_user_api_key
                db = SessionLocal()
                try:
                    user = verify_user_api_key(api_key, db)
                    # Read clerk_user_id while the session is still open to avoid DetachedInstanceError
                    clerk_user_id = user.clerk_user_id if user is not None else None
                finally:
                    db.close()
                if user is None:
                    raise HTTPException(status_code=401, detail="Invalid or expired API key")
                request.state.user = user
                # Populate clerk_user_id so player routes (_clerk_id) work
                # verify_user_api_key guarantees clerk_user_id is non-null (synthetic if needed)
                request.state.clerk_user_id = clerk_user_id
                return await call_next(request)

            # Skip if no static keys configured at all (dev mode)
            if not ADMIN_API_KEY and not API_KEYS:
                return await call_next(request)

            # Skip GET requests — static key auth not required for reads
            if request.method == "GET":
                return await call_next(request)

            # Admin key passes everything
            if ADMIN_API_KEY and api_key == ADMIN_API_KEY:
                return await call_next(request)

            # Check if this is an admin-only route
            for prefix in ADMIN_PREFIXES:
                if path.startswith(prefix):
                    raise HTTPException(status_code=403, detail="Admin access required")

            # User key passes user-level routes
            if api_key in API_KEYS:
                for prefix in USER_PREFIXES:
                    if path.startswith(prefix):
                        return await call_next(request)
                # User key trying to hit a non-user route
                raise HTTPException(status_code=403, detail="Insufficient permissions")

            # No valid key provided
            raise HTTPException(status_code=401, detail="Invalid or missing API key")
        except HTTPException as exc:
            response = JSONResponse(
                status_code=exc.status_code,
                content={"detail": exc.detail},
            )
            # Add CORS headers for preflight/failed auth responses
            response.headers["Access-Control-Allow-Origin"] = "*"
            response.headers["Access-Control-Allow-Methods"] = "*"
            response.headers["Access-Control-Allow-Headers"] = "*"
            return response
