-- Track who last created/updated a referrer assessment row.
-- Null for legacy rows; populated going forward on INSERT and PATCH.
alter table signups_players_referrers
  add column if not exists submitted_by_player_id bigint references players(player_id);
