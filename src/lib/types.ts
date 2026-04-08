export type Player = {
  player_id: string;
  name: string;
  nickname: string;
  image_link?: string | null;
  created_at?: string;
};

export type TeamWithPlayers = {
  uuid: string;
  team_number: number | null;
  sets_won: number | null;
  player_1: Player | null;
  player_2: Player | null;
};

export type MatchWithTeams = {
  match_id: number;
  created_at: string;
  date_local: string | null;
  time_local: string | null;
  venue: string | null;
  type: string | null;
  winner_team: number | null;
  is_forfeit: boolean;
  teams: TeamWithPlayers[];
};