-- Fix: 20260718000006_seed_ladder_cycle_1.sql incorrectly set cushion_available = false on
-- every Cycle 1 seed row, marking every player's cushion as already consumed before they ever
-- entered the ladder. Correct it to true, matching every other placement path
-- (ensureLadderPlacement in src/lib/ladder/ladderPlacement.ts, and the
-- 20260720000000_backfill_ladder_opted_in_placement.sql backfill).
--
-- Scoped to cycle_start / cycle_seed rows only -- match-sourced rows (source_type = 'match')
-- can legitimately have cushion_available = false when a real loss consumed the cushion
-- (see computeNextLadderStanding in src/lib/ladder/ladderStandingTransition.ts), and that
-- history must not be touched.

UPDATE public.ladder_standing_events
SET cushion_available = true
WHERE event_type = 'cycle_start'
  AND source_type = 'cycle_seed'
  AND cushion_available = false;
