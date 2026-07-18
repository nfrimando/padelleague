-- Seed Cycle 1 and place every player with a resolvable current rating (per the
-- player_rating_events ledger, see CLAUDE.md) into their starting tier and star band.
--
-- Within a tier's 1.5-wide range, stars are assigned in 0.5-wide sub-bands: the first 0.5
-- is 0 stars, the next 0.5 is 1 star, the next 0.5 is 2 stars (e.g. 0.75 -> Bronze, 1 star).
-- Players with no player_rating_events row at all (never given an initial_rating, never
-- played) are skipped -- there is nothing to place them by.

WITH new_cycle AS (
  INSERT INTO public.ladder_cycles (label, status, starts_at)
  VALUES ('Cycle 1', 'active', now())
  RETURNING id
),
current_ratings AS (
  SELECT DISTINCT ON (player_id) player_id, rating_after AS rating
  FROM public.player_rating_events
  ORDER BY player_id, occurred_at DESC NULLS LAST, created_at DESC
),
tiered AS (
  SELECT
    cr.player_id,
    cr.rating,
    lt.id AS tier_id,
    LEAST(2, FLOOR((cr.rating - lt.elo_floor) / 0.5))::smallint AS stars
  FROM current_ratings cr
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
  new_cycle.id,
  tiered.player_id,
  'cycle_start',
  NULL,
  tiered.tier_id,
  NULL,
  tiered.stars,
  false,
  'cycle_seed',
  NULL,
  now(),
  jsonb_build_object('seed_rating', tiered.rating)
FROM tiered
CROSS JOIN new_cycle;
