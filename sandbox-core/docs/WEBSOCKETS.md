# WebSocket Usage — Current State & Opportunities

## What exists today

The WebSocket infrastructure is already in place but only partially wired up.

| File | What it does |
|---|---|
| `sandbox-api/app/api/routes/ws.py` | Single endpoint `ws://host/api/ws?token=<clerk_jwt>`. Authenticates via Clerk JWT, sends a `ping` every 30s. |
| `sandbox-api/app/core/ws_manager.py` | Global `ConnectionManager` — broadcasts JSON to all connected clients. `broadcast_sync()` bridges from sync engine threads to the async event loop. |
| `sandbox-web/src/lib/use-sandbox-ws.ts` | React hook — opens the WS, handles `ping→pong`, forwards all other messages to a caller-supplied `onMessage` callback. |
| `sandbox-engine.py` | Calls `broadcast_sync("sandbox.turn_advanced", {game_id, turn, status})` after each `advance_turn()` and `broadcast_sync("sandbox.game_completed", {game_id})` when a game ends. |

### What's missing

- The web hook (`use-sandbox-ws.ts`) exists but is **never used in any page**
- The broadcast is **global** — every connected client receives every game's events
- The payload is **minimal** — just `{game_id, turn, status}`, not full game state

---

## Current vs ideal data flow

```
Current (REST only):
  Client → POST /advance-turn → Response (turn result)
  Client → GET /feed          → Response (events so far)
  Client → GET /game          → Response (full state)
  # Client has to poll or manually refresh to see changes

Ideal (WS-augmented):
  Client → POST /advance-turn → Response (ack)
  Server → WS push            → {event: "turn_advanced", game_id, turn, events[], state_delta}
  # Client gets notified immediately, no polling needed
```

---

## Where WebSockets make sense right now

### 1. Turn advance notifications → trigger UI refresh (easiest win)

**File:** `sandbox-web/src/lib/use-sandbox-ws.ts` already exists.  
**Missing piece:** No game page uses it yet.

When `sandbox.turn_advanced` arrives, the game page should re-fetch game state and feed. This gives the web UI real-time updates during autonomous mode — players watching the game progress without refreshing.

```typescript
// In a game page:
useSandboxWs({
  onMessage: (msg) => {
    if (msg.event === "sandbox.turn_advanced" && msg.data.game_id === gameId) {
      refetchGame()
      refetchFeed()
    }
  }
})
```

No server changes needed. The engine already broadcasts this event.

---

### 2. Live feed streaming during autonomous mode

**Current:** Feed is fetched via `GET /feed` — a snapshot at a point in time.  
**With WS:** Each turn event (rent collected, price move, Fed decision, macro event, debt service) could be pushed as it fires, giving a live event stream.

The engine already emits `SandboxTurnEvent` rows for every phase. Broadcasting them over WS as they're created would let the web UI or an agent watch a game play out in real-time — like a live ticker.

```json
{
  "event": "sandbox.turn_event",
  "data": {
    "game_id": "...",
    "turn": 4,
    "event_type": "FOMC_DECISION",
    "description": "Fed hikes 25bps — mortgage rates rise.",
    "delta_pct": 0.0025
  }
}
```

**Server change needed:** `_emit_event()` in `sandbox_engine.py` would call `broadcast_sync` for each event in addition to writing to the DB.

---

### 3. Game completion notification

Already broadcast (`sandbox.game_completed`). Should trigger:
- Web UI: show final leaderboard, confetti, disable trading buttons
- Mobile: push notification (via the WS message triggering a local notification)
- Agent/MCP: signal that the game loop is done

---

### 4. Per-game room subscriptions (needed for multi-game support)

**Current problem:** All connected clients receive all game events. If 10 games are running simultaneously, every client gets events for all 10.

**Fix:** Clients send a subscribe message on connect:
```json
{ "type": "subscribe", "game_id": "abc123" }
```
Server tracks `{game_id: set[WebSocket]}` and only broadcasts to subscribed clients.

This is straightforward to add to `ws_manager.py` and `ws.py` without breaking the current interface.

---

### 5. Trade window open/close notifications

When a turn completes, the trade window opens. When the host calls `advance_turn` again (or autonomous mode fires), it closes. Clients need to know this to enable/disable trading UI.

```json
{ "event": "sandbox.trade_window_opened", "data": { "game_id": "...", "turn": 3 } }
{ "event": "sandbox.trade_window_closed",  "data": { "game_id": "...", "turn": 3 } }
```

Without WS, a client trading slightly after a turn starts would get a `409 Game is advancing` error with no warning. With WS, the UI can disable the trade button as soon as the window closes.

---

### 6. Player ready state sync (lobby)

In the lobby, players mark themselves ready before the host can advance turn 1. Without WS, each player has to refresh to see who else is ready. With WS:

```json
{ "event": "sandbox.player_ready", "data": { "game_id": "...", "player_id": "...", "display_name": "Alice", "is_ready": true } }
```

All lobby participants see the ready indicators update in real-time.

---

### 7. Bot action notifications

After `advance_turn`, each bot makes its decisions and trades. Currently these are silent to the client — only visible via a subsequent `GET /feed` call. With WS, bot trades could be broadcast as they execute:

```json
{
  "event": "sandbox.bot_action",
  "data": {
    "game_id": "...",
    "player_id": "...",
    "display_name": "Gordon Gekko",
    "action": "buy_tokens",
    "property_name": "Austin Multifamily",
    "tokens": 0.25,
    "amount_usdc": 125000
  }
}
```

This makes autonomous mode watchable — like a spectator mode where you see each bot act.

---

## Future: mobile app

If a mobile app (React Native / Expo) is built, WebSockets become more important because:

- **Background awareness:** The WS connection can be maintained while the app is foregrounded, triggering local notifications when events occur (Fed meeting, macro event, game completed)
- **No polling battery drain:** A persistent WS connection is far more efficient than polling every N seconds
- **Push for async games:** In a longer-running game (24–48 turns), players may not be watching. A WS event on turn completion can trigger a push notification via Expo Notifications or Firebase

The existing `use-sandbox-ws.ts` hook pattern translates directly to React Native using the native `WebSocket` API — no library changes needed.

### Suggested mobile event subscriptions

| Event | Mobile behaviour |
|---|---|
| `sandbox.turn_advanced` | Badge update on game icon, optional local notification |
| `sandbox.trade_window_opened` | "Your turn to trade" notification if app is backgrounded |
| `sandbox.game_completed` | "Game over — see final results" push notification |
| `sandbox.fomc_decision` | "Fed hiked 25bps" notification for active games |
| `sandbox.macro_event` | "Recession hit your portfolio" notification |
| `sandbox.mortgage_default` | Urgent: "Forced sale triggered on [property]" |

---

## Summary: priority order

| Priority | Change | Effort | Value |
|---|---|---|---|
| 1 | Wire `use-sandbox-ws.ts` into game pages — refetch on `turn_advanced` | Low | Immediate: autonomous mode is watchable in the web UI |
| 2 | Broadcast each `_emit_event()` call — live feed streaming | Low | Real-time event ticker in UI and agents |
| 3 | Per-game room subscriptions in `ws_manager.py` | Medium | Required before any multi-game production use |
| 4 | Trade window open/close events | Low | Better UX, avoids confusing 409 errors |
| 5 | Player ready state events | Low | Lobby UX |
| 6 | Bot action events | Low | Spectator/autonomous mode experience |
| 7 | Mobile push via WS → local notifications | High | Only relevant once mobile app exists |
