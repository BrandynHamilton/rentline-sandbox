"""
api_keys.py — API key management for CLI / programmatic access.

POST /api/sandbox/api-keys
    Create a new rl_... key for the authenticated Clerk user.
    Returns the raw key once — store it securely.

GET  /api/sandbox/api-keys
    List all active keys for the authenticated user (key prefix only, never raw).

DELETE /api/sandbox/api-keys/{key_id}
    Revoke a key.

verify_user_api_key(raw_key, db) → User | None
    Called by APIKeyMiddleware to validate inbound X-API-Key headers.
    Also ensures the user has a stable clerk_user_id (synthetic if needed).
"""
from __future__ import annotations

import hashlib
from datetime import datetime

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.core.database import SessionLocal
from app.core.logging import logger
from app.models.user import ApiKey, User
from fastapi import Depends

router = APIRouter(prefix="/sandbox", tags=["api-keys"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ApiKeyCreateRequest(BaseModel):
    name: str = "CLI key"


class ApiKeyResponse(BaseModel):
    id: str
    name: str
    key_prefix: str
    created_at: str
    expires_at: str | None = None
    # raw_key only present on creation
    raw_key: str | None = None


# ---------------------------------------------------------------------------
# verify_user_api_key — used by APIKeyMiddleware
# ---------------------------------------------------------------------------

def verify_user_api_key(raw_key: str, db: Session) -> User | None:
    """
    Verify a raw rl_... API key against stored hashes.

    On success:
    - Updates last_used_at and request_count.
    - Ensures user.clerk_user_id is populated (synthetic fallback).
    Returns the User ORM object, or None if invalid/revoked/expired.
    """
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()

    api_key_row = (
        db.query(ApiKey)
        .filter(
            ApiKey.key_hash == key_hash,
            ApiKey.is_active == True,  # noqa: E712
        )
        .first()
    )

    if api_key_row is None:
        return None

    # Check expiry
    if api_key_row.expires_at and api_key_row.expires_at < datetime.utcnow():
        return None

    user = db.query(User).filter(User.id == api_key_row.user_id).first()
    if user is None:
        return None

    # Ensure the user has a stable clerk_user_id.
    # If they signed up via CLI (no Clerk account), synthesize one so that
    # request.state.clerk_user_id is always a stable non-null string.
    if not user.clerk_user_id:
        user.clerk_user_id = f"apikey_{user.id}"
        db.commit()
        logger.info(f"Synthesized clerk_user_id={user.clerk_user_id} for API-key user {user.id}")

    # Bookkeeping
    api_key_row.last_used_at = datetime.utcnow()
    api_key_row.request_count = (api_key_row.request_count or 0) + 1
    db.commit()

    return user


# ---------------------------------------------------------------------------
# Helper: resolve the current user from request state (set by middleware)
# ---------------------------------------------------------------------------

def _current_user(request: Request) -> User:
    user = getattr(request.state, "user", None)
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/api-keys", response_model=ApiKeyResponse)
def create_api_key(
    body: ApiKeyCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Generate a new API key for the current user.
    The raw key is returned once — it cannot be retrieved again.

    Requires: Clerk JWT (Authorization: Bearer) or an existing API key.
    """
    user = _current_user(request)

    raw_key = ApiKey.generate_key()
    key_hash = ApiKey.hash_key(raw_key)

    new_key = ApiKey(
        user_id=user.id,
        key_hash=key_hash,
        name=body.name,
    )
    db.add(new_key)
    db.commit()
    db.refresh(new_key)

    logger.info(f"API key created: id={new_key.id} user={user.id} name={body.name!r}")

    return ApiKeyResponse(
        id=new_key.id,
        name=new_key.name,
        key_prefix=raw_key[:12] + "…",
        created_at=new_key.created_at.isoformat(),
        expires_at=new_key.expires_at.isoformat() if new_key.expires_at else None,
        raw_key=raw_key,
    )


@router.get("/api-keys", response_model=list[ApiKeyResponse])
def list_api_keys(
    request: Request,
    db: Session = Depends(get_db),
):
    """List all active API keys for the current user (prefix only, no raw keys)."""
    user = _current_user(request)

    keys = (
        db.query(ApiKey)
        .filter(ApiKey.user_id == user.id, ApiKey.is_active == True)  # noqa: E712
        .order_by(ApiKey.created_at.desc())
        .all()
    )

    return [
        ApiKeyResponse(
            id=k.id,
            name=k.name,
            key_prefix="sb_" + "…",  # never expose raw; just hint at prefix
            created_at=k.created_at.isoformat(),
            expires_at=k.expires_at.isoformat() if k.expires_at else None,
        )
        for k in keys
    ]


@router.delete("/api-keys/{key_id}", status_code=204)
def revoke_api_key(
    key_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """Revoke an API key. The key_id must belong to the current user."""
    user = _current_user(request)

    key = (
        db.query(ApiKey)
        .filter(ApiKey.id == key_id, ApiKey.user_id == user.id)
        .first()
    )
    if key is None:
        raise HTTPException(status_code=404, detail="API key not found")

    key.is_active = False
    db.commit()
    logger.info(f"API key revoked: id={key_id} user={user.id}")
