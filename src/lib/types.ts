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
// Seasons have been migrated to events (migration 20260502000004-006).
// The Season type is kept only for legacy code that may still reference it.
// @deprecated Use Event instead.
export type Season = {
  season_id: number;
  name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  registration_fee?: number | null;
  registration_status: "open" | "closed";
  status: "upcoming" | "ongoing" | "completed";
  created_at: string;
  updated_at: string;
};

export type Event = {
  event_id: number;
  name?: string | null;
  event_type: string;
  start_date?: string | null;
  end_date?: string | null;
  registration_fee?: number | null;
  registration_status: "open" | "closed";
  status: "upcoming" | "ongoing" | "completed";
  requires_payment?: boolean | null;
  image_url?: string | null;
  description?: string | null;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
};

// Maps to the `signups` table.
// event_type distinguishes signup kinds (e.g. 'event_registration').
// player_id is an integer FK to players.player_id.
// season_id was removed from the signups table in migration 20260502000006.
// Status: registered = initially signed up, accepted = payment confirmed (or free event), waitlisted/cancelled = other states.
export type SeasonSignup = {
  id: string;
  event_id: number | null;
  player_id: number | string | null;
  event_type: string;
  status: "registered" | "accepted" | "waitlisted" | "cancelled";
  created_at: string;
  updated_at: string;
};

// Alias for SeasonSignup — use this for new code.
export type EventSignup = SeasonSignup;

// Maps to signups rows where event_type = 'membership' and player_id is null
// until an admin approves and creates the member profile.
export type MembershipApplication = {
  id: string;
  event_type: string;
  status: "registered" | "accepted" | "waitlisted" | "cancelled";
  applicant_name: string | null;
  applicant_nickname: string | null;
  applicant_contact: string | null;
  applicant_email: string | null;
  player_id: number | null;
  created_at: string;
  updated_at: string;
};

// Maps to the `player_claims` table.
// A claim is submitted when a signed-in user wants to link their email to an
// existing player record that has no email (e.g. a historical player from CSV).
// Admin approval updates players.email and optionally verifies the profile.
export type PlayerClaim = {
  id: string;
  player_id: number;
  claimed_by_email: string;
  claimed_by_name?: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  reviewed_at?: string | null;
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
  event_id: number | null;
  date_local: string | null;
  time_local: string | null;
  venue: string | null;
  type: string | null;
  winner_team: number | null;
  status: "scheduled" | "completed" | "forfeit" | "cancelled";
  teams: TeamWithPlayers[];
  sets?: MatchSet[];
};

export type MatchStatus = "scheduled" | "completed" | "forfeit" | "cancelled";

export type MatchPlayerSummary = {
  player_id: number;
  name: string | null;
  nickname: string | null;
};

export type LoadedMatchDetails = {
  matchId: number;
  status: MatchStatus;
  eventId: number | null;
  dateLocal: string | null;
  timeLocal: string | null;
  venue: string | null;
  type: string | null;
  winnerTeam: number | null;
  team1SetsWon: number | null;
  team2SetsWon: number | null;
  team1: {
    player1: MatchPlayerSummary | null;
    player2: MatchPlayerSummary | null;
  };
  team2: {
    player1: MatchPlayerSummary | null;
    player2: MatchPlayerSummary | null;
  };
  sets: Array<{ set_number: number; team_1_games: number; team_2_games: number }>;
  preRatingsV3: Record<number, number | null>;
};

export type MatchRatingPreviewRow = {
  player: MatchPlayerSummary;
  team: 1 | 2;
  before: number;
  after: number;
  delta: number;
};

export type MatchRatingPreviewError = {
  error: string;
};

export type MatchRatingPreviewSuccess = {
  winnerTeam: 1 | 2;
  rows: MatchRatingPreviewRow[];
};

export type MatchRatingPreview =
  | MatchRatingPreviewError
  | MatchRatingPreviewSuccess;

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
