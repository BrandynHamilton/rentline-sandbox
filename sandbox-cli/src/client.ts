/**
 * client.ts — HTTP client for the sandbox-api backend
 *
 * All methods throw on non-2xx responses with a readable error message.
 * Auth: X-API-Key header for admin routes, Authorization: Bearer for player routes.
 * The CLI passes whichever key it has; the server determines access level.
 */

export interface RequestOptions {
  apiUrl: string;
  apiKey?: string;
}

async function request<T>(
  opts: RequestOptions,
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const url = `${opts.apiUrl.replace(/\/$/, "")}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (opts.apiKey) {
    // Try as both admin key and Bearer — server accepts X-API-Key for admin,
    // Authorization: Bearer for Clerk sessions. CLI uses admin key pattern.
    headers["X-API-Key"] = opts.apiKey;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      detail = j.detail ?? JSON.stringify(j);
    } catch {}
    throw new Error(`[${res.status}] ${detail}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// API surface — mirrors sandbox-api routes exactly
// ---------------------------------------------------------------------------

export function createClient(opts: RequestOptions) {
  const r = <T>(method: string, path: string, body?: unknown) =>
    request<T>(opts, method, path, body);

  return {
    // ── Health ───────────────────────────────────────────────────────────────
    health: () => r<{ status: string; service: string }>("GET", "/health"),

    // ── Games ────────────────────────────────────────────────────────────────
    listGames: () => r<Game[]>("GET", "/api/sandbox/games"),
    getGame: (id: string) => r<GameFull>("GET", `/api/sandbox/games/${id}`),
    createGame: (body: CreateGameBody) =>
      r<GameFull>("POST", "/api/sandbox/games", body),
    joinGame: (id: string, body: JoinBody) =>
      r<JoinResult>("POST", `/api/sandbox/games/${id}/join`, body),
    leaveGame: (id: string) =>
      r<void>("DELETE", `/api/sandbox/games/${id}/leave`),
    markReady: (id: string) =>
      r<ReadyResult>("POST", `/api/sandbox/games/${id}/ready`),
    advanceTurn: (id: string) =>
      r<TurnResult>("POST", `/api/sandbox/games/${id}/advance-turn`),
    getFeed: (id: string, params?: FeedParams) => {
      const q = new URLSearchParams();
      if (params?.turn !== undefined) q.set("turn", String(params.turn));
      if (params?.limit !== undefined) q.set("limit", String(params.limit));
      const qs = q.toString() ? `?${q.toString()}` : "";
      return r<FeedEvent[]>("GET", `/api/sandbox/games/${id}/feed${qs}`);
    },
    getLeaderboard: (id: string) => r<LeaderboardEntry[]>("GET", `/api/sandbox/games/${id}/leaderboard`),
    getGlobalLeaderboard: (limit = 50) =>
      r<LeaderboardEntry[]>("GET", `/api/sandbox/leaderboard?limit=${limit}`),

    // ── Portfolio / debt ─────────────────────────────────────────────────────
    getPortfolio: (gameId: string, playerId: string) =>
      r<Portfolio>("GET", `/api/sandbox/games/${gameId}/portfolio/${playerId}`),
    getDebt: (gameId: string, playerId: string) =>
      r<Mortgage[]>("GET", `/api/sandbox/games/${gameId}/debt/${playerId}`),

    // ── Trading ──────────────────────────────────────────────────────────────
    trade: (gameId: string, body: TradeBody) =>
      r<TradeResult>("POST", `/api/sandbox/games/${gameId}/trade`, body),

    // ── Mortgage ─────────────────────────────────────────────────────────────
    originateMortgage: (gameId: string, body: MortgageBody) =>
      r<Mortgage>("POST", `/api/sandbox/games/${gameId}/mortgage`, body),
    refi: (gameId: string, body: RefiBody) =>
      r<Mortgage>("POST", `/api/sandbox/games/${gameId}/refi`, body),
    helocDraw: (gameId: string, body: HelocDrawBody) =>
      r<Mortgage>("POST", `/api/sandbox/games/${gameId}/heloc/draw`, body),
    helocRepay: (gameId: string, body: HelocRepayBody) =>
      r<Mortgage>("POST", `/api/sandbox/games/${gameId}/heloc/repay`, body),

    // ── Fed ──────────────────────────────────────────────────────────────────
    getFedHistory: (gameId: string) =>
      r<FedDecision[]>("GET", `/api/sandbox/games/${gameId}/fed`),

    // ── Property pool (admin) ────────────────────────────────────────────────
    listProperties: (activeOnly = true) =>
      r<Property[]>("GET", `/api/sandbox/properties?active_only=${activeOnly}`),
    syncProperties: () =>
      r<SyncResult>("POST", "/api/sandbox/properties/sync"),
    mintTusdc: (gameId: string, playerId: string, amount: number) =>
      r<MintResult>("POST", `/api/sandbox/games/${gameId}/mint-tusdc`, { player_id: playerId, amount }),

    // ── Bots ─────────────────────────────────────────────────────────────────
    addBot: (gameId: string, body: AddBotBody) =>
      r<BotResult>("POST", `/api/sandbox/games/${gameId}/bots`, body),
    removeBot: (gameId: string, botPlayerId: string) =>
      r<void>("DELETE", `/api/sandbox/games/${gameId}/bots/${botPlayerId}`),

    // ── Autonomous mode ───────────────────────────────────────────────────────
    startAutonomous: (gameId: string, delaySeconds?: number) =>
      r<AutonomousResult>("POST", `/api/sandbox/games/${gameId}/autonomous`, { delay_seconds: delaySeconds ?? 30 }),
    stopAutonomous: (gameId: string) =>
      r<AutonomousResult>("DELETE", `/api/sandbox/games/${gameId}/autonomous`),
  };
}

export type SandboxClient = ReturnType<typeof createClient>;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Game {
  id: string; name: string; status: string; current_turn: number;
  max_turns: number; invite_code: string; player_count: number; created_by: string;
  started_at: string | null; ended_at: string | null; created_at: string;
}
export interface Player {
  id: string; clerk_user_id: string; display_name: string;
  usdc_balance: number; is_ready: boolean; is_host: boolean;
}
export interface GameProperty {
  id: string; property_id: string; name: string | null;
  current_price_usd: number; current_rent_usd: number; cap_rate: number | null;
}
export interface GameFull extends Game {
  players: Player[];
  properties: GameProperty[];
  starting_balance_usdc: number;
  ltv_limit: number; base_mortgage_rate: number;
  fed_rate_current: number; fed_meeting_interval: number;
}
export interface FeedEvent {
  id: string; turn: number; event_type: string;
  property_id: string | null; player_id: string | null;
  description: string; delta_usdc: number; delta_pct: number;
  macro_event_id: string | null; created_at: string;
}
export interface LeaderboardEntry {
  player_id: string; display_name: string; usdc_balance: number;
  nav: number; is_host: boolean; rank: number;
}
export interface Holding {
  property_id: string; property_name: string | null; tokens_held: number;
  avg_purchase_price_usd: number | null; current_price_usd: number;
  current_value_usd: number; unrealized_pnl_usd: number; total_rent_received_usd: number;
}
export interface Portfolio {
  player_id: string; display_name: string; usdc_balance: number;
  holdings: Holding[]; nav: number; gross_asset_value: number;
  total_debt: number; leverage_ratio: number;
}
export interface Mortgage {
  id: string; mortgage_type: string; property_id: string;
  status: string; current_balance: number; origination_rate: number;
  current_rate: number; rate_type: string; monthly_payment: number;
  credit_limit: number | null; drawn_balance: number | null;
  turns_in_arrears: number; origination_turn: number;
  total_interest_paid: number; total_principal_paid: number;
}
export interface FedDecision {
  id: string; turn: number; outcome: string; move_bps: number;
  rate_before: number; rate_after: number;
  mortgage_rate_before: number; mortgage_rate_after: number;
  statement: string; created_at: string;
}
export interface Property {
  id: string; geo_id: string; name: string; city: string | null;
  state: string | null; initial_price_usd: number; monthly_rent_usd: number;
  cap_rate: number | null; is_active: boolean;
}
export interface CreateGameBody {
  name: string; display_name: string;
  max_turns?: number; starting_balance_usdc?: number;
  property_ids?: string[]; ltv_limit?: number;
  default_rate_type?: string; amortizing?: boolean;
  fed_meeting_interval?: number; fed_rate_current?: number;
  bots?: Array<{ display_name: string; strategy?: string; personality?: string }>;
}
export interface JoinBody { invite_code: string; display_name: string; wallet_address?: string; }
export interface JoinResult { player_id: string; game_id: string; invite_code: string; }
export interface ReadyResult { player_id: string; is_ready: boolean; }
export interface TurnResult { game_id: string; current_turn: number; status: string; max_turns: number; }
export interface FeedParams { turn?: number; limit?: number; }
export interface TradeBody { property_id: string; direction: "buy" | "sell"; tokens: number; }
export interface TradeResult { transaction_id: string; type: string; tokens: number; amount_usdc: number; price_per_token_usd: number; }
export interface MortgageBody { property_id: string; tokens_to_buy: number; rate_type?: string; }
export interface RefiBody { property_id: string; cash_out_amount?: number; new_rate_type?: string; }
export interface HelocDrawBody { property_id: string; draw_amount: number; }
export interface HelocRepayBody { property_id: string; repay_amount: number; }
export interface SyncResult { created: number; updated: number; skipped: number; }
export interface MintResult { player_id: string; usdc_balance: number; }
export interface AddBotBody { display_name: string; strategy?: string; personality?: string; }
export interface BotResult { player_id: string; display_name: string; strategy: string; personality: string | null; is_bot: true; }
export interface AutonomousResult { game_id: string; auto_advance: boolean; auto_advance_delay_seconds: number; status: string; current_turn: number; max_turns: number; message: string; }
