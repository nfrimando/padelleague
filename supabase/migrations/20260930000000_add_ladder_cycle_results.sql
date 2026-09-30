-- ladder_cycle_results: the frozen, per-cycle record of where every placed player finished.
-- Written once by the admin cycle-close action (src/lib/ladder/ladderCycleClose.ts), which is
-- the only thing that ever completes a ladder_cycles row.
--
-- Why a table and not a view: ladder_tiers is global and MUTABLE -- it was already deleted and
-- reseeded once (20260718000005_fix_ladder_tier_thresholds.sql replaced an unrelated
-- 0/1000/1200/1400 scale with 0/1.5/3/4.5/6 and added Diamond). A view recomputing history from
-- the ledger would silently rewrite past cycles the next time thresholds move, which defeats the
-- purpose of a permanent badge. tier_name/tier_rank are denormalized here for the same reason.
-- .claude/ladder.md also records the standing decision that this codebase uses no SQL views.
--
-- Ranks cover badge-eligible players only (>= 3 completed ladder matches); everyone else still
-- gets a row -- so the threshold can be revisited later without having lost the data -- with NULL
-- ranks and badge_eligible = false.

CREATE TABLE public.ladder_cycle_results (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  cycle_id        bigint NOT NULL,
  player_id       bigint NOT NULL,
  tier_id         bigint NOT NULL,
  -- Denormalized tier facts as of close, immune to future ladder_tiers reseeds.
  tier_name       text NOT NULL,
  tier_rank       integer NOT NULL,
  stars           smallint NOT NULL CHECK (stars >= 0 AND stars <= 2),
  matches_played  integer NOT NULL DEFAULT 0,
  wins            integer NOT NULL DEFAULT 0,
  losses          integer NOT NULL DEFAULT 0,
  -- The PLAYER's placings. NULL when not badge_eligible.
  overall_rank    integer CHECK (overall_rank IS NULL OR overall_rank > 0),
  tier_position   integer CHECK (tier_position IS NULL OR tier_position > 0),
  badge_eligible  boolean NOT NULL DEFAULT false,
  final_rating    numeric,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ladder_cycle_results_pkey PRIMARY KEY (id),
  CONSTRAINT ladder_cycle_results_cycle_id_fkey  FOREIGN KEY (cycle_id)  REFERENCES public.ladder_cycles(id),
  CONSTRAINT ladder_cycle_results_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(player_id),
  CONSTRAINT ladder_cycle_results_tier_id_fkey   FOREIGN KEY (tier_id)   REFERENCES public.ladder_tiers(id),
  CONSTRAINT ladder_cycle_results_uniq UNIQUE (cycle_id, player_id),
  -- Ranks and eligibility are set together by the close job; neither can exist without the other.
  CONSTRAINT ladder_cycle_results_rank_consistent CHECK (
    (badge_eligible AND overall_rank IS NOT NULL AND tier_position IS NOT NULL) OR
    (NOT badge_eligible AND overall_rank IS NULL AND tier_position IS NULL)
  )
);

CREATE INDEX idx_lcr_cycle_overall ON public.ladder_cycle_results (cycle_id, overall_rank);
CREATE INDEX idx_lcr_player        ON public.ladder_cycle_results (player_id);

-- Public, read-only data like the rest of the ladder tables. No write policy: the close job runs
-- through the service-role admin client. Mirrors 20260718000004_ladder_rls.sql.
GRANT SELECT ON public.ladder_cycle_results TO anon, authenticated;

ALTER TABLE public.ladder_cycle_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read ladder_cycle_results" ON public.ladder_cycle_results;
CREATE POLICY "Public read ladder_cycle_results"
  ON public.ladder_cycle_results
  FOR SELECT
  TO anon, authenticated
  USING (true);
