-- Backfill: place opted-in players who have a resolvable rating (per player_rating_events)
-- but no ladder_standing_events row in the active cycle yet -- e.g. they were recruited or
-- opted in after 20260718000006_seed_ladder_cycle_1.sql ran, or opted in before ever playing a
-- ladder match (the only other placement trigger, in src/lib/ladder/ladderStandingSync.ts).
-- Going forward, src/app/api/players/profile/route.ts places players immediately on opt-in via
-- ensureLadderPlacement (src/lib/ladder/ladderPlacement.ts), so this is a one-time catch-up.
--
-- Mirrors the tiering formula in 20260718000006_seed_ladder_cycle_1.sql: within a tier's
-- 1.5-wide range, stars are assigned in 0.5-wide sub-bands.

WITH active_cycle AS (
  SELECT id FROM public.ladder_cycles WHERE status = 'active' LIMIT 1
),
current_ratings AS (
  SELECT DISTINCT ON (player_id) player_id, rating_after AS rating
  FROM public.player_rating_events
  ORDER BY player_id, occurred_at DESC NULLS LAST, created_at DESC
),
missing_players AS (
  SELECT p.player_id
  FROM public.players p, active_cycle ac
  WHERE p.is_ladder_opt_in = true
    AND NOT EXISTS (
      SELECT 1 FROM public.ladder_standing_events lse
      WHERE lse.player_id = p.player_id AND lse.cycle_id = ac.id
    )
),
tiered AS (
  SELECT
    mp.player_id,
    cr.rating,
    lt.id AS tier_id,
    LEAST(2, FLOOR((cr.rating - lt.elo_floor) / 0.5))::smallint AS stars
  FROM missing_players mp
  JOIN current_ratings cr ON cr.player_id = mp.player_id
  JOIN public.ladder_tiers lt
    ON cr.rating >= lt.elo_floor
   AND cr.rating < COALESCE(
         (SELECT MIN(elo_floor) FROM public.ladder_tiers WHERE elo_floor > lt.elo_floor),
         'infinity'::numeric
       )
)
INSERT INTO public.ladder_standing_events (
  cycle_id, player_id, event_type, tier_before_id, tier_after_id,
  stars_before, stars_after, cushion_available, source_type, source_id, occurred_at, metadata
)
SELECT
  ac.id,
  tiered.player_id,
  'cycle_start',
  NULL,
  tiered.tier_id,
  NULL,
  tiered.stars,
  true,
  'cycle_seed',
  NULL,
  now(),
  jsonb_build_object('seed_rating', tiered.rating)
FROM tiered, active_cycle ac;
