create or replace function public.get_leaderboard(
  season_filter bigint,
  type_filter text
)
returns table (
  player_id bigint,
  name text,
  matches_played bigint,
  wins bigint,
  win_rate numeric
)
language sql
set search_path = pg_catalog, public
as $$
WITH player_matches AS (
  SELECT
    p.player_id,
    p.name,
    m.match_id,
    m.season,
    m.type,
    mt.team_number,
    m.winner_team,
    CASE 
      WHEN mt.team_number = m.winner_team THEN 1
      ELSE 0
    END AS is_win
  FROM public.match_teams mt
  JOIN public.matches m ON mt.match_id = m.match_id
  JOIN public.players p 
    ON p.player_id = mt.player_1_id 
    OR p.player_id = mt.player_2_id
)
SELECT
  player_id,
  name,
  COUNT(*) AS matches_played,
  SUM(is_win) AS wins,
  ROUND(SUM(is_win)::decimal / COUNT(*), 3) AS win_rate
FROM player_matches
WHERE (season_filter IS NULL OR season = season_filter)
  AND (type_filter IS NULL OR type = type_filter)
GROUP BY player_id, name
HAVING COUNT(*) > 0
ORDER BY win_rate DESC;
$$;