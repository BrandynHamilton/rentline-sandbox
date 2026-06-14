-- Rentline Sandbox — Supabase schema
-- Run this in your Supabase SQL editor.

-- ---------------------------------------------------------------------------
-- Sandbox tables
-- ---------------------------------------------------------------------------
-- Turn-based real estate simulation game engine.
-- RLS: players can read their own games/players/holdings;
--      game feed and properties are readable by all authenticated users;
--      write access is locked to game participants.
-- ---------------------------------------------------------------------------

create table if not exists sandbox_games (
  id                    text primary key,
  name                  text not null,
  status                text not null default 'lobby',
  -- lobby | trading | advancing | completed
  current_turn          integer not null default 0,
  max_turns             integer not null default 12,
  starting_balance_usdc numeric(18,6) not null default 100000,
  invite_code           text unique not null,
  created_by            text not null,           -- clerk_user_id of host
  started_at            timestamptz,
  ended_at              timestamptz,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

alter table sandbox_games enable row level security;
create policy "sandbox_games_read" on sandbox_games
  for select using (true);                       -- any auth'd user can browse open games
create policy "sandbox_games_write" on sandbox_games
  for all using (created_by = auth.uid());       -- only host can mutate


create table if not exists sandbox_players (
  id              text primary key,
  game_id         text not null references sandbox_games(id) on delete cascade,
  clerk_user_id   text not null,
  display_name    text not null,
  usdc_balance    numeric(18,6) not null default 0,
  wallet_address  text,
  is_ready        boolean not null default false,
  is_host         boolean not null default false,
  joined_at       timestamptz default now(),
  unique(game_id, clerk_user_id)
);

alter table sandbox_players enable row level security;
create policy "sandbox_players_read" on sandbox_players
  for select using (
    clerk_user_id = auth.uid()
    or exists (
      select 1 from sandbox_games g where g.id = sandbox_players.game_id
        and g.created_by = auth.uid()
    )
  );
create policy "sandbox_players_write" on sandbox_players
  for all using (clerk_user_id = auth.uid());


create table if not exists sandbox_properties (
  id               text primary key,
  geo_id           text not null unique,
  name             text not null,
  display_address  text,
  city             text,
  state            text,
  property_type    text,
  token_address    text,
  total_supply     numeric(18,0),
  initial_price_usd numeric(18,2) not null,
  monthly_rent_usd  numeric(18,2) not null,
  image_url        text,
  cap_rate         numeric(8,6),
  is_active        boolean not null default true,
  last_avm_sync    timestamptz,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

alter table sandbox_properties enable row level security;
create policy "sandbox_properties_read" on sandbox_properties
  for select using (true);


create table if not exists sandbox_game_properties (
  id                  text primary key,
  game_id             text not null references sandbox_games(id) on delete cascade,
  property_id         text not null references sandbox_properties(id),
  current_price_usd   numeric(18,2) not null,
  current_rent_usd    numeric(18,2) not null,
  turn_added          integer not null default 1,
  updated_at          timestamptz default now(),
  unique(game_id, property_id)
);

alter table sandbox_game_properties enable row level security;
create policy "sandbox_game_properties_read" on sandbox_game_properties
  for select using (true);


create table if not exists sandbox_holdings (
  id                       text primary key,
  game_id                  text not null references sandbox_games(id) on delete cascade,
  player_id                text not null references sandbox_players(id) on delete cascade,
  property_id              text not null references sandbox_properties(id),
  tokens_held              numeric(18,6) not null default 0,
  avg_purchase_price_usd   numeric(18,6),
  total_rent_received_usd  numeric(18,6) not null default 0,
  acquired_at              timestamptz default now(),
  updated_at               timestamptz default now(),
  unique(game_id, player_id, property_id)
);

alter table sandbox_holdings enable row level security;
create policy "sandbox_holdings_read" on sandbox_holdings
  for select using (
    exists (
      select 1 from sandbox_players sp
      where sp.id = sandbox_holdings.player_id
        and sp.clerk_user_id = auth.uid()
    )
  );
create policy "sandbox_holdings_write" on sandbox_holdings
  for all using (
    exists (
      select 1 from sandbox_players sp
      where sp.id = sandbox_holdings.player_id
        and sp.clerk_user_id = auth.uid()
    )
  );


create table if not exists sandbox_transactions (
  id                  text primary key,
  game_id             text not null references sandbox_games(id) on delete cascade,
  turn                integer not null,
  player_id           text references sandbox_players(id),
  type                text not null,
  -- BUY | SELL | RENT_RECEIVED | DISTRIBUTE | MINT_TUSDC
  property_id         text references sandbox_properties(id),
  amount_usdc         numeric(18,6),
  tokens              numeric(18,6),
  price_per_token_usd numeric(18,6),
  tx_hash             text,
  rentline_payment_id text,  -- soft reference to Rentline payment_events (no FK — different DB)
  created_at          timestamptz default now()
);

alter table sandbox_transactions enable row level security;
create policy "sandbox_transactions_read" on sandbox_transactions
  for select using (
    player_id is null
    or exists (
      select 1 from sandbox_players sp
      where sp.id = sandbox_transactions.player_id
        and sp.clerk_user_id = auth.uid()
    )
  );


create table if not exists sandbox_turn_events (
  id           text primary key,
  game_id      text not null references sandbox_games(id) on delete cascade,
  turn         integer not null,
  event_type   text not null,
  -- RENT_COLLECTED | VACANCY | LEASE_RENEWAL | CAPEX_HIT | APPRECIATION | DEPRECIATION | TURN_START | TURN_END
  property_id  text references sandbox_properties(id),
  player_id    text references sandbox_players(id),
  description  text not null,
  delta_usdc   numeric(18,6) default 0,
  delta_pct    numeric(8,6) default 0,
  created_at   timestamptz default now()
);

alter table sandbox_turn_events enable row level security;
create policy "sandbox_turn_events_read" on sandbox_turn_events
  for select using (true);   -- feed is public within auth'd users


-- ---------------------------------------------------------------------------
-- Sandbox indexes
-- ---------------------------------------------------------------------------

create index if not exists idx_sandbox_games_status          on sandbox_games(status);
create index if not exists idx_sandbox_games_created_by      on sandbox_games(created_by);
create index if not exists idx_sandbox_players_game          on sandbox_players(game_id);
create index if not exists idx_sandbox_players_clerk         on sandbox_players(clerk_user_id);
create index if not exists idx_sandbox_game_props_game       on sandbox_game_properties(game_id);
create index if not exists idx_sandbox_holdings_game         on sandbox_holdings(game_id);
create index if not exists idx_sandbox_holdings_player       on sandbox_holdings(player_id);
create index if not exists idx_sandbox_transactions_game     on sandbox_transactions(game_id);
create index if not exists idx_sandbox_transactions_player   on sandbox_transactions(player_id);
create index if not exists idx_sandbox_turn_events_game      on sandbox_turn_events(game_id);
create index if not exists idx_sandbox_turn_events_turn      on sandbox_turn_events(turn);


-- ---------------------------------------------------------------------------
-- Sandbox mortgages + macro events + Fed decisions
-- ---------------------------------------------------------------------------

create table if not exists sandbox_mortgages (
  id                      text primary key,
  game_id                 text not null references sandbox_games(id) on delete cascade,
  player_id               text not null references sandbox_players(id) on delete cascade,
  property_id             text not null references sandbox_properties(id),

  mortgage_type           text not null,
  -- acquisition | refi | heloc | heloan

  -- Loan economics
  original_balance        numeric(18,2) not null,
  current_balance         numeric(18,2) not null,
  origination_rate        numeric(8,6) not null,    -- annual rate e.g. 0.065
  current_rate            numeric(8,6) not null,    -- tracks ARM adjustments
  rate_type               text not null default 'fixed',  -- fixed | arm
  amortizing              boolean not null default false,
  monthly_payment         numeric(18,2) not null,

  -- HELOC-specific
  credit_limit            numeric(18,2),
  drawn_balance           numeric(18,2),

  -- Origination metadata
  origination_turn        integer not null,
  origination_price_usd   numeric(18,2) not null,
  closing_cost_paid       numeric(18,2) not null default 0,
  replaces_mortgage_id    text,                     -- soft FK to prior mortgage

  -- Lifecycle
  status                  text not null default 'active',
  -- active | paid_off | defaulted | foreclosed
  turns_in_arrears        integer not null default 0,
  paid_off_turn           integer,
  defaulted_turn          integer,
  total_interest_paid     numeric(18,2) not null default 0,
  total_principal_paid    numeric(18,2) not null default 0,

  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);

alter table sandbox_mortgages enable row level security;
create policy "sandbox_mortgages_read" on sandbox_mortgages
  for select using (
    exists (
      select 1 from sandbox_players sp
      where sp.id = sandbox_mortgages.player_id
        and sp.clerk_user_id = auth.uid()
    )
  );
create policy "sandbox_mortgages_write" on sandbox_mortgages
  for all using (
    exists (
      select 1 from sandbox_players sp
      where sp.id = sandbox_mortgages.player_id
        and sp.clerk_user_id = auth.uid()
    )
  );


create table if not exists sandbox_macro_events (
  id                       text primary key,
  game_id                  text not null references sandbox_games(id) on delete cascade,
  turn_triggered           integer not null,
  macro_type               text not null,
  headline                 text not null,
  description              text not null,

  -- Scope targeting
  scope                    text not null default 'all',
  affected_city            text,
  affected_state           text,
  affected_property_type   text,

  -- Per-turn mechanical effects while active
  price_delta_pct          numeric(8,6) not null default 0,
  rent_delta_pct           numeric(8,6) not null default 0,
  vacancy_probability_add  numeric(8,6) not null default 0,
  rate_adjustment          numeric(8,6) not null default 0,
  monthly_expense_per_token numeric(18,2) not null default 0,

  -- Duration
  duration_turns           integer not null default 1,
  turns_remaining          integer not null default 1,
  status                   text not null default 'active',  -- active | expired

  created_at               timestamptz default now()
);

alter table sandbox_macro_events enable row level security;
create policy "sandbox_macro_events_read" on sandbox_macro_events
  for select using (true);


create table if not exists sandbox_fed_decisions (
  id                    text primary key,
  game_id               text not null references sandbox_games(id) on delete cascade,
  turn                  integer not null,
  outcome               text not null,       -- hike | cut | hold
  rate_before           numeric(8,6) not null,
  rate_after            numeric(8,6) not null,
  mortgage_rate_before  numeric(8,6) not null,
  mortgage_rate_after   numeric(8,6) not null,
  move_bps              integer not null,    -- positive=hike, negative=cut, 0=hold
  statement             text not null,
  created_at            timestamptz default now()
);

alter table sandbox_fed_decisions enable row level security;
create policy "sandbox_fed_decisions_read" on sandbox_fed_decisions
  for select using (true);

-- Also add Fed and debt config columns to sandbox_games (idempotent alters for existing deployments)
alter table sandbox_games add column if not exists ltv_limit                  numeric(5,4) not null default 0.70;
alter table sandbox_games add column if not exists default_rate_type          text not null default 'fixed';
alter table sandbox_games add column if not exists amortizing                 boolean not null default false;
alter table sandbox_games add column if not exists base_mortgage_rate         numeric(8,6) not null default 0.075;
alter table sandbox_games add column if not exists arm_spread                 numeric(8,6) not null default 0.005;
alter table sandbox_games add column if not exists arm_cap                    numeric(8,6) not null default 0.030;
alter table sandbox_games add column if not exists closing_cost_pct           numeric(8,6) not null default 0.02;
alter table sandbox_games add column if not exists heloc_spread               numeric(8,6) not null default 0.02;
alter table sandbox_games add column if not exists debt_service_default_penalty numeric(5,4) not null default 0.10;
alter table sandbox_games add column if not exists fed_meeting_interval       integer not null default 6;
alter table sandbox_games add column if not exists fed_rate_current           numeric(8,6) not null default 0.055;
alter table sandbox_games add column if not exists fed_mortgage_spread        numeric(8,6) not null default 0.020;
alter table sandbox_games add column if not exists fed_hike_prob              numeric(5,4) not null default 0.30;
alter table sandbox_games add column if not exists fed_cut_prob               numeric(5,4) not null default 0.25;
alter table sandbox_games add column if not exists fed_move_magnitude_min     numeric(8,6) not null default 0.0025;
alter table sandbox_games add column if not exists fed_move_magnitude_max     numeric(8,6) not null default 0.0050;

-- Indexes for new tables
create index if not exists idx_sandbox_mortgages_game       on sandbox_mortgages(game_id);
create index if not exists idx_sandbox_mortgages_player     on sandbox_mortgages(player_id);
create index if not exists idx_sandbox_mortgages_property   on sandbox_mortgages(property_id);
create index if not exists idx_sandbox_mortgages_status     on sandbox_mortgages(status);
create index if not exists idx_sandbox_macro_events_game    on sandbox_macro_events(game_id);
create index if not exists idx_sandbox_macro_events_status  on sandbox_macro_events(status);
create index if not exists idx_sandbox_fed_decisions_game   on sandbox_fed_decisions(game_id);
create index if not exists idx_sandbox_fed_decisions_turn   on sandbox_fed_decisions(turn);

