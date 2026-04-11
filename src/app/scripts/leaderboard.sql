drop function if exists public.get_leaderboard(bigint, text);

create function public.get_leaderboard(
  season_filter bigint,
  type_filter text
)
returns table (
  player_id bigint,
  name text,
  matches_played bigint,
  wins bigint,
  sets_won bigint,
  sets_lost bigint,
  win_rate numeric,
  latest_rating numeric
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
    mt.sets_won,
    mt_opp.sets_won AS sets_lost,
    CASE 
      WHEN mt.team_number = m.winner_team THEN 1
      ELSE 0
    END AS is_win
  FROM public.match_teams mt
  JOIN public.match_teams mt_opp
    ON mt_opp.match_id = mt.match_id
   AND mt_opp.team_number <> mt.team_number
  JOIN public.matches m ON mt.match_id = m.match_id
  JOIN public.players p 
    ON p.player_id = mt.player_1_id 
    OR p.player_id = mt.player_2_id
),
latest_player_ratings AS (
  SELECT
    ranked.player_id,
    ranked.rating_post AS latest_rating
  FROM (
    SELECT
      mpr.player_id,
      mpr.rating_post,
      ROW_NUMBER() OVER (
        PARTITION BY mpr.player_id
        ORDER BY
          m.date_local DESC NULLS LAST,
          m.time_local DESC NULLS LAST,
          m.match_id DESC,
          CASE
            WHEN lower(mpr.formula_name) = 'v3' THEN 2
            WHEN lower(mpr.formula_name) = 'v2' THEN 1
            ELSE 0
          END DESC
      ) AS rn
    FROM public.match_player_ratings mpr
    JOIN public.matches m
      ON m.match_id = mpr.match_id
  ) ranked
  WHERE ranked.rn = 1
)
SELECT
  pm.player_id,
  pm.name,
  COUNT(*) AS matches_played,
  SUM(pm.is_win) AS wins,
  SUM(COALESCE(pm.sets_won, 0)) AS sets_won,
  SUM(COALESCE(pm.sets_lost, 0)) AS sets_lost,
  ROUND(SUM(pm.is_win)::decimal / COUNT(*), 3) AS win_rate,
  MAX(lpr.latest_rating) AS latest_rating
FROM player_matches pm
LEFT JOIN latest_player_ratings lpr
  ON lpr.player_id = pm.player_id
WHERE (season_filter IS NULL OR season = season_filter)
  AND (type_filter IS NULL OR type = type_filter)
GROUP BY pm.player_id, pm.name
HAVING COUNT(*) > 0
ORDER BY matches_played DESC, wins DESC, sets_won DESC, sets_lost ASC;
$$;