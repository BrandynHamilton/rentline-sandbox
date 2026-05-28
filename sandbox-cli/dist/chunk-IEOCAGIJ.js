#!/usr/bin/env node

// src/client.ts
async function request(opts, method, path, body) {
  const url = `${opts.apiUrl.replace(/\/$/, "")}${path}`;
  const headers = {
    "Content-Type": "application/json"
  };
  if (opts.apiKey) {
    headers["X-API-Key"] = opts.apiKey;
  }
  const res = await fetch(url, {
    method,
    headers,
    body: body !== void 0 ? JSON.stringify(body) : void 0
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      detail = j.detail ?? JSON.stringify(j);
    } catch {
    }
    throw new Error(`[${res.status}] ${detail}`);
  }
  if (res.status === 204) return void 0;
  return res.json();
}
function createClient(opts) {
  const r = (method, path, body) => request(opts, method, path, body);
  return {
    // ── Health ───────────────────────────────────────────────────────────────
    health: () => r("GET", "/health"),
    // ── Games ────────────────────────────────────────────────────────────────
    listGames: () => r("GET", "/api/sandbox/games"),
    getGame: (id) => r("GET", `/api/sandbox/games/${id}`),
    createGame: (body) => r("POST", "/api/sandbox/games", body),
    joinGame: (id, body) => r("POST", `/api/sandbox/games/${id}/join`, body),
    leaveGame: (id) => r("DELETE", `/api/sandbox/games/${id}/leave`),
    markReady: (id) => r("POST", `/api/sandbox/games/${id}/ready`),
    advanceTurn: (id) => r("POST", `/api/sandbox/games/${id}/advance-turn`),
    getFeed: (id, params) => {
      const q = new URLSearchParams();
      if (params?.turn !== void 0) q.set("turn", String(params.turn));
      if (params?.limit !== void 0) q.set("limit", String(params.limit));
      const qs = q.toString() ? `?${q.toString()}` : "";
      return r("GET", `/api/sandbox/games/${id}/feed${qs}`);
    },
    getLeaderboard: (id) => r("GET", `/api/sandbox/games/${id}/leaderboard`),
    getGlobalLeaderboard: (limit = 50) => r("GET", `/api/sandbox/leaderboard?limit=${limit}`),
    // ── Portfolio / debt ─────────────────────────────────────────────────────
    getPortfolio: (gameId, playerId) => r("GET", `/api/sandbox/games/${gameId}/portfolio/${playerId}`),
    getDebt: (gameId, playerId) => r("GET", `/api/sandbox/games/${gameId}/debt/${playerId}`),
    // ── Trading ──────────────────────────────────────────────────────────────
    trade: (gameId, body) => r("POST", `/api/sandbox/games/${gameId}/trade`, body),
    // ── Mortgage ─────────────────────────────────────────────────────────────
    originateMortgage: (gameId, body) => r("POST", `/api/sandbox/games/${gameId}/mortgage`, body),
    refi: (gameId, body) => r("POST", `/api/sandbox/games/${gameId}/refi`, body),
    helocDraw: (gameId, body) => r("POST", `/api/sandbox/games/${gameId}/heloc/draw`, body),
    helocRepay: (gameId, body) => r("POST", `/api/sandbox/games/${gameId}/heloc/repay`, body),
    // ── Fed ──────────────────────────────────────────────────────────────────
    getFedHistory: (gameId) => r("GET", `/api/sandbox/games/${gameId}/fed`),
    // ── Property pool (admin) ────────────────────────────────────────────────
    listProperties: (activeOnly = true) => r("GET", `/api/sandbox/properties?active_only=${activeOnly}`),
    syncProperties: () => r("POST", "/api/sandbox/properties/sync"),
    mintTusdc: (gameId, playerId, amount) => r("POST", `/api/sandbox/games/${gameId}/mint-tusdc`, { player_id: playerId, amount })
  };
}

export {
  createClient
};
//# sourceMappingURL=chunk-IEOCAGIJ.js.map