export const SCHEDULE_MATCH_TYPE_OPTIONS = [
  "duel",
  "kotc",
  "group",
  "finals",
] as const;

export const SCHEDULE_MATCH_VENUE_OPTIONS = [
  "ACC",
  "Manila Polo Club",
  "MPC Arcovia",
  "MPC BGC",
  "Padel 300",
  "Palm Beach",
  "Play Padel",
  "Play Padel Pavilion",
  "Unilab",
  "Warehouse 71",
] as const;

export const MATCH_STATUS_OPTIONS = [
  "completed",
  "scheduled",
  "forfeit",
  "cancelled",
] as const;

export const UPDATE_MATCH_STATUS_OPTIONS = [
  "scheduled",
  "forfeit",
  "cancelled",
] as const;

export type MatchStatusValue = (typeof MATCH_STATUS_OPTIONS)[number];
