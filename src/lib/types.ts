export type Player = {
  player_id: string;
  name: string;
  nickname: string;
  image_link?: string | null;
  initial_rating?: number | null;
  pre_match_rating?: number | null;
  pre_match_rating_formula?: string | null;
  latest_rating?: number | null;
  latest_rating_formula?: string | null;
  latest_match_date?: string | null;
  created_at?: string;
  updated_at?: string;
};

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