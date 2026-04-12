export interface Player {
  player_id: string;
  name: string;
  nickname?: string;
  image_link?: string;
}

export interface MostPlayedPartner {
  player_id: string;
  name: string;
  nickname?: string;
  count: number;
}

export interface PlayerProfile extends Player {
  current_rating: number;
  first_season: string;
  last_season: string;
  matches_played: number;
  wins: number;
  losses: number;
  win_pct: number;
  sets_won: number;
  sets_lost: number;
  last_match_date: string;
  most_played_partners: MostPlayedPartner[];
  rating_trend: number[];
}

export interface PlayerInMatch {
  player_id: string;
  name: string;
  nickname?: string;
  image_link?: string;
  match_rating?: number;
}

export interface MatchTeam {
  match_team_id: string;
  match_id: string;
  team_side: "A" | "B";
  result: "win" | "loss" | null;
  player1_id: string;
  player2_id?: string;
  team_rating?: number;
  player1?: PlayerInMatch;
  player2?: PlayerInMatch;
}

export interface MatchSet {
  set_number: number;
  score_a: number;
  score_b: number;
}

export interface Match {
  match_id: string;
  season_id: string;
  match_date: string;
  match_type: MatchType;
  status: string;
  venue?: string;
  match_teams?: MatchTeam[];
  match_sets?: MatchSet[];
}

export interface LeaderboardRow {
  rank: number;
  player_id: string;
  player_name: string;
  nickname?: string;
  image_link?: string;
  team_name?: string;
  wins: number;
  losses: number;
  win_pct: number;
  points: number;
  matches_played: number;
  sets_won: number;
  sets_lost: number;
  last_match_date?: string;
}

export interface LeaderboardRatingRow {
  rank: number;
  player_id: string;
  player_name: string;
  nickname?: string;
  image_link?: string;
  team_name?: string;
  matches_played: number;
  wins: number;
  losses: number;
  sets_won: number;
  sets_lost: number;
  avg_rating: number;
  peak_rating: number;
  current_rating: number;
  formula_name?: string;
  last_match_date?: string;
}

export interface CarouselSlide {
  id: string;
  image_url: string;
  title?: string;
  subtitle?: string;
  link?: string;
}

export type MatchType = "duel" | "doubles" | "kotc" | "team";
export type SeasonFilter = "ALL" | string;
export type TypeFilter = "ALL" | MatchType;
export type MinMatchesFilter = 0 | 5 | 10 | 15 | 20;
