/**
 * Rentline Sandbox API client
 * Base URL: process.env.NEXT_PUBLIC_SANDBOX_API_URL
 * Auth: Clerk JWT (web) | Admin API key (server-side only)
 */

const BASE_URL = process.env.NEXT_PUBLIC_SANDBOX_API_URL ?? 'https://sandbox-api.rentline.xyz';

// ── Types ────────────────────────────────────────────────────────────────────

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';
export type Preset = 'quick' | 'standard' | 'leveraged' | 'distressed' | 'long_run';
export type BotStrategy = 'aggressive' | 'conservative' | 'balanced' | 'momentum' | 'income' | 'value_add';
export type RateType = 'fixed' | 'arm';
export type MortgageType = 'acquisition' | 'refi' | 'heloc' | 'first_lien' | 'pace' | 'mechanics_lien';
export type TradeDirection = 'buy' | 'sell';
export type TurnDuration = 'month' | 'year';

export interface BotSpec {
  display_name: string;
  strategy?: BotStrategy;
  personality?: string | null;
}

export interface Property {
  id: string;
  name: string;
  display_address?: string;
  city?: string;
  state?: string;
  location: string;
  property_type?: string;
  grade?: Grade;
  price: number;
  initial_price_usd?: number;
  rent_per_token: number;
  monthly_rent_usd?: number;
  cap_rate: number;
  total_tokens?: number;
  is_active?: boolean;
  active?: boolean;
  image_url?: string | null;
}

// Game property as returned by the API (snake_case, _usd suffix fields)
export interface GameProperty {
  id: string;                     // game_property row id
  property_id?: string;           // canonical property id
  name: string;
  display_address?: string;
  location?: string;
  grade: Grade;
  // API returns current_price_usd / current_rent_usd
  current_price_usd?: number;
  current_rent_usd?: number;
  // Normalised aliases used by components
  current_price: number;
  rent_per_token?: number;
  cap_rate?: number;
  vacancy?: boolean;
  mechanics_lien?: boolean;
  mechanics_lien_amount?: number;
  price_delta?: number;
}

export interface Player {
  id: string;
  game_id?: string;
  clerk_user_id?: string;
  display_name: string;
  usdc_balance: number;
  is_host: boolean;
  is_ready: boolean;
  is_bot: boolean;
  bot_strategy?: string;
  strategy?: string;
  nav?: number;
  investor_tier?: number;
  agent_delegate?: boolean;
}

export interface MacroEvent {
  id: string;
  event_type: string;
  turns_remaining: number;
  description?: string;
}

export interface FedState {
  rate_current: number;
  base_mortgage_rate: number;
  next_meeting_turn?: number;
  last_decision?: string;
}

export interface GameSettings {
  max_turns: number;
  turn_duration: TurnDuration;
  turn_duration_seconds: number;
  starting_balance_usdc: number;
  ltv_limit: number;
  default_rate_type: RateType;
  amortizing: boolean;
  upgrade_cost_pct: number;
  improvement_value_add_pct: number;
  pace_spread: number;
  fed_meeting_interval: number;
  judgment_on_shortfall: boolean;
}

export interface Game {
  id: string;
  name: string;
  invite_code: string;
  status: 'lobby' | 'trading' | 'advancing' | 'completed';
  preset?: Preset;
  current_turn: number;
  max_turns: number;
  turn_started_at?: string;
  turn_duration_seconds: number;
  auto_advance: boolean;
  // Full game object has players array; list endpoint only has player_count
  players: Player[];
  player_count?: number;
  properties: GameProperty[];
  active_macros?: MacroEvent[];
  fed?: FedState;
  settings?: GameSettings;
  // Individual settings also returned flat on the game object
  ltv_limit?: number;
  upgrade_cost_pct?: number;
  improvement_value_add_pct?: number;
  pace_spread?: number;
  created_at: string;
}

export interface LeaderboardEntry {
  rank: number;
  player_id?: string;
  clerk_user_id?: string;
  display_name: string;
  nav: number;
  usdc_balance?: number;
  cash?: number;
  // normalised
  investor_tier: number;
  investor_tier_name: string;
  // raw (game leaderboard)
  tier?: number | string;
  tier_name?: string;
  nav_delta?: number;
  is_bot: boolean;
  // global leaderboard extras
  game_id?: string;
  game_name?: string;
  turns?: number;
  preset?: string;
}

export interface Holding {
  property_id: string;
  property_name: string;
  grade: Grade;
  // normalised
  tokens_owned: number;
  current_price: number;
  cost_basis: number;
  unrealized_pnl: number;
  annualized_yield: number;
  turns_held: number;
  rent_per_turn: number;
  // raw
  tokens_held?: number;
  current_price_usd?: number;
  avg_purchase_price_usd?: number;
  unrealized_pnl_usd?: number;
  annualised_yield_pct?: number;
  total_rent_received_usd?: number;
  current_value_usd?: number;
}

export interface Mortgage {
  id: string;
  property_id: string;
  property_name: string;
  mortgage_type: MortgageType;
  // normalised fields (used by UI)
  balance: number;
  rate: number;
  rate_type: RateType;
  monthly_payment: number;
  origination_rate: number;
  paid_off: boolean;
  origination_turn: number;
  // raw API fields
  current_balance?: number;
  current_rate?: number;
  origination_rate_raw?: number;
  status?: string;
  ltv_current?: number;
  turns_in_arrears?: number;
}

export interface PortfolioTier {
  tier: number;
  name: string;
  nav: number;
  ltv_bonus: number;
  rate_discount_bps: number;
  next_tier?: { tier: number; name: string; min_nav: number };
}

export interface Portfolio {
  player_id: string;
  display_name: string;
  usdc_balance: number;
  nav: number;
  // normalised
  investor_tier: number;
  investor_tier_name: string;
  next_tier_nav?: number;
  // raw
  tier?: PortfolioTier;
  holdings: Holding[];
  total_debt: number;
  monthly_debt_service: number;
  gross_asset_value?: number;
  leverage_ratio?: number;
  judgment_balance: number;
}

export interface FeedEvent {
  id: string;
  turn: number;
  event_type: string;
  message: string;        // normalised (from description)
  description?: string;   // raw API field
  player_id?: string;
  property_id?: string;
  delta_usdc?: number;
  delta_pct?: number;
  amount?: number;
  created_at: string;
}

export interface TurnResult {
  turn: number;
  events: FeedEvent[];
  leaderboard: LeaderboardEntry[];
}

export interface GameSnapshot {
  game_id: string;
  name: string;
  status: string;
  current_turn: number;
  max_turns: number;
  leaderboard: LeaderboardEntry[];
  recent_feed: FeedEvent[];
  properties: GameProperty[];
}

export interface DebtSummary {
  player_id?: string;
  mortgages: Mortgage[];
  total_balance: number;
  total_monthly_payment: number;
}

export interface FedDecision {
  turn: number;
  decision: 'hike' | 'cut' | 'hold';
  rate_before: number;
  rate_after: number;
  statement: string;
  base_mortgage_rate: number;
}

export interface MarketSummaryItem {
  property_id: string;
  name: string;
  property_type?: string;
  grade: Grade;
  // normalised
  current_price: number;
  price_delta: number;
  cap_rate: number;
  vacancy: boolean;
  mechanics_lien: boolean;
  // raw
  current_price_usd?: number;
  current_rent_usd?: number;
  live_cap_rate?: number;
  price_delta_pct_this_turn?: number;
  vacant_this_turn?: boolean;
  mechanics_lien_active?: boolean;
  mechanics_lien_amount?: number;
  tokens_available?: number;
}

export interface PlayerAction {
  id?: string;
  turn: number;
  // API returns "type" not "action_type"
  type?: string;
  action_type?: string;
  label?: string;
  description: string;
  property_id?: string;
  property_name?: string;
  amount_usdc?: number;
  amount?: number;
  tokens?: number | null;
  price_per_token_usd?: number | null;
  created_at: string;
}

export interface ApiKeyResponse {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  expires_at?: string | null;
  raw_key?: string | null;
}

// ── Request types ────────────────────────────────────────────────────────────

export interface CreateGameOptions {
  name: string;
  display_name: string;
  max_turns?: number;
  starting_balance_usdc?: number;
  property_ids?: string[];
  turn_duration?: TurnDuration;
  turn_duration_seconds?: number;
  ltv_limit?: number;
  default_rate_type?: RateType;
  amortizing?: boolean;
  base_mortgage_rate?: number;
  arm_cap?: number;
  closing_cost_pct?: number;
  heloc_spread?: number;
  debt_service_default_penalty?: number;
  judgment_on_shortfall?: boolean;
  upgrade_cost_pct?: number;
  improvement_value_add_pct?: number;
  pace_spread?: number;
  fed_meeting_interval?: number;
  fed_rate_current?: number;
  auto_advance?: boolean;
  auto_advance_delay_seconds?: number;
  bots?: BotSpec[];
}

export interface PresetGameOptions {
  preset: Preset;
  name: string;
  display_name: string;
  starting_balance_usdc?: number;
  bots?: BotSpec[];
}

export interface OriginateMortgageOptions {
  property_id: string;
  tokens_to_buy: number;
  rate_type?: RateType;
}

export interface RefiOptions {
  property_id: string;
  cash_out_amount?: number;
  new_rate_type?: RateType;
}

export interface BotOptions {
  display_name: string;
  strategy?: BotStrategy;
  personality?: string;
}

// ── Response normalizers ─────────────────────────────────────────────────────
// The API returns slightly different field names depending on the endpoint.
// These functions normalise raw responses to consistent shapes for the UI.

function normalizeGameProperty(p: Record<string, unknown>): GameProperty {
  const price = (p.current_price_usd ?? p.current_price ?? 0) as number;
  const rent = (p.current_rent_usd ?? p.rent_per_token ?? 0) as number;
  // Build location string: prefer "City, ST" from pool data, fall back to display_address
  const city = p.city as string | undefined;
  const state = p.state as string | undefined;
  const locationStr = city && state ? `${city}, ${state}` : city ?? (p.display_address ?? p.location ?? '') as string;
  return {
    ...(p as unknown as GameProperty),
    current_price: price,
    rent_per_token: rent,
    location: locationStr,
    cap_rate: (p.live_cap_rate ?? p.cap_rate ?? 0) as number,
    vacancy: (p.vacant_this_turn ?? p.vacancy ?? false) as boolean,
    mechanics_lien: ((p.mechanics_lien_amount as number ?? 0) > 0 || !!p.mechanics_lien_active || !!p.mechanics_lien) as boolean,
    price_delta: (p.price_delta_pct_this_turn ?? p.price_delta ?? undefined) as number | undefined,
  };
}

function normalizeMortgage(m: Record<string, unknown>): Mortgage {
  return {
    ...(m as unknown as Mortgage),
    balance: (m.current_balance ?? m.balance ?? 0) as number,
    rate: (m.current_rate ?? m.rate ?? 0) as number,
    origination_rate: (m.origination_rate ?? 0) as number,
    monthly_payment: (m.monthly_payment ?? 0) as number,
    paid_off: m.status === 'paid_off' || m.paid_off === true,
  };
}

function normalizeDebt(raw: unknown): DebtSummary {
  // API returns a flat array of mortgages, not a wrapped object
  const arr = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
  const mortgages = arr.map(normalizeMortgage);
  const active = mortgages.filter((m) => !m.paid_off);
  return {
    mortgages,
    total_balance: active.reduce((s, m) => s + m.balance, 0),
    total_monthly_payment: active.reduce((s, m) => s + m.monthly_payment, 0),
  };
}

function normalizeFeedEvent(e: Record<string, unknown>): FeedEvent {
  return {
    ...(e as unknown as FeedEvent),
    message: (e.description ?? e.message ?? '') as string,
  };
}

function normalizeHolding(h: Record<string, unknown>): Holding {
  return {
    ...(h as unknown as Holding),
    tokens_owned: (h.tokens_held ?? h.tokens_owned ?? 0) as number,
    current_price: (h.current_price_usd ?? h.current_price ?? 0) as number,
    cost_basis: (h.cost_basis_usd ?? h.cost_basis ?? 0) as number,
    unrealized_pnl: (h.unrealized_pnl_usd ?? h.unrealized_pnl ?? 0) as number,
    annualized_yield: (h.annualised_yield_pct ?? h.annualized_yield ?? 0) as number,
    turns_held: (h.turns_held ?? 0) as number,
    rent_per_turn: (h.total_rent_received_usd ?? h.rent_per_turn ?? 0) as number,
  };
}

function normalizePortfolio(raw: Record<string, unknown>): Portfolio {
  const tierObj = raw.tier as Record<string, unknown> | undefined;
  return {
    ...(raw as unknown as Portfolio),
    investor_tier: (tierObj?.tier ?? raw.investor_tier ?? 0) as number,
    investor_tier_name: (tierObj?.name ?? raw.investor_tier_name ?? 'Retail Investor') as string,
    next_tier_nav: (tierObj?.next_tier as Record<string, unknown> | undefined)?.min_nav as number | undefined,
    total_debt: (raw.total_debt ?? 0) as number,
    monthly_debt_service: (raw.monthly_debt_service ?? 0) as number,
    judgment_balance: (raw.judgment_balance ?? 0) as number,
    holdings: ((raw.holdings ?? []) as Record<string, unknown>[]).map(normalizeHolding),
  };
}

const TIER_NAME_TO_NUM: Record<string, number> = {
  'Retail Investor': 0, 'Accredited Investor': 1,
  'Professional Investor': 2, 'Institutional Investor': 3, 'Real Estate Developer': 4,
};

function normalizeLeaderboardEntry(e: Record<string, unknown>): LeaderboardEntry {
  // tier can be a number (game leaderboard), a string (spectate), or absent (global leaderboard)
  const tierRaw = e.tier ?? e.investor_tier;
  let tierNum = 0;
  let tierStr = 'Retail Investor';
  if (typeof tierRaw === 'string') {
    tierNum = TIER_NAME_TO_NUM[tierRaw] ?? 0;
    tierStr = tierRaw;
  } else if (typeof tierRaw === 'number') {
    tierNum = tierRaw;
    tierStr = (e.tier_name ?? e.investor_tier_name ?? Object.keys(TIER_NAME_TO_NUM)[tierRaw] ?? 'Retail Investor') as string;
  }
  // Global leaderboard: is_bot derived from clerk_user_id prefix
  const isBot = e.is_bot === true || (typeof e.clerk_user_id === 'string' && e.clerk_user_id.startsWith('bot_'));
  return {
    ...(e as unknown as LeaderboardEntry),
    investor_tier: tierNum,
    investor_tier_name: tierStr,
    is_bot: isBot,
    rank: (e.rank ?? 0) as number,
  };
}

function normalizeGame(g: Record<string, unknown>): Game {
  const raw = g as Game & Record<string, unknown>;
  return {
    ...raw,
    players: (raw.players ?? []) as Player[],
    properties: ((raw.properties ?? []) as unknown as Record<string, unknown>[]).map(normalizeGameProperty),
    active_macros: (raw.active_macros ?? []) as MacroEvent[],
    settings: (raw.settings ?? {
      upgrade_cost_pct: raw.upgrade_cost_pct ?? 0.08,
      improvement_value_add_pct: raw.improvement_value_add_pct ?? 0.05,
      pace_spread: raw.pace_spread ?? 0.015,
      ltv_limit: raw.ltv_limit ?? 0.70,
    }) as GameSettings,
    fed: (raw.fed ?? {}) as FedState,
  };
}

// ── Auth helpers ─────────────────────────────────────────────────────────────

type AuthMode = { type: 'bearer'; token: string } | { type: 'apikey'; key: string };

function authHeaders(auth?: AuthMode): Record<string, string> {
  if (!auth) return {};
  if (auth.type === 'bearer') return { Authorization: `Bearer ${auth.token}` };
  return { 'X-API-Key': auth.key };
}

// ── Core fetch wrapper ───────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options: RequestInit & { auth?: AuthMode } = {}
): Promise<T> {
  const { auth, ...fetchOptions } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...authHeaders(auth),
    ...(fetchOptions.headers as Record<string, string> ?? {}),
  };

  const res = await fetch(`${BASE_URL}${path}`, {
    ...fetchOptions,
    headers,
  });

  if (!res.ok) {
    let message = `API error ${res.status}`;
    try {
      const body = await res.json();
      message = body?.detail ?? message;
    } catch {}
    throw new Error(message);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── Client factory ───────────────────────────────────────────────────────────
// Web: uses sb_ API key if available (set NEXT_PUBLIC_SANDBOX_API_KEY in .env.local),
// otherwise falls back to Clerk JWT.

export function createApiClient(getToken: () => Promise<string | null>) {
  async function auth(): Promise<AuthMode> {
    // Prefer an explicit sb_ API key (avoids Clerk instance mismatch issues)
    const apiKey = process.env.NEXT_PUBLIC_SANDBOX_API_KEY;
    if (apiKey) return { type: 'apikey', key: apiKey };

    const token = await getToken();
    if (!token) throw new Error('Not authenticated');
    return { type: 'bearer', token };
  }

  return {
    // ── Lobby & games ──────────────────────────────────────────────────────

    async getGames(): Promise<Game[]> {
      const raw = await apiFetch<Record<string, unknown>[]>('/api/sandbox/games');
      return raw.map(normalizeGame);
    },

    async createGame(options: CreateGameOptions): Promise<Game> {
      const raw = await apiFetch<Record<string, unknown>>('/api/sandbox/games', {
        method: 'POST',
        body: JSON.stringify(options),
        auth: await auth(),
      });
      return normalizeGame(raw);
    },

    async createGameFromPreset(options: PresetGameOptions): Promise<Game> {
      const raw = await apiFetch<Record<string, unknown>>('/api/sandbox/games/from-preset', {
        method: 'POST',
        body: JSON.stringify(options),
        auth: await auth(),
      });
      return normalizeGame(raw);
    },

    async joinGame(gameId: string, inviteCode: string, displayName: string): Promise<Player> {
      return apiFetch<Player>(`/api/sandbox/games/${gameId}/join`, {
        method: 'POST',
        body: JSON.stringify({ invite_code: inviteCode, display_name: displayName }),
        auth: await auth(),
      });
    },

    async leaveGame(gameId: string): Promise<void> {
      return apiFetch<void>(`/api/sandbox/games/${gameId}/leave`, {
        method: 'DELETE',
        auth: await auth(),
      });
    },

    // ── Board ───────────────────────────────────────────────────────────────

    async getGame(gameId: string): Promise<Game> {
      const raw = await apiFetch<Record<string, unknown>>(`/api/sandbox/games/${gameId}`, {
        auth: await auth(),
      });
      return normalizeGame(raw);
    },

    async getPortfolio(gameId: string, playerId: string): Promise<Portfolio> {
      const raw = await apiFetch<Record<string, unknown>>(`/api/sandbox/games/${gameId}/portfolio/${playerId}`, {
        auth: await auth(),
      });
      return normalizePortfolio(raw);
    },

    async getFeed(gameId: string, turn?: number, skip = 0, limit = 50): Promise<FeedEvent[]> {
      const params = new URLSearchParams({ skip: String(skip), limit: String(limit) });
      if (turn != null) params.set('turn', String(turn));
      const raw = await apiFetch<Record<string, unknown>[]>(`/api/sandbox/games/${gameId}/feed?${params}`, {
        auth: await auth(),
      });
      return raw.map(normalizeFeedEvent);
    },

    async getLeaderboard(gameId: string): Promise<LeaderboardEntry[]> {
      const raw = await apiFetch<Record<string, unknown>[]>(`/api/sandbox/games/${gameId}/leaderboard`);
      return raw.map(normalizeLeaderboardEntry);
    },

    async markReady(gameId: string): Promise<void> {
      return apiFetch<void>(`/api/sandbox/games/${gameId}/ready`, {
        method: 'POST',
        auth: await auth(),
      });
    },

    async advanceTurn(gameId: string): Promise<TurnResult> {
      return apiFetch<TurnResult>(`/api/sandbox/games/${gameId}/advance-turn`, {
        method: 'POST',
        auth: await auth(),
      });
    },

    async getMarketSummary(gameId: string): Promise<MarketSummaryItem[]> {
      return apiFetch<MarketSummaryItem[]>(`/api/sandbox/games/${gameId}/market-summary`, {
        auth: await auth(),
      });
    },

    async getFedHistory(gameId: string): Promise<FedDecision[]> {
      return apiFetch<FedDecision[]>(`/api/sandbox/games/${gameId}/fed`, {
        auth: await auth(),
      });
    },

    async getDebt(gameId: string, playerId: string): Promise<DebtSummary> {
      const raw = await apiFetch<unknown>(`/api/sandbox/games/${gameId}/debt/${playerId}`, {
        auth: await auth(),
      });
      return normalizeDebt(raw);
    },

    async getPlayerActions(gameId: string, playerId: string, limit = 50, turn?: number): Promise<PlayerAction[]> {
      const params = new URLSearchParams({ limit: String(limit) });
      if (turn != null) params.set('turn', String(turn));
      return apiFetch<PlayerAction[]>(`/api/sandbox/games/${gameId}/players/${playerId}/actions?${params}`, {
        auth: await auth(),
      });
    },

    // ── Trading ─────────────────────────────────────────────────────────────

    async trade(gameId: string, propertyId: string, direction: TradeDirection, tokens: number): Promise<unknown> {
      return apiFetch(`/api/sandbox/games/${gameId}/trade`, {
        method: 'POST',
        body: JSON.stringify({ property_id: propertyId, direction, tokens }),
        auth: await auth(),
      });
    },

    // ── Debt & improvements ──────────────────────────────────────────────────

    async originateMortgage(gameId: string, options: OriginateMortgageOptions): Promise<Mortgage> {
      return apiFetch<Mortgage>(`/api/sandbox/games/${gameId}/mortgage`, {
        method: 'POST',
        body: JSON.stringify(options),
        auth: await auth(),
      });
    },

    async refiMortgage(gameId: string, options: RefiOptions): Promise<Mortgage> {
      return apiFetch<Mortgage>(`/api/sandbox/games/${gameId}/refi`, {
        method: 'POST',
        body: JSON.stringify(options),
        auth: await auth(),
      });
    },

    async helocDraw(gameId: string, propertyId: string, drawAmount: number): Promise<unknown> {
      return apiFetch(`/api/sandbox/games/${gameId}/heloc/draw`, {
        method: 'POST',
        body: JSON.stringify({ property_id: propertyId, draw_amount: drawAmount }),
        auth: await auth(),
      });
    },

    async helocRepay(gameId: string, propertyId: string, repayAmount: number): Promise<unknown> {
      return apiFetch(`/api/sandbox/games/${gameId}/heloc/repay`, {
        method: 'POST',
        body: JSON.stringify({ property_id: propertyId, repay_amount: repayAmount }),
        auth: await auth(),
      });
    },

    async prepayPrincipal(gameId: string, propertyId: string, amount: number, mortgageType: MortgageType = 'first_lien'): Promise<void> {
      return apiFetch<void>(`/api/sandbox/games/${gameId}/prepay-principal`, {
        method: 'POST',
        body: JSON.stringify({ property_id: propertyId, amount, mortgage_type: mortgageType }),
        auth: await auth(),
      });
    },

    async improveProperty(gameId: string, propertyId: string, targetGrade: Grade): Promise<GameProperty> {
      return apiFetch<GameProperty>(`/api/sandbox/games/${gameId}/improve-property`, {
        method: 'POST',
        body: JSON.stringify({ property_id: propertyId, target_grade: targetGrade }),
        auth: await auth(),
      });
    },

    async originatePaceLien(gameId: string, propertyId: string, targetGrade: Grade): Promise<Mortgage> {
      return apiFetch<Mortgage>(`/api/sandbox/games/${gameId}/pace-lien`, {
        method: 'POST',
        body: JSON.stringify({ property_id: propertyId, target_grade: targetGrade }),
        auth: await auth(),
      });
    },

    async setDelegate(gameId: string, agentDelegate: boolean, delegateStrategy?: BotStrategy): Promise<void> {
      return apiFetch<void>(`/api/sandbox/games/${gameId}/delegate`, {
        method: 'POST',
        body: JSON.stringify({ agent_delegate: agentDelegate, delegate_strategy: delegateStrategy }),
        auth: await auth(),
      });
    },

    // ── Autonomous & bots ────────────────────────────────────────────────────

    async startAutonomous(gameId: string, delaySeconds = 30): Promise<void> {
      return apiFetch<void>(`/api/sandbox/games/${gameId}/autonomous`, {
        method: 'POST',
        body: JSON.stringify({ delay_seconds: delaySeconds }),
        auth: await auth(),
      });
    },

    async stopAutonomous(gameId: string): Promise<void> {
      return apiFetch<void>(`/api/sandbox/games/${gameId}/autonomous`, {
        method: 'DELETE',
        auth: await auth(),
      });
    },

    async addBot(gameId: string, options: BotOptions): Promise<Player> {
      return apiFetch<Player>(`/api/sandbox/games/${gameId}/bots`, {
        method: 'POST',
        body: JSON.stringify(options),
        auth: await auth(),
      });
    },

    async removeBot(gameId: string, botPlayerId: string): Promise<void> {
      return apiFetch<void>(`/api/sandbox/games/${gameId}/bots/${botPlayerId}`, {
        method: 'DELETE',
        auth: await auth(),
      });
    },

    // ── Public (no auth) ─────────────────────────────────────────────────────

    async spectateGame(gameId: string): Promise<GameSnapshot> {
      return apiFetch<GameSnapshot>(`/api/sandbox/games/${gameId}/spectate`);
    },

    async getGlobalLeaderboard(limit = 50): Promise<LeaderboardEntry[]> {
      const raw = await apiFetch<Record<string, unknown>[]>(`/api/sandbox/leaderboard?limit=${limit}`);
      return raw.map(normalizeLeaderboardEntry);
    },

    async getProperties(activeOnly = true): Promise<Property[]> {
      return apiFetch<Property[]>(`/api/sandbox/properties?active_only=${activeOnly}`);
    },

    // ── API key management ───────────────────────────────────────────────────

    async listApiKeys(): Promise<ApiKeyResponse[]> {
      return apiFetch<ApiKeyResponse[]>('/api/sandbox/api-keys', {
        auth: await auth(),
      });
    },

    async createApiKey(name = 'CLI key'): Promise<ApiKeyResponse> {
      return apiFetch<ApiKeyResponse>('/api/sandbox/api-keys', {
        method: 'POST',
        body: JSON.stringify({ name }),
        auth: await auth(),
      });
    },

    async revokeApiKey(keyId: string): Promise<void> {
      return apiFetch<void>(`/api/sandbox/api-keys/${keyId}`, {
        method: 'DELETE',
        auth: await auth(),
      });
    },
  };
}

// ── Server-side admin client (never import on client) ────────────────────────
// Only used in Next.js server actions / API routes via ADMIN_API_KEY env var.

export function createAdminApiClient() {
  const key = process.env.ADMIN_API_KEY;
  if (!key) throw new Error('ADMIN_API_KEY not configured');
  const adminAuth: AuthMode = { type: 'apikey', key };

  return {
    async getGames(): Promise<Game[]> {
      return apiFetch<Game[]>('/api/sandbox/games', { auth: adminAuth });
    },

    async createGameFromPreset(options: PresetGameOptions): Promise<Game> {
      return apiFetch<Game>('/api/sandbox/games/from-preset', {
        method: 'POST',
        body: JSON.stringify(options),
        auth: adminAuth,
      });
    },

    async startAutonomous(gameId: string, delaySeconds = 30): Promise<void> {
      return apiFetch<void>(`/api/sandbox/games/${gameId}/autonomous`, {
        method: 'POST',
        body: JSON.stringify({ delay_seconds: delaySeconds }),
        auth: adminAuth,
      });
    },

    async addBot(gameId: string, options: BotOptions): Promise<Player> {
      return apiFetch<Player>(`/api/sandbox/games/${gameId}/bots`, {
        method: 'POST',
        body: JSON.stringify(options),
        auth: adminAuth,
      });
    },

    async mintTusdc(gameId: string, playerId: string, amount: number): Promise<void> {
      return apiFetch<void>(`/api/sandbox/games/${gameId}/mint-tusdc`, {
        method: 'POST',
        body: JSON.stringify({ player_id: playerId, amount }),
        auth: adminAuth,
      });
    },

    async getGlobalLeaderboard(limit = 50): Promise<LeaderboardEntry[]> {
      return apiFetch<LeaderboardEntry[]>(`/api/sandbox/leaderboard?limit=${limit}`, { auth: adminAuth });
    },

    async getFeed(gameId: string): Promise<FeedEvent[]> {
      return apiFetch<FeedEvent[]>(`/api/sandbox/games/${gameId}/feed?limit=20`, { auth: adminAuth });
    },

    async getGame(gameId: string): Promise<Game> {
      return apiFetch<Game>(`/api/sandbox/games/${gameId}`, { auth: adminAuth });
    },
  };
}
