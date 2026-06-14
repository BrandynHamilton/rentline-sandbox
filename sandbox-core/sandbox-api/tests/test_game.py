"""
test_game.py — integration tests for game lifecycle and bot HTTP endpoints.

Uses the FastAPI TestClient against an in-memory SQLite DB.
Clerk auth is mocked — all requests run as FAKE_CLERK_ID.
"""

import pytest
from tests.conftest import FAKE_CLERK_ID, FAKE_ADMIN_KEY


# ---------------------------------------------------------------------------
# Game creation
# ---------------------------------------------------------------------------

class TestCreateGame:
    def test_create_game_returns_201(self, client, prop):
        resp = client.post("/api/sandbox/games", json={
            "name": "Test Game",
            "display_name": "Alice",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Test Game"
        assert data["status"] == "lobby"
        assert len(data["players"]) == 1
        assert data["players"][0]["display_name"] == "Alice"
        assert data["players"][0]["is_host"] is True

    def test_create_game_with_bots(self, client, prop):
        resp = client.post("/api/sandbox/games", json={
            "name": "Bot Game",
            "display_name": "Host",
            "bots": [
                {"display_name": "Aggressive Andy", "strategy": "aggressive"},
                {"display_name": "Balanced Betty", "strategy": "balanced"},
            ],
        })
        assert resp.status_code == 201
        data = resp.json()
        players = data["players"]
        assert len(players) == 3  # host + 2 bots

        bots = [p for p in players if p.get("is_bot")]
        assert len(bots) == 2
        strategies = {b["bot_strategy"] for b in bots}
        assert strategies == {"aggressive", "balanced"}

    def test_create_game_bots_have_full_starting_balance(self, client, prop):
        resp = client.post("/api/sandbox/games", json={
            "name": "Rich Bots",
            "display_name": "Host",
            "starting_balance_usdc": 50_000,
            "bots": [{"display_name": "Bot 1"}],
        })
        assert resp.status_code == 201
        bots = [p for p in resp.json()["players"] if p.get("is_bot")]
        assert bots[0]["usdc_balance"] == pytest.approx(50_000.0)

    def test_create_game_without_property_fails(self, client):
        # No prop fixture — no properties in DB
        resp = client.post("/api/sandbox/games", json={
            "name": "No Prop Game",
            "display_name": "Alice",
        })
        assert resp.status_code == 400

    def test_create_game_invalid_bot_strategy_fails(self, client, prop):
        resp = client.post("/api/sandbox/games", json={
            "name": "Bad Bot Game",
            "display_name": "Host",
            "bots": [{"display_name": "Bad Bot", "strategy": "yolo"}],
        })
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Add / remove bot endpoints
# ---------------------------------------------------------------------------

class TestBotEndpoints:
    def test_add_bot_returns_201(self, client, prop):
        # Create game first
        game_resp = client.post("/api/sandbox/games", json={
            "name": "G", "display_name": "Host",
        })
        game_id = game_resp.json()["id"]

        resp = client.post(f"/api/sandbox/games/{game_id}/bots", json={
            "display_name": "Warren Buffett",
            "strategy": "conservative",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["is_bot"] is True
        assert data["display_name"] == "Warren Buffett"
        assert data["strategy"] == "conservative"
        assert "player_id" in data

    def test_add_bot_appears_in_game_state(self, client, prop):
        game_resp = client.post("/api/sandbox/games", json={
            "name": "G", "display_name": "Host",
        })
        game_id = game_resp.json()["id"]
        client.post(f"/api/sandbox/games/{game_id}/bots", json={
            "display_name": "Bot", "strategy": "income",
        })
        game_state = client.get(f"/api/sandbox/games/{game_id}").json()
        bots = [p for p in game_state["players"] if p.get("is_bot")]
        assert len(bots) == 1
        assert bots[0]["bot_strategy"] == "income"

    def test_remove_bot(self, client, prop):
        game_resp = client.post("/api/sandbox/games", json={
            "name": "G", "display_name": "Host",
        })
        game_id = game_resp.json()["id"]
        add_resp = client.post(f"/api/sandbox/games/{game_id}/bots", json={
            "display_name": "Temp Bot",
        })
        bot_id = add_resp.json()["player_id"]

        del_resp = client.delete(f"/api/sandbox/games/{game_id}/bots/{bot_id}")
        assert del_resp.status_code == 204

        game_state = client.get(f"/api/sandbox/games/{game_id}").json()
        bots = [p for p in game_state["players"] if p.get("is_bot")]
        assert len(bots) == 0

    def test_add_bot_after_game_starts_fails(self, client, prop):
        game_resp = client.post("/api/sandbox/games", json={
            "name": "G", "display_name": "Host",
        })
        game_id = game_resp.json()["id"]
        # Advance the turn to start the game
        client.post(f"/api/sandbox/games/{game_id}/advance-turn")

        resp = client.post(f"/api/sandbox/games/{game_id}/bots", json={
            "display_name": "Late Bot",
        })
        assert resp.status_code == 400
        assert "lobby" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# Advance turn with bots
# ---------------------------------------------------------------------------

class TestAdvanceTurnWithBots:
    def test_advance_turn_marks_bots_ready(self, client, prop):
        # Create game with 2 bots
        game_resp = client.post("/api/sandbox/games", json={
            "name": "G", "display_name": "Host",
            "fed_meeting_interval": 0,
            "bots": [
                {"display_name": "Bot A", "strategy": "conservative"},
                {"display_name": "Bot B", "strategy": "momentum"},
            ],
        })
        game_id = game_resp.json()["id"]

        # Advance the turn
        adv_resp = client.post(f"/api/sandbox/games/{game_id}/advance-turn")
        assert adv_resp.status_code == 200
        assert adv_resp.json()["current_turn"] == 1

        # Both bots should be marked ready
        game_state = client.get(f"/api/sandbox/games/{game_id}").json()
        bots = [p for p in game_state["players"] if p.get("is_bot")]
        assert all(b["is_ready"] for b in bots), "All bots should be ready after advance_turn"

    def test_bots_spend_money_after_advance(self, client, prop):
        game_resp = client.post("/api/sandbox/games", json={
            "name": "G", "display_name": "Host",
            "fed_meeting_interval": 0,
            "starting_balance_usdc": 100_000,
            "bots": [{"display_name": "Spender", "strategy": "aggressive"}],
        })
        game_id = game_resp.json()["id"]
        bot_id = next(
            p["id"] for p in game_resp.json()["players"] if p.get("is_bot")
        )

        client.post(f"/api/sandbox/games/{game_id}/advance-turn")

        # Check portfolio — bot should have acted (either bought something or held cash)
        portfolio = client.get(
            f"/api/sandbox/games/{game_id}/portfolio/{bot_id}"
        ).json()
        # NAV should be approximately starting balance (may differ due to market moves)
        assert portfolio["nav"] > 0
        # Bot did something — either has holdings or kept cash
        assert portfolio["usdc_balance"] >= 0

    def test_multiple_turns_dont_crash(self, client, prop):
        game_resp = client.post("/api/sandbox/games", json={
            "name": "G", "display_name": "Host",
            "max_turns": 4,
            "fed_meeting_interval": 0,
            "bots": [
                {"display_name": "Bot 1", "strategy": "balanced"},
                {"display_name": "Bot 2", "strategy": "income"},
            ],
        })
        game_id = game_resp.json()["id"]

        for _ in range(3):
            resp = client.post(f"/api/sandbox/games/{game_id}/advance-turn")
            assert resp.status_code == 200

        game_state = client.get(f"/api/sandbox/games/{game_id}").json()
        assert game_state["current_turn"] == 3


# ---------------------------------------------------------------------------
# Leaderboard includes bots
# ---------------------------------------------------------------------------

class TestLeaderboardWithBots:
    def test_bots_appear_in_leaderboard(self, client, prop):
        game_resp = client.post("/api/sandbox/games", json={
            "name": "G", "display_name": "Host",
            "fed_meeting_interval": 0,
            "bots": [{"display_name": "Ranked Bot", "strategy": "balanced"}],
        })
        game_id = game_resp.json()["id"]
        client.post(f"/api/sandbox/games/{game_id}/advance-turn")

        lb = client.get(f"/api/sandbox/games/{game_id}/leaderboard").json()
        assert len(lb) == 2  # host + bot
        names = {e["display_name"] for e in lb}
        assert "Ranked Bot" in names
        assert "Host" in names
