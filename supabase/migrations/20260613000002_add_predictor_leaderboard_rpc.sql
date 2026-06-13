create or replace function get_predictor_leaderboard()
returns table (
  player_id integer,
  name text,
  nickname text,
  image_link text,
  points numeric
)
language sql
stable
security definer
as $$
  select
    pl.player_id,
    pl.name,
    pl.nickname,
    pl.image_link,
    round(sum(pr.points_awarded)::numeric, 2) as points
  from prediction_results pr
  join predictions pred on pred.id = pr.user_pick_id
  join players pl on pl.player_id = pred.player_id
  where pred.player_id is not null
  group by pl.player_id, pl.name, pl.nickname, pl.image_link
  order by points desc
  limit 20;
$$;
