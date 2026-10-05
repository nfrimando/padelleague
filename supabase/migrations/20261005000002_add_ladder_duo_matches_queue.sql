-- Duo ladder matches + the duo queue. Mirrors ladder_matches (20260718000002 + 20261004000001) and
-- ladder_queue_entries (20261004000000), keyed by duo instead of player.
--
-- A match is a solo ladder match (ladder_matches row), a duo ladder match (ladder_duo_matches row),
-- or neither — never both. The triggers at the bottom enforce that exclusivity in both directions.

-- 1. ladder_duo_matches: satellite table marking a match as a duo-ladder match. matches /
-- match_teams / match_sets stay the single source of truth for what was played; team N of the match
-- must seat exactly duo N's two players (validated by the app at create time and again at sync).
CREATE TABLE public.ladder_duo_matches (
  id                      uuid NOT NULL DEFAULT gen_random_uuid(),
  match_id                bigint NOT NULL,
  cycle_id                bigint NOT NULL,
  team1_duo_id            bigint NOT NULL,
  team2_duo_id            bigint NOT NULL,
  -- The tier the match was made in (queue: the shared tier; manual: team 1's tier). Display only —
  -- standings come from the ledger.
  tier_id                 bigint,
  source                  text NOT NULL DEFAULT 'manual'
                            CHECK (source = ANY (ARRAY['manual'::text, 'queue'::text])),
  play_by_at              timestamptz,
  cancel_reason           text
                            CHECK (cancel_reason IS NULL OR cancel_reason = ANY (ARRAY['backout'::text, 'deadline_expired'::text, 'admin_cancelled'::text])),
  cancelled_at            timestamptz,
  cancelled_by_player_id  bigint,
  -- The backer-out's duo. One row with cancel_reason='backout' = one strike against that duo.
  cancelled_by_duo_id     bigint,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ladder_duo_matches_pkey PRIMARY KEY (id),
  CONSTRAINT ladder_duo_matches_match_id_key UNIQUE (match_id),
  CONSTRAINT ladder_duo_matches_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(match_id) ON DELETE CASCADE,
  CONSTRAINT ladder_duo_matches_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES public.ladder_cycles(id),
  CONSTRAINT ladder_duo_matches_team1_fkey FOREIGN KEY (team1_duo_id) REFERENCES public.ladder_duos(id),
  CONSTRAINT ladder_duo_matches_team2_fkey FOREIGN KEY (team2_duo_id) REFERENCES public.ladder_duos(id),
  CONSTRAINT ladder_duo_matches_tier_id_fkey FOREIGN KEY (tier_id) REFERENCES public.ladder_tiers(id),
  CONSTRAINT ladder_duo_matches_cancelled_by_player_fkey FOREIGN KEY (cancelled_by_player_id) REFERENCES public.players(player_id),
  CONSTRAINT ladder_duo_matches_cancelled_by_duo_fkey FOREIGN KEY (cancelled_by_duo_id) REFERENCES public.ladder_duos(id),
  CONSTRAINT ladder_duo_matches_distinct_duos CHECK (team1_duo_id <> team2_duo_id),
  CONSTRAINT ladder_duo_matches_play_by_queue_only CHECK (play_by_at IS NULL OR source = 'queue'),
  CONSTRAINT ladder_duo_matches_cancel_consistent CHECK ((cancel_reason IS NULL) = (cancelled_at IS NULL)),
  CONSTRAINT ladder_duo_matches_backout_has_player CHECK (
    (cancel_reason IS NOT DISTINCT FROM 'backout') = (cancelled_by_player_id IS NOT NULL)
    AND (cancelled_by_player_id IS NULL) = (cancelled_by_duo_id IS NULL)
  )
);

CREATE INDEX idx_ldm_cycle ON public.ladder_duo_matches (cycle_id);
CREATE INDEX idx_ldm_team1 ON public.ladder_duo_matches (team1_duo_id);
CREATE INDEX idx_ldm_team2 ON public.ladder_duo_matches (team2_duo_id);
CREATE INDEX idx_ldm_queue_open_deadline
  ON public.ladder_duo_matches (play_by_at)
  WHERE source = 'queue' AND cancelled_at IS NULL;
CREATE INDEX idx_ldm_backouts
  ON public.ladder_duo_matches (cycle_id, cancelled_by_duo_id)
  WHERE cancel_reason = 'backout';

-- 2. ladder_duo_queue_entries: one row per duo queue ticket. Same lifecycle as ladder_queue_entries
-- (a ticket's job ends at `matched`; requeues are NEW rows copying queued_at).
CREATE TABLE public.ladder_duo_queue_entries (
  id                      uuid NOT NULL DEFAULT gen_random_uuid(),
  cycle_id                bigint NOT NULL,
  tier_id                 bigint NOT NULL,
  duo_id                  bigint NOT NULL,
  -- Which member pressed "Queue" (either may; either may leave).
  queued_by_player_id     bigint,
  status                  text NOT NULL DEFAULT 'waiting'
                            CHECK (status = ANY (ARRAY['waiting'::text, 'matched'::text, 'withdrawn'::text, 'removed'::text])),
  -- 'player_left' | 'duo_dissolved' | 'cycle_closed' | 'admin' | ...
  status_reason           text,
  queued_at               timestamptz NOT NULL DEFAULT now(),
  match_id                bigint,
  requeued_from_entry_id  uuid,
  requeue_reason          text CHECK (requeue_reason IS NULL OR requeue_reason = ANY (ARRAY['opponent_backout'::text, 'admin_cancelled'::text])),
  matched_at              timestamptz,
  closed_at               timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ladder_duo_queue_entries_pkey PRIMARY KEY (id),
  CONSTRAINT ladder_duo_queue_entries_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES public.ladder_cycles(id),
  CONSTRAINT ladder_duo_queue_entries_tier_id_fkey FOREIGN KEY (tier_id) REFERENCES public.ladder_tiers(id),
  CONSTRAINT ladder_duo_queue_entries_duo_id_fkey FOREIGN KEY (duo_id) REFERENCES public.ladder_duos(id),
  CONSTRAINT ladder_duo_queue_entries_queued_by_fkey FOREIGN KEY (queued_by_player_id) REFERENCES public.players(player_id),
  CONSTRAINT ladder_duo_queue_entries_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(match_id) ON DELETE CASCADE,
  CONSTRAINT ladder_duo_queue_entries_requeued_from_fkey FOREIGN KEY (requeued_from_entry_id) REFERENCES public.ladder_duo_queue_entries(id) ON DELETE SET NULL,
  CONSTRAINT ladder_duo_queue_entries_matched_has_match CHECK ((status = 'matched') = (match_id IS NOT NULL))
);

CREATE UNIQUE INDEX uniq_ldqe_one_waiting
  ON public.ladder_duo_queue_entries (duo_id)
  WHERE status = 'waiting';

CREATE INDEX idx_ldqe_tier_queue
  ON public.ladder_duo_queue_entries (cycle_id, tier_id, queued_at)
  WHERE status = 'waiting';

CREATE INDEX idx_ldqe_match
  ON public.ladder_duo_queue_entries (match_id)
  WHERE match_id IS NOT NULL;

-- 3. Solo/duo exclusivity: a match can carry at most one ladder satellite row.
CREATE OR REPLACE FUNCTION public.ladder_match_mode_exclusive()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'ladder_duo_matches' THEN
    IF EXISTS (SELECT 1 FROM public.ladder_matches WHERE match_id = NEW.match_id) THEN
      RAISE EXCEPTION 'match % is already a solo ladder match', NEW.match_id;
    END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM public.ladder_duo_matches WHERE match_id = NEW.match_id) THEN
      RAISE EXCEPTION 'match % is already a duo ladder match', NEW.match_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ladder_duo_matches_exclusive ON public.ladder_duo_matches;
CREATE TRIGGER trg_ladder_duo_matches_exclusive
  BEFORE INSERT OR UPDATE OF match_id ON public.ladder_duo_matches
  FOR EACH ROW EXECUTE FUNCTION public.ladder_match_mode_exclusive();

DROP TRIGGER IF EXISTS trg_ladder_matches_exclusive ON public.ladder_matches;
CREATE TRIGGER trg_ladder_matches_exclusive
  BEFORE INSERT OR UPDATE OF match_id ON public.ladder_matches
  FOR EACH ROW EXECUTE FUNCTION public.ladder_match_mode_exclusive();

-- 4. Public, read-only like the other ladder tables. Writes go through the service-role client.
GRANT SELECT ON public.ladder_duo_matches       TO anon, authenticated;
GRANT SELECT ON public.ladder_duo_queue_entries TO anon, authenticated;

ALTER TABLE public.ladder_duo_matches       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ladder_duo_queue_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read ladder_duo_matches" ON public.ladder_duo_matches;
CREATE POLICY "Public read ladder_duo_matches"
  ON public.ladder_duo_matches FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public read ladder_duo_queue_entries" ON public.ladder_duo_queue_entries;
CREATE POLICY "Public read ladder_duo_queue_entries"
  ON public.ladder_duo_queue_entries FOR SELECT TO anon, authenticated USING (true);
