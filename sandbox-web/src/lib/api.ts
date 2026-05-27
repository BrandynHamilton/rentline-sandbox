/**
 * Sandbox API types + client factory.
 * Mirror of the backend schemas in sandbox-api/app/api/routes/sandbox.py
 */

const BASE_URL =
  process.env.NEXT_PUBLIC_SANDBOX_API_URL ?? "http://localhost:6532"

// ---------------------------------------------------------------------------
// Shared fetch helper
// ---------------------------------------------------------------------------

async function fetchApi<T>(
  path: string,
  options?: RequestInit,
  token?: string | null
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string>),
  }
  if (token) {
    headers["Authorization"] = `Bearer ${token}`
  }
  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(body.detail ?? `API error ${res.status}`)
  }
  return res.json() as Promise<T>
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SandboxGame {
  id: string
  name: string
  status: "lobby" | "trading" | "advancing" | "completed"
  current_turn: number
  max_turns: number
  starting_balance_usdc: number
  invite_code: string
  player_count: number
  created_by: string
  started_at: string | null
  ended_at: string | null
  created_at: string
  // Full response fields
  players?: SandboxPlayer[]
  properties?: SandboxGameProperty[]
  // Debt / Fed config
  ltv_limit?: number
  base_mortgage_rate?: number
  fed_rate_current?: number
  fed_meeting_interval?: number
}

export interface SandboxPlayer {
  id: string
  clerk_user_id: string
  display_name: string
  usdc_balance: number
  wallet_address: string | null
  is_ready: boolean
  is_host: boolean
  joined_at: string
}

export interface SandboxGameProperty {
  id: string
  property_id: string
  name: string | null
  display_address: string | null
  current_price_usd: number
  current_rent_usd: number
  cap_rate: number | null
  image_url: string | null
  token_address: string | null
}

export interface SandboxProperty {
  id: string
  geo_id: string
  name: string
  display_address: string | null
  city: string | null
  state: string | null
  property_type: string | null
  initial_price_usd: number
  monthly_rent_usd: number
  cap_rate: number | null
  image_url: string | null
  token_address: string | null
  is_active: boolean
}

export interface SandboxTurnEvent {
  id: string
  turn: number
  event_type: string
  property_id: string | null
  player_id: string | null
  description: string
  delta_usdc: number
  delta_pct: number
  macro_event_id: string | null
  created_at: string
}

export interface SandboxTransaction {
  transaction_id: string
  type: string
  property_id: string | null
  tokens: number | null
  amount_usdc: number | null
  price_per_token_usd: number | null
  turn: number
}

export interface SandboxHolding {
  property_id: string
  property_name: string | null
  tokens_held: number
  avg_purchase_price_usd: number | null
  current_price_usd: number
  current_value_usd: number
  cost_basis_usd: number
  unrealized_pnl_usd: number
  total_rent_received_usd: number
}

export interface SandboxPortfolio {
  player_id: string
  display_name: string
  usdc_balance: number
  holdings: SandboxHolding[]
  nav: number
  gross_asset_value: number
  total_debt: number
  leverage_ratio: number
}

export interface SandboxMortgage {
  id: string
  mortgage_type: "acquisition" | "refi" | "heloc" | "heloan"
  property_id: string
  status: "active" | "paid_off" | "defaulted" | "foreclosed"
  original_balance: number
  current_balance: number
  origination_rate: number
  current_rate: number
  rate_type: "fixed" | "arm"
  amortizing: boolean
  monthly_payment: number
  credit_limit: number | null
  drawn_balance: number | null
  closing_cost_paid: number
  turns_in_arrears: number
  origination_turn: number
  origination_price_usd: number
  total_interest_paid: number
  total_principal_paid: number
}

export interface SandboxFedDecision {
  id: string
  turn: number
  outcome: "hike" | "cut" | "hold"
  move_bps: number
  rate_before: number
  rate_after: number
  mortgage_rate_before: number
  mortgage_rate_after: number
  statement: string
  created_at: string
}

export interface LeaderboardEntry {
  player_id: string
  display_name: string
  clerk_user_id: string
  usdc_balance: number
  nav: number
  is_host: boolean
  rank: number
}

// ---------------------------------------------------------------------------
// API client factory
// ---------------------------------------------------------------------------

export function createSandboxApiClient(token: string | null) {
  const t = token

  return {
    // ── Games ───────────────────────────────────────────────────────────────
    listGames: () =>
      fetchApi<SandboxGame[]>("/api/sandbox/games", undefined, t),

    getGame: (id: string) =>
      fetchApi<SandboxGame>(`/api/sandbox/games/${id}`, undefined, t),

    createGame: (body: {
      name: string
      display_name: string
      max_turns?: number
      starting_balance_usdc?: number
      property_ids?: string[]
      ltv_limit?: number
      default_rate_type?: "fixed" | "arm"
      amortizing?: boolean
      fed_meeting_interval?: number
      fed_rate_current?: number
    }) =>
      fetchApi<SandboxGame>(
        "/api/sandbox/games",
        { method: "POST", body: JSON.stringify(body) },
        t
      ),

    joinGame: (id: string, body: { invite_code: string; display_name: string; wallet_address?: string }) =>
      fetchApi<{ player_id: string; game_id: string; invite_code: string }>(
        `/api/sandbox/games/${id}/join`,
        { method: "POST", body: JSON.stringify(body) },
        t
      ),

    leaveGame: (id: string) =>
      fetchApi<void>(`/api/sandbox/games/${id}/leave`, { method: "DELETE" }, t),

    markReady: (id: string) =>
      fetchApi<{ player_id: string; is_ready: boolean }>(
        `/api/sandbox/games/${id}/ready`,
        { method: "POST" },
        t
      ),

    advanceTurn: (id: string) =>
      fetchApi<{ game_id: string; current_turn: number; status: string; max_turns: number }>(
        `/api/sandbox/games/${id}/advance-turn`,
        { method: "POST" },
        t
      ),

    // ── Feed ────────────────────────────────────────────────────────────────
    getFeed: (id: string, params?: { turn?: number; skip?: number; limit?: number }) => {
      const q = new URLSearchParams()
      if (params?.turn !== undefined) q.set("turn", String(params.turn))
      if (params?.skip !== undefined) q.set("skip", String(params.skip))
      if (params?.limit !== undefined) q.set("limit", String(params.limit))
      const qs = q.toString() ? `?${q.toString()}` : ""
      return fetchApi<SandboxTurnEvent[]>(`/api/sandbox/games/${id}/feed${qs}`, undefined, t)
    },

    getLeaderboard: (id: string) =>
      fetchApi<LeaderboardEntry[]>(`/api/sandbox/games/${id}/leaderboard`, undefined, t),

    getGlobalLeaderboard: (limit = 50) =>
      fetchApi<LeaderboardEntry[]>(`/api/sandbox/leaderboard?limit=${limit}`, undefined, t),

    // ── Portfolio ───────────────────────────────────────────────────────────
    getPortfolio: (gameId: string, playerId: string) =>
      fetchApi<SandboxPortfolio>(`/api/sandbox/games/${gameId}/portfolio/${playerId}`, undefined, t),

    getDebt: (gameId: string, playerId: string) =>
      fetchApi<SandboxMortgage[]>(`/api/sandbox/games/${gameId}/debt/${playerId}`, undefined, t),

    // ── Trading ─────────────────────────────────────────────────────────────
    trade: (gameId: string, body: { property_id: string; direction: "buy" | "sell"; tokens: number }) =>
      fetchApi<SandboxTransaction>(
        `/api/sandbox/games/${gameId}/trade`,
        { method: "POST", body: JSON.stringify(body) },
        t
      ),

    // ── Mortgage ────────────────────────────────────────────────────────────
    originateMortgage: (gameId: string, body: { property_id: string; tokens_to_buy: number; rate_type?: "fixed" | "arm" }) =>
      fetchApi<SandboxMortgage>(
        `/api/sandbox/games/${gameId}/mortgage`,
        { method: "POST", body: JSON.stringify(body) },
        t
      ),

    refi: (gameId: string, body: { property_id: string; cash_out_amount?: number; new_rate_type?: "fixed" | "arm" }) =>
      fetchApi<SandboxMortgage>(
        `/api/sandbox/games/${gameId}/refi`,
        { method: "POST", body: JSON.stringify(body) },
        t
      ),

    helocDraw: (gameId: string, body: { property_id: string; draw_amount: number }) =>
      fetchApi<SandboxMortgage>(
        `/api/sandbox/games/${gameId}/heloc/draw`,
        { method: "POST", body: JSON.stringify(body) },
        t
      ),

    helocRepay: (gameId: string, body: { property_id: string; repay_amount: number }) =>
      fetchApi<SandboxMortgage>(
        `/api/sandbox/games/${gameId}/heloc/repay`,
        { method: "POST", body: JSON.stringify(body) },
        t
      ),

    // ── Fed ─────────────────────────────────────────────────────────────────
    getFedHistory: (gameId: string) =>
      fetchApi<SandboxFedDecision[]>(`/api/sandbox/games/${gameId}/fed`, undefined, t),

    // ── Property pool ───────────────────────────────────────────────────────
    listProperties: (activeOnly = true) =>
      fetchApi<SandboxProperty[]>(
        `/api/sandbox/properties?active_only=${activeOnly}`,
        undefined,
        t
      ),

    getProperty: (id: string) =>
      fetchApi<SandboxProperty & { price_snapshots: object[] }>(
        `/api/sandbox/properties/${id}`,
        undefined,
        t
      ),

    health: () => fetchApi<{ status: string; service: string }>("/health"),
  }
}

export type SandboxApiClient = ReturnType<typeof createSandboxApiClient>
