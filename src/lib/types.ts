// ─── Notification preferences ─────────────────────────────────────────────────

export type NotifType = "match_results" | "match_scheduled";

// Map of notif_type → subscribed. Missing key means subscribed (default true).
export type PlayerNotificationPreferences = Partial<Record<NotifType, boolean>>;

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
  is_profile_complete?: boolean;
  phone_country_code?: string | null;
  phone_number?: string | null;
  country?: string | null;
  is_public?: boolean;
  is_notifications_subscribed?: boolean;
  preferred_side?: "left" | "right" | "both" | null;
  shirt_size?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type Event = {
  event_id: number;
  name?: string | null;
  event_type: string;
  start_date?: string | null;
  end_date?: string | null;
  registration_status: "open" | "closed";
  status: "upcoming" | "ongoing" | "completed";
  image_url?: string | null;
  description?: string | null;
  registration_fee?: number | null;
  payment_instructions?: string | null;
  url_link?: string | null;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
};

// Maps to the `signups_events` table.
export type SeasonSignup = {
  id: string;
  event_id: number;
  player_id: number | string | null;
  applicant_name?: string | null;
  applicant_contact?: string | null;
  applicant_email?: string | null;
  status: "applied" | "pending_payment" | "accepted" | "waitlisted" | "cancelled";
  created_at: string;
  updated_at: string;
};

// Alias for SeasonSignup — use this for new code.
export type EventSignup = SeasonSignup;

// Maps to rows in `signups_players`.
// player_id is null until an admin approves and links/creates the member profile.
export type MembershipApplication = {
  id: string;
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
  youtube_link?: string | null;
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
  youtubeLink: string | null;
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
