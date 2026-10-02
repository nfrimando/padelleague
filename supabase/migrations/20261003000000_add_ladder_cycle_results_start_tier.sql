-- Where each player STARTED the cycle, alongside where they finished, so /ladder?view=results can
-- show how far a player climbed (or fell) within the cycle.
--
-- Sourced from the player's cycle_start row in ladder_standing_events (one per player per cycle,
-- guaranteed by uniq_lse_cycle_start). Denormalized like tier_name/tier_rank so a later
-- ladder_tiers reseed can't rewrite history.
--
-- Nullable: rows written before this column existed stay valid until the cycle is recomputed
-- (admin → Ladder Cycles → Recompute snapshot), and a player with no cycle_start row has no
-- known starting tier.

ALTER TABLE public.ladder_cycle_results
  ADD COLUMN IF NOT EXISTS start_tier_id   bigint REFERENCES public.ladder_tiers(id),
  ADD COLUMN IF NOT EXISTS start_tier_name text,
  ADD COLUMN IF NOT EXISTS start_tier_rank integer,
  ADD COLUMN IF NOT EXISTS start_stars     smallint CHECK (start_stars IS NULL OR (start_stars >= 0 AND start_stars <= 2));
