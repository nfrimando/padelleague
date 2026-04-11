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
  latest_rating numeric,
  last_match_id bigint,
  last_match_date text
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
    m.date_local,
    m.time_local,
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
latest_player_matches AS (
  SELECT
    ranked.player_id,
    ranked.match_id AS last_match_id,
    ranked.date_local AS last_match_date
  FROM (
    SELECT
      pm.player_id,
      pm.match_id,
      pm.date_local,
      pm.time_local,
      ROW_NUMBER() OVER (
        PARTITION BY pm.player_id
        ORDER BY
          pm.date_local DESC NULLS LAST,
          pm.time_local DESC NULLS LAST,
          pm.match_id DESC
      ) AS rn
    FROM player_matches pm
    WHERE (season_filter IS NULL OR pm.season = season_filter)
      AND (type_filter IS NULL OR pm.type = type_filter)
  ) ranked
  WHERE ranked.rn = 1
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
  MAX(lpr.latest_rating) AS latest_rating,
  MAX(lpm.last_match_id) AS last_match_id,
  MAX(lpm.last_match_date) AS last_match_date
FROM player_matches pm
LEFT JOIN latest_player_ratings lpr
  ON lpr.player_id = pm.player_id
LEFT JOIN latest_player_matches lpm
  ON lpm.player_id = pm.player_id
WHERE (season_filter IS NULL OR season = season_filter)
  AND (type_filter IS NULL OR type = type_filter)
GROUP BY pm.player_id, pm.name
HAVING COUNT(*) > 0
ORDER BY matches_played DESC, wins DESC, sets_won DESC, sets_lost ASC;
$$;

drop function if exists public.get_leaderboard_ratings(bigint, text, text, bigint);

create function public.get_leaderboard_ratings(
  season_filter bigint,
  type_filter text,
  formula_filter text default null,
  min_matches bigint default 5
)
returns table (
  player_id bigint,
  name text,
  matches_played bigint,
  wins bigint,
  sets_won bigint,
  sets_lost bigint,
  win_rate numeric,
  latest_rating numeric,
  last_match_id bigint,
  last_match_date text
)
language sql
set search_path = pg_catalog, public
as $$
with filtered_matches as (
  select
    m.match_id,
    m.season,
    m.type,
    m.winner_team,
    m.date_local,
    m.time_local
  from public.matches m
  where (season_filter is null or m.season = season_filter)
    and (type_filter is null or m.type = type_filter)
),
player_matches as (
  select
    p.player_id,
    p.name,
    fm.match_id,
    fm.date_local,
    fm.time_local,
    mt.team_number,
    fm.winner_team,
    mt.sets_won,
    mt_opp.sets_won as sets_lost,
    case
      when mt.team_number = fm.winner_team then 1
      else 0
    end as is_win
  from public.match_teams mt
  join public.match_teams mt_opp
    on mt_opp.match_id = mt.match_id
   and mt_opp.team_number <> mt.team_number
  join filtered_matches fm
    on fm.match_id = mt.match_id
  join public.players p
    on p.player_id = mt.player_1_id
    or p.player_id = mt.player_2_id
),
preferred_match_ratings as (
  select
    ranked.player_id,
    ranked.match_id,
    ranked.rating_post,
    ranked.date_local,
    ranked.time_local
  from (
    select
      mpr.player_id,
      mpr.match_id,
      mpr.rating_post,
      fm.date_local,
      fm.time_local,
      row_number() over (
        partition by mpr.player_id, mpr.match_id
        order by
          case
            when lower(mpr.formula_name) = 'v3' then 2
            when lower(mpr.formula_name) = 'v2' then 1
            else 0
          end desc
      ) as rn
    from public.match_player_ratings mpr
    join filtered_matches fm
      on fm.match_id = mpr.match_id
    where (formula_filter is null or lower(mpr.formula_name) = lower(formula_filter))
  ) ranked
  where ranked.rn = 1
),
latest_player_ratings as (
  select
    ranked.player_id,
    ranked.rating_post as latest_rating,
    ranked.match_id as last_match_id,
    ranked.date_local as last_match_date
  from (
    select
      pmr.player_id,
      pmr.rating_post,
      pmr.match_id,
      pmr.date_local,
      row_number() over (
        partition by pmr.player_id
        order by
          pmr.date_local desc nulls last,
          pmr.time_local desc nulls last,
          pmr.match_id desc
      ) as rn
    from preferred_match_ratings pmr
  ) ranked
  where ranked.rn = 1
)
select
  pm.player_id,
  pm.name,
  count(*) as matches_played,
  sum(pm.is_win) as wins,
  sum(coalesce(pm.sets_won, 0)) as sets_won,
  sum(coalesce(pm.sets_lost, 0)) as sets_lost,
  round(sum(pm.is_win)::decimal / count(*), 3) as win_rate,
  max(lpr.latest_rating) as latest_rating,
  max(lpr.last_match_id) as last_match_id,
  max(lpr.last_match_date) as last_match_date
from player_matches pm
left join latest_player_ratings lpr
  on lpr.player_id = pm.player_id
group by pm.player_id, pm.name
having count(*) >= min_matches
order by
  max(lpr.latest_rating) desc nulls last,
  count(*) desc,
  sum(pm.is_win) desc,
  pm.name asc;
$$;