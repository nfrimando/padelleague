// ─── Core entities ─────────────────────────────────────────────────────────────

// player_id is a bigint integer in the DB but is treated as number | string
// throughout the codebase (Supabase JS returns numbers; some helpers use String()).
// Auth users are linked to players by matching players.email to auth.user.email.
export type Player = {
  player_id: number | string;
  name: string;
  nickname: string;
  image_link?: string | null;
  initial_rating?: number | null;
  pre_match_rating?: number | null;
  pre_match_rating_formula?: string | null;
  latest_rating?: number | null;
  latest_rating_formula?: string | null;
  latest_match_date?: string | null;
  email?: string | null;
  paymongo_customer_id?: string | null;
  auto_renew_season?: boolean;
  is_profile_complete?: boolean;
  created_at?: string;
  updated_at?: string;
};

// season_id is a bigint integer PK.
// name and registration_fee are added via migration 20260414000001.
export type Season = {
  season_id: number;
  name?: string | null;               // added by 20260414000001 migration
  start_date?: string | null;
  end_date?: string | null;
  registration_fee?: number | null;   // added by 20260414000001 migration; default 1000
  registration_status: "open" | "closed";
  status: "upcoming" | "ongoing" | "completed";
  created_at: string;
  updated_at: string;
};

// Maps to the `signups` table.
// event_type distinguishes signup kinds (e.g. 'season_registration').
// player_id is an integer FK to players.player_id.
export type SeasonSignup = {
  id: string;
  season_id: number;
  player_id: number | string;
  event_type: string;
  status: "pending_payment" | "registered" | "waitlisted" | "cancelled";
  created_at: string;
  updated_at: string;
};

// Maps to the `payments` table.
// provider: 'paymongo' | 'manual' | etc.
export type Payment = {
  payment_id: string;
  player_id: number;
  reference_doc_type: string;
  reference_doc_id: string;
  amount: number;
  currency: string;
  provider: string;
  status: "pending" | "paid" | "failed" | "refunded" | "awaiting_payment_method";
  payment_method_type?: string | null;
  created_at: string;
  updated_at: string;
};

// Maps to the `payments_paymongo` table (1-to-1 with payments).
export type PaymentPaymongo = {
  payment_id: string;
  paymongo_payment_intent_id?: string | null;
  paymongo_payment_method_id?: string | null;
  raw_response?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

// Maps to the `webhook_events` table (idempotency log).
export type WebhookEvent = {
  id: string;
  event_type: string;
  processed_at: string;
};

// ─── Match / team entities ─────────────────────────────────────────────────────

export type TeamWithPlayers = {
  uuid: string;
  team_number: number | null;
  sets_won: number | null;
  player_1: Player | null;
  player_2: Player | null;
};

export type MatchSet = {
  match_id: number;
  set_number: number;
  team_1_games: number;
  team_2_games: number;
};

export type MatchWithTeams = {
  match_id: number;
  created_at: string;
  season_id: number | null;
  date_local: string | null;
  time_local: string | null;
  venue: string | null;
  type: string | null;
  winner_team: number | null;
  status: "scheduled" | "completed" | "forfeit" | "cancelled";
  teams: TeamWithPlayers[];
  sets?: MatchSet[];
};

// ─── Season teams (the `teams` table) ─────────────────────────────────────────

export type SeasonTeam = {
  team_id: number;
  season_id: number;
  team_name: string;
  icon?: string | null;
  captain_player_id?: number | null;
  co_captain_player_id?: number | null;
  final_rank?: number | null;
  created_at?: string;
  updated_at: string;
};
