import os
from dotenv import load_dotenv

_here = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.normpath(os.path.join(_here, '..', '..', '..', '.env')))


class Settings:
    # App
    VERSION: str = os.getenv("VERSION", "0.1.0")
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", 6532))

    # Database — defaults to SQLite for local dev
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./data/sandbox.db")

    # Supabase (same project as Rentline or dedicated sandbox project)
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_PRIVATE_KEY: str = os.getenv("SUPABASE_PRIVATE_KEY", "")
    SUPABASE_SECRET_KEY: str = os.getenv("SUPABASE_SECRET_KEY", "")
    SUPABASE_SERVICE_ROLE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

    # Clerk — same application as Rentline; users sign in once, both apps work
    CLERK_SECRET_KEY: str = os.getenv("CLERK_SECRET_KEY", "")
    CLERK_JWKS_URL: str = os.getenv("CLERK_JWKS_URL", "")
    CLERK_ISSUER: str = os.getenv("CLERK_ISSUER", "")

    # Security
    ADMIN_API_KEY: str = os.getenv("ADMIN_API_KEY", "")
    API_KEYS: str = os.getenv("API_KEYS", "")
    ALLOWED_ORIGINS: str = os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:3001,https://sandbox.rentline.xyz"
    )
    RATE_LIMIT_REQUESTS: int = int(os.getenv("RATE_LIMIT_REQUESTS", "100"))
    RATE_LIMIT_WINDOW_SECONDS: int = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60"))

    # Sandbox game defaults
    SANDBOX_STARTING_BALANCE_USDC: float = float(os.getenv("SANDBOX_STARTING_BALANCE_USDC", "100000"))
    SANDBOX_MAX_PLAYERS: int = int(os.getenv("SANDBOX_MAX_PLAYERS", "8"))
    SANDBOX_DEFAULT_MAX_TURNS: int = int(os.getenv("SANDBOX_DEFAULT_MAX_TURNS", "12"))

    # rwa-issuer-sim (for property pool sync + live AVM re-fetch)
    RWA_ISSUER_URL: str = os.getenv("RWA_ISSUER_URL", "")

    # On-chain — Arbitrum Sepolia (Phase 1)
    ARBITRUM_SEPOLIA_RPC_URL: str = os.getenv(
        "ARBITRUM_SEPOLIA_RPC_URL", "https://sepolia-rollup.arbitrum.io/rpc"
    )
    ARBITRUM_SEPOLIA_CHAIN_ID: int = int(os.getenv("ARBITRUM_SEPOLIA_CHAIN_ID", 421614))

    # On-chain — Dedicated Orbit Chain (Phase 2, set after deployment)
    ORBIT_RPC_URL: str = os.getenv("ORBIT_RPC_URL", "")
    ORBIT_CHAIN_ID: int = int(os.getenv("ORBIT_CHAIN_ID", 0))
    ORBIT_MOCK_USDC_ADDRESS: str = os.getenv("ORBIT_MOCK_USDC_ADDRESS", "")
    ORBIT_DISTRIBUTOR_ADDRESS: str = os.getenv("ORBIT_DISTRIBUTOR_ADDRESS", "")
    SANDBOX_ADMIN_PRIVATE_KEY: str = os.getenv("SANDBOX_ADMIN_PRIVATE_KEY", "")

    # Rentline backend bridge (optional)
    # When set, simulated rent payments write real ledger entries to the Rentline backend.
    # Leave blank to disable — sandbox runs fully without this.
    RENTLINE_API_URL: str = os.getenv("RENTLINE_API_URL", "")
    RENTLINE_SANDBOX_BRIDGE_KEY: str = os.getenv("RENTLINE_SANDBOX_BRIDGE_KEY", "")


settings = Settings()
