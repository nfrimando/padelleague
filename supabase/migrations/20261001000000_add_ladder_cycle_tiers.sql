-- Per-cycle tier thresholds.
--
-- ladder_tiers.elo_floor is global and editable only by raw SQL -- it was already DELETEd and
-- reseeded once (20260718000005_fix_ladder_tier_thresholds.sql replaced a 0/1000/1200/1400 scale
-- with 0/1.5/3/4.5/6). That makes it impossible to say which cutoffs a past cycle actually ran
-- under, and it gave admins no way to set new cutoffs when starting a cycle.
--
-- This table snapshots the floors a cycle was started with. ladder_tiers keeps tier IDENTITY
-- (id / name / rank) -- which is what ladder_standing_events and ladder_cycle_results reference --
-- and its elo_floor stays as the default for any cycle with no snapshot row.
--
-- Written by startLadderCycle (src/lib/ladder/ladderCycleStart.ts); read by fetchTiersForCycle
-- (src/lib/ladder/ladderCycleTiers.ts).

CREATE TABLE IF NOT EXISTS public.ladder_cycle_tiers (
  cycle_id   bigint      NOT NULL REFERENCES public.ladder_cycles(id) ON DELETE CASCADE,
  tier_id    bigint      NOT NULL REFERENCES public.ladder_tiers(id),
  elo_floor  numeric     NOT NULL CHECK (elo_floor >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cycle_id, tier_id)
);

-- Backfill every existing cycle from today's global floors, so no cycle is left without a
-- snapshot. Cycle 1 ran under 0/1.5/3/4.5/6, which is exactly what ladder_tiers holds now.
INSERT INTO public.ladder_cycle_tiers (cycle_id, tier_id, elo_floor)
SELECT c.id, t.id, t.elo_floor
FROM public.ladder_cycles c
CROSS JOIN public.ladder_tiers t
ON CONFLICT (cycle_id, tier_id) DO NOTHING;

-- Read-only public data, same as the other ladder tables (20260718000004_ladder_rls.sql).
-- Writes go through the service-role admin client; no write policies by design.
GRANT SELECT ON public.ladder_cycle_tiers TO anon, authenticated;

ALTER TABLE public.ladder_cycle_tiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read ladder_cycle_tiers" ON public.ladder_cycle_tiers;
CREATE POLICY "Public read ladder_cycle_tiers"
  ON public.ladder_cycle_tiers
  FOR SELECT
  TO anon, authenticated
  USING (true);
