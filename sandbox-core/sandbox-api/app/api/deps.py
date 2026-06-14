from typing import Generator
from fastapi import HTTPException, Request
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.core.config import settings
import os


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(request: Request):
    user = getattr(request.state, "user", None)
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


def get_optional_user(request: Request):
    return getattr(request.state, "user", None)


def is_admin_request(request: Request) -> bool:
    admin_key = settings.ADMIN_API_KEY
    api_key = request.headers.get("X-API-Key", "")
    return bool(admin_key and api_key == admin_key)
