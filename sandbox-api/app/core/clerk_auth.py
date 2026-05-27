"""
Clerk JWT authentication middleware.

Verifies Authorization: Bearer <clerk_jwt> using Clerk's JWKS endpoint.
Auto-provisions User records on first authenticated request.

Replaces SessionAuthMiddleware (cookie-based HS256 JWT).
APIKeyMiddleware (X-API-Key) is unchanged and runs alongside this.
"""
import os
import time
import threading
from datetime import datetime, timezone
from typing import Optional

import httpx
import jwt
from fastapi import HTTPException, Request
from jwt import PyJWKClient, PyJWKClientError
from sqlalchemy.orm import Session
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.logging import logger

# Loaded once at module import; refreshed automatically by PyJWKClient
_jwks_client: Optional[PyJWKClient] = None

# ---------------------------------------------------------------------------
# In-process user cache
# Keyed by clerk_user_id → (user_id: str, ttl: float)
# Avoids a DB round-trip on every authenticated request.
# TTL is intentionally short (5 min) so profile changes propagate quickly.
# ---------------------------------------------------------------------------
_USER_CACHE_TTL_SECONDS = 300   # 5 minutes
_USER_CACHE_MAX_SIZE    = 4096  # cap memory growth

_user_cache: dict[str, tuple[object, float]] = {}  # clerk_user_id → (User, expires_at)
_user_cache_lock = threading.Lock()


def _get_jwks_client() -> Optional[PyJWKClient]:
    global _jwks_client
    if _jwks_client is None:
        jwks_url = settings.CLERK_JWKS_URL
        if jwks_url:
            _jwks_client = PyJWKClient(jwks_url, cache_keys=True)
    return _jwks_client


def verify_clerk_token(token: str) -> dict:
    """
    Verify a Clerk-issued JWT and return the decoded claims.

    Raises HTTPException(401) on any failure.
    Validates issuer only if CLERK_ISSUER is configured.

    Notes:
    - Clerk session JWTs do not include an `aud` claim by default, so we
      must disable audience verification (verify_aud=False).
    - `azp` (authorised party) is present but not validated here — it
      contains the frontend origin and is informational only.
    """
    client = _get_jwks_client()
    if not client:
        raise HTTPException(status_code=503, detail="Clerk auth not configured (CLERK_JWKS_URL missing)")

    try:
        signing_key = client.get_signing_key_from_jwt(token)
        decode_options = {
            "verify_exp": True,
            "verify_aud": False,   # Clerk session JWTs have no aud claim
        }
        decode_kwargs: dict = dict(
            algorithms=["RS256"],
            options=decode_options,
            leeway=10,  # 10s tolerance for clock skew between container and browser
        )
        # Only validate issuer if CLERK_ISSUER is set
        if settings.CLERK_ISSUER:
            decode_kwargs["issuer"] = settings.CLERK_ISSUER
        else:
            decode_options["verify_iss"] = False

        claims = jwt.decode(token, signing_key.key, **decode_kwargs)
        return claims
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidIssuerError:
        raise HTTPException(
            status_code=401,
            detail=f"Token issuer is invalid — check CLERK_ISSUER matches your Clerk Frontend API URL"
        )
    except jwt.InvalidAudienceError:
        raise HTTPException(status_code=401, detail="Token audience is invalid")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")
    except PyJWKClientError as e:
        raise HTTPException(status_code=401, detail=f"Unable to verify token signing key: {e}")


def get_or_create_user(claims: dict, db: Session):
    """
    Look up a User by clerk_user_id; create one if it doesn't exist yet.
    Returns the User ORM object.

    Results are cached in-process for _USER_CACHE_TTL_SECONDS to avoid
    a DB round-trip on every authenticated API request.
    """
    from app.models.user import User

    clerk_user_id = claims.get("sub")
    if not clerk_user_id:
        raise HTTPException(status_code=401, detail="Token missing sub claim")

    # --- Cache read ---
    now = time.monotonic()
    with _user_cache_lock:
        entry = _user_cache.get(clerk_user_id)
        if entry is not None:
            user_obj, expires_at = entry
            if now < expires_at:
                return user_obj
            # Expired — remove stale entry
            del _user_cache[clerk_user_id]

    # --- DB lookup / provision ---
    user = db.query(User).filter(User.clerk_user_id == clerk_user_id).first()
    if not user:
        # Auto-provision on first login
        email = claims.get("email", "") or f"{clerk_user_id}@clerk.local"
        name = claims.get("name") or claims.get("full_name") or claims.get("username")
        avatar_url = claims.get("image_url") or claims.get("picture")

        user = User(
            email=email,
            name=name,
            avatar_url=avatar_url,
            clerk_user_id=clerk_user_id,
            provider="clerk",
            provider_id=clerk_user_id,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        logger.info(f"Auto-provisioned user {user.id} for Clerk ID {clerk_user_id}")

    # --- Cache write (evict oldest entry if at capacity) ---
    with _user_cache_lock:
        if len(_user_cache) >= _USER_CACHE_MAX_SIZE:
            # Evict the single oldest entry (simple strategy — avoids full sort)
            oldest_key = min(_user_cache, key=lambda k: _user_cache[k][1])
            del _user_cache[oldest_key]
        _user_cache[clerk_user_id] = (user, now + _USER_CACHE_TTL_SECONDS)

    return user


class ClerkAuthMiddleware(BaseHTTPMiddleware):
    """
    Verify Clerk JWTs on every request that carries Authorization: Bearer.

    - If X-API-Key is present → skip (APIKeyMiddleware handles it).
    - If no Authorization header → skip (public or API-key routes).
    - If Authorization: Bearer present → verify with Clerk JWKS,
      populate request.state.user (User ORM object) and
      request.state.clerk_claims (raw JWT dict).
    """

    PUBLIC_PATHS = {
        "/health", "/config", "/docs", "/redoc", "/openapi.json", "/docs/oauth2-redirect",
        "/auth/check",
    }
    PUBLIC_PREFIXES = ("/webhooks/",)
    # WebSocket paths authenticate via query param token — bypass Bearer check
    WS_PATHS = {"/api/ws"}

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Allow CORS preflight requests
        if request.method == "OPTIONS":
            return await call_next(request)

        if path in self.PUBLIC_PATHS:
            return await call_next(request)

        # WebSocket upgrade — auth is handled inside the ws endpoint via query param
        if path in self.WS_PATHS:
            return await call_next(request)

        for prefix in self.PUBLIC_PREFIXES:
            if path.startswith(prefix):
                return await call_next(request)

        # If X-API-Key is present, let APIKeyMiddleware handle auth
        if request.headers.get("X-API-Key"):
            return await call_next(request)

        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            # No bearer token — allow through (public or will fail downstream)
            return await call_next(request)

        token = auth_header.removeprefix("Bearer ").strip()

        # Check if this clerk_user_id is already cached — if so we can skip
        # verify+DB for the fast path. We still need to verify the JWT to get
        # the sub claim, but we avoid the DB hit on every request.
        logger.debug(f"ClerkAuthMiddleware: Verifying token (length={len(token)})")

        try:
            claims = verify_clerk_token(token)
        except HTTPException as exc:
            logger.warning(f"ClerkAuthMiddleware: Token verification failed — {exc.detail}")
            return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

        # Load/create the user from DB
        try:
            db = SessionLocal()
            try:
                user = get_or_create_user(claims, db)
                request.state.user = user
                request.state.clerk_claims = claims
                request.state.clerk_user_id = claims.get("sub")
            finally:
                db.close()
        except HTTPException as exc:
            return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
        except Exception as e:
            logger.error(f"ClerkAuthMiddleware DB error: {e}")
            return JSONResponse(status_code=500, content={"detail": "Auth error"})

        return await call_next(request)
