from datetime import datetime, timezone

from fastapi import APIRouter, Request

from app.core.config import settings

router = APIRouter()

_started_at = datetime.now(timezone.utc)


@router.get("/health")
async def health():
    return {"status": "ok", "service": "rentline-sandbox-api"}


@router.get("/", include_in_schema=False)
async def root(request: Request):
    base = str(request.base_url).rstrip("/")
    uptime = int((datetime.now(timezone.utc) - _started_at).total_seconds())

    return {
        "service": "rentline-sandbox-api",
        "version": settings.VERSION,
        "status": "ok",
        "uptime_seconds": uptime,
        "docs": f"{base}/docs",
        "game": {
            "description": "Turn-based real estate investment simulation. Players compete over tokenised properties using mortgages, Fed rate cycles, macro events, property grades, and PACE liens.",
            "turn_phases": ["fed_meeting", "macro_events", "rent_collect", "random_events", "market_move", "debt_service", "distribute"],
            "max_players": 8,
            "presets": ["quick", "standard", "leveraged", "distressed", "long_run"],
            "bot_strategies": ["aggressive", "conservative", "balanced", "momentum", "income", "value_add"],
        },
        "endpoints": {
            "GET  /":                                          "This document",
            "GET  /health":                                    "Liveness check",
            "GET  /docs":                                      "Interactive API docs (Swagger UI)",
            "GET  /api/sandbox/games":                         "List open games",
            "POST /api/sandbox/games":                         "Create a game",
            "POST /api/sandbox/games/from-preset":             "Create a game from a named preset",
            "GET  /api/sandbox/games/{id}":                    "Get full game state",
            "POST /api/sandbox/games/{id}/join":               "Join a game with invite code",
            "POST /api/sandbox/games/{id}/ready":              "Mark yourself ready",
            "POST /api/sandbox/games/{id}/advance-turn":       "Advance the game one turn (host)",
            "GET  /api/sandbox/games/{id}/feed":               "Event feed for a game",
            "GET  /api/sandbox/games/{id}/leaderboard":        "NAV rankings",
            "GET  /api/sandbox/games/{id}/market-summary":     "Live property prices, grades, and cap rates",
            "GET  /api/sandbox/games/{id}/spectate":           "Public game snapshot (no auth)",
            "POST /api/sandbox/games/{id}/trade":              "Buy or sell property tokens",
            "POST /api/sandbox/games/{id}/mortgage":           "Originate an acquisition mortgage",
            "POST /api/sandbox/games/{id}/refi":               "Refinance a mortgage",
            "POST /api/sandbox/games/{id}/heloc/draw":         "Draw from a HELOC",
            "POST /api/sandbox/games/{id}/heloc/repay":        "Repay a HELOC",
            "POST /api/sandbox/games/{id}/prepay-principal":   "Partial or full principal prepayment",
            "POST /api/sandbox/games/{id}/improve-property":   "Cash-funded property grade upgrade",
            "POST /api/sandbox/games/{id}/pace-lien":          "Financed property grade upgrade (PACE)",
            "GET  /api/sandbox/games/{id}/portfolio/{pid}":    "Player portfolio with P&L and yield",
            "GET  /api/sandbox/games/{id}/debt/{pid}":         "Player mortgage summary",
            "GET  /api/sandbox/games/{id}/players/{pid}/actions": "Player transaction timeline",
            "POST /api/sandbox/games/{id}/autonomous":         "Enable autonomous turn advance",
            "GET  /api/sandbox/properties":                    "All active properties in the pool",
            "GET  /api/sandbox/leaderboard":                   "Global all-time leaderboard",
            "POST /api/sandbox/api-keys":                      "Create an API key",
        },
    }
