-- Duo ladder ledger + per-cycle floors + frozen results. Each mirrors its solo counterpart
-- (ladder_standing_events, ladder_cycle_tiers, ladder_cycle_results) keyed by duo_id instead of
-- player_id. Kept as separate tables rather than a mode column on the solo ones so no solo read
-- path needs a filter — see .claude/ladder.md → "Duo ladder" → "Why separate tables".
--
-- Tier IDENTITY is shared (ladder_tiers) and so are cycles (ladder_cycles): one cycle covers both
-- ladders. Only the floors differ — a duo is placed by the AVERAGE of its two players' ratings
-- against ladder_cycle_duo_tiers.

-- 1. Per-cycle duo floors. Written by startLadderCycle; read by fetchTiersForCycle(.., "duo").
CREATE TABLE IF NOT EXISTS public.ladder_cycle_duo_tiers (
  cycle_id   bigint      NOT NULL REFERENCES public.ladder_cycles(id) ON DELETE CASCADE,
  tier_id    bigint      NOT NULL REFERENCES public.ladder_tiers(id),
  elo_floor  numeric     NOT NULL CHECK (elo_floor >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cycle_id, tier_id)
);

-- A cycle already running when this lands gets the solo floors as its duo floors, so duos formed
-- mid-cycle have something to be placed by. Later cycles get their own via the start panel.
INSERT INTO public.ladder_cycle_duo_tiers (cycle_id, tier_id, elo_floor)
SELECT ct.cycle_id, ct.tier_id, ct.elo_floor
FROM public.ladder_cycle_tiers ct
JOIN public.ladder_cycles c ON c.id = ct.cycle_id
WHERE c.status = 'active'
ON CONFLICT (cycle_id, tier_id) DO NOTHING;

-- 2. The duo ledger: source of truth for a duo's current tier/stars and its history. Same rules as
-- ladder_standing_events — append-only, current state = latest row per duo+cycle ordered by
-- (occurred_at desc, created_at desc), event_type deliberately unchecked.
CREATE TABLE public.ladder_duo_standing_events (
  id                 uuid NOT NULL DEFAULT gen_random_uuid(),
  cycle_id           bigint NOT NULL,
  duo_id             bigint NOT NULL,
  event_type         text NOT NULL,
  tier_before_id     bigint,
  tier_after_id      bigint NOT NULL,
  stars_before       smallint CHECK (stars_before IS NULL OR (stars_before >= 0 AND stars_before <= 2)),
  stars_after        smallint NOT NULL CHECK (stars_after >= 0 AND stars_after <= 2),
  cushion_available  boolean NOT NULL DEFAULT false,
  source_type        text,
  source_id          text,
  occurred_at        timestamptz,
  metadata           jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ladder_duo_standing_events_pkey PRIMARY KEY (id),
  CONSTRAINT ladder_duo_standing_events_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES public.ladder_cycles(id),
  CONSTRAINT ladder_duo_standing_events_duo_id_fkey FOREIGN KEY (duo_id) REFERENCES public.ladder_duos(id),
  CONSTRAINT ladder_duo_standing_events_tier_before_id_fkey FOREIGN KEY (tier_before_id) REFERENCES public.ladder_tiers(id),
  CONSTRAINT ladder_duo_standing_events_tier_after_id_fkey FOREIGN KEY (tier_after_id) REFERENCES public.ladder_tiers(id)
);

CREATE INDEX idx_ldse_cycle_duo_occurred
  ON public.ladder_duo_standing_events (cycle_id, duo_id, occurred_at DESC NULLS LAST, created_at DESC);

CREATE INDEX idx_ldse_source
  ON public.ladder_duo_standing_events (source_type, source_id)
  WHERE source_id IS NOT NULL;

CREATE UNIQUE INDEX uniq_ldse_match
  ON public.ladder_duo_standing_events (duo_id, source_id)
  WHERE source_type = 'match';

CREATE UNIQUE INDEX uniq_ldse_cycle_start
  ON public.ladder_duo_standing_events (duo_id, cycle_id)
  WHERE event_type = 'cycle_start';

-- 3. Frozen end-of-cycle record per duo. Written by closeLadderCycle alongside ladder_cycle_results.
-- Players and duo name are denormalized so the record survives a dissolve/rename.
CREATE TABLE public.ladder_duo_cycle_results (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  cycle_id        bigint NOT NULL,
  duo_id          bigint NOT NULL,
  player_low_id   bigint NOT NULL,
  player_high_id  bigint NOT NULL,
  duo_name        text,
  tier_id         bigint NOT NULL,
  tier_name       text NOT NULL,
  tier_rank       integer NOT NULL,
  stars           smallint NOT NULL CHECK (stars >= 0 AND stars <= 2),
  start_tier_id   bigint REFERENCES public.ladder_tiers(id),
  start_tier_name text,
  start_tier_rank integer,
  start_stars     smallint CHECK (start_stars IS NULL OR (start_stars >= 0 AND start_stars <= 2)),
  matches_played  integer NOT NULL DEFAULT 0,
  wins            integer NOT NULL DEFAULT 0,
  losses          integer NOT NULL DEFAULT 0,
  overall_rank    integer CHECK (overall_rank IS NULL OR overall_rank > 0),
  tier_position   integer CHECK (tier_position IS NULL OR tier_position > 0),
  badge_eligible  boolean NOT NULL DEFAULT false,
  -- Average of the two players' ratings at close.
  final_rating    numeric,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ladder_duo_cycle_results_pkey PRIMARY KEY (id),
  CONSTRAINT ladder_duo_cycle_results_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES public.ladder_cycles(id),
  CONSTRAINT ladder_duo_cycle_results_duo_id_fkey   FOREIGN KEY (duo_id)   REFERENCES public.ladder_duos(id),
  CONSTRAINT ladder_duo_cycle_results_low_fkey      FOREIGN KEY (player_low_id)  REFERENCES public.players(player_id),
  CONSTRAINT ladder_duo_cycle_results_high_fkey     FOREIGN KEY (player_high_id) REFERENCES public.players(player_id),
  CONSTRAINT ladder_duo_cycle_results_tier_id_fkey  FOREIGN KEY (tier_id)  REFERENCES public.ladder_tiers(id),
  CONSTRAINT ladder_duo_cycle_results_uniq UNIQUE (cycle_id, duo_id),
  CONSTRAINT ladder_duo_cycle_results_rank_consistent CHECK (
    (badge_eligible AND overall_rank IS NOT NULL AND tier_position IS NOT NULL) OR
    (NOT badge_eligible AND overall_rank IS NULL AND tier_position IS NULL)
  )
);

CREATE INDEX idx_ldcr_cycle_overall ON public.ladder_duo_cycle_results (cycle_id, overall_rank);
CREATE INDEX idx_ldcr_duo           ON public.ladder_duo_cycle_results (duo_id);

-- Public, read-only like the other ladder tables. Writes go through the service-role client.
GRANT SELECT ON public.ladder_cycle_duo_tiers     TO anon, authenticated;
GRANT SELECT ON public.ladder_duo_standing_events TO anon, authenticated;
GRANT SELECT ON public.ladder_duo_cycle_results   TO anon, authenticated;

ALTER TABLE public.ladder_cycle_duo_tiers     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ladder_duo_standing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ladder_duo_cycle_results   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read ladder_cycle_duo_tiers" ON public.ladder_cycle_duo_tiers;
CREATE POLICY "Public read ladder_cycle_duo_tiers"
  ON public.ladder_cycle_duo_tiers FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public read ladder_duo_standing_events" ON public.ladder_duo_standing_events;
CREATE POLICY "Public read ladder_duo_standing_events"
  ON public.ladder_duo_standing_events FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public read ladder_duo_cycle_results" ON public.ladder_duo_cycle_results;
CREATE POLICY "Public read ladder_duo_cycle_results"
  ON public.ladder_duo_cycle_results FOR SELECT TO anon, authenticated USING (true);
