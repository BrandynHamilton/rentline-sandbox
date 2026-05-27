from functools import lru_cache
from supabase import create_client, Client
from app.core.config import settings


@lru_cache(maxsize=1)
def get_supabase() -> Client:
    """
    Lazily-initialised, cached privileged Supabase client.
    Prefers SUPABASE_PRIVATE_KEY (sb_secret_... format).
    Falls back to SUPABASE_SECRET_KEY, then SUPABASE_SERVICE_ROLE_KEY.
    """
    key = (
        settings.SUPABASE_PRIVATE_KEY
        or settings.SUPABASE_SECRET_KEY
        or settings.SUPABASE_SERVICE_ROLE_KEY
    )
    if not settings.SUPABASE_URL or not key:
        raise RuntimeError(
            "SUPABASE_URL and one of SUPABASE_PRIVATE_KEY / SUPABASE_SECRET_KEY / "
            "SUPABASE_SERVICE_ROLE_KEY must be set"
        )
    return create_client(settings.SUPABASE_URL, key)
