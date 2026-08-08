-- Backfill: place EVERY player with a resolvable rating (per player_rating_events) who has no
-- ladder_standing_events row in the active cycle yet -- regardless of is_ladder_opt_in.
--
-- Widens 20260720000000_backfill_ladder_opted_in_placement.sql, which only caught opted-in
-- players. Anyone recruited after 20260718000006_seed_ladder_cycle_1.sql ran had no ladder row
-- at all: the recruitment paths never touched the ladder, and new players default to
-- is_ladder_opt_in = false, so they only got placed if they opted in themselves or were seated
-- in a completed ladder match.
--
-- Going forward the player-creation routes (src/app/api/recruit/[signupId]/approve,
-- src/app/api/admin/membership-applications/[signupId], src/app/api/admin/players/create) call
-- placePlayerInActiveCycle (src/lib/ladder/ladderPlacement.ts) at approval time, so this is a
-- one-time catch-up.
--
-- Placement is NOT enrollment: is_ladder_opt_in is deliberately left untouched. These players
-- have a rung waiting for them but stay out of the roulette pool until they opt in.
--
-- Mirrors the tiering formula in 20260718000006_seed_ladder_cycle_1.sql: within a tier's
-- 1.5-wide range, stars are assigned in 0.5-wide sub-bands.
--
-- Safe to re-run: uniq_lse_cycle_start guards against duplicate cycle_start rows, and the
-- NOT EXISTS below already excludes anyone placed.

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
  WHERE NOT EXISTS (
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
