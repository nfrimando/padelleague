-- ladder_queue_entries: the self-serve ladder queue (Cycle 2+). A player clicks "Queue", gets a
-- `waiting` row in their current tier, and as soon as 4 are waiting in the same tier they're
-- matched into a ladder match with a play-by deadline. See .claude/ladder.md → "Auto-queue".
--
-- An entry is a queue *ticket*: its job ends at `matched`. From then on the match owns the outcome
-- (matches.status + ladder_matches.cancel_*), so entries never record whether the match was played
-- or cancelled. When a queue match is cancelled by a backout or by an admin, the players who
-- weren't at fault get a NEW `waiting` row that copies the old `queued_at` (keeps their place) and
-- points back via requeued_from_entry_id. Rows are never flipped back to `waiting`. A match an admin
-- expires past its deadline requeues nobody — all 4 rejoin by hand.

CREATE TABLE public.ladder_queue_entries (
  id                      uuid NOT NULL DEFAULT gen_random_uuid(),
  cycle_id                bigint NOT NULL,
  -- The player's tier while waiting. Kept in sync when their standing moves mid-wait.
  tier_id                 bigint NOT NULL,
  player_id               bigint NOT NULL,
  status                  text NOT NULL DEFAULT 'waiting'
                            CHECK (status = ANY (ARRAY['waiting'::text, 'matched'::text, 'withdrawn'::text, 'removed'::text])),
  -- Why a row left `waiting` without being matched: 'player_left' | 'opted_out' | 'cycle_closed' | 'admin' | ...
  status_reason           text,
  -- Queue order. Copied from the previous entry on requeue, which is what "keep your place" means.
  queued_at               timestamptz NOT NULL DEFAULT now(),
  match_id                bigint,
  requeued_from_entry_id  uuid,
  requeue_reason          text CHECK (requeue_reason IS NULL OR requeue_reason = ANY (ARRAY['partner_backout'::text, 'admin_cancelled'::text])),
  matched_at              timestamptz,
  closed_at               timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ladder_queue_entries_pkey PRIMARY KEY (id),
  CONSTRAINT ladder_queue_entries_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES public.ladder_cycles(id),
  CONSTRAINT ladder_queue_entries_tier_id_fkey FOREIGN KEY (tier_id) REFERENCES public.ladder_tiers(id),
  CONSTRAINT ladder_queue_entries_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(player_id),
  -- CASCADE: a matched ticket is meaningless without its match, and SET NULL would violate the
  -- matched ⇔ match_id check below.
  CONSTRAINT ladder_queue_entries_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(match_id) ON DELETE CASCADE,
  CONSTRAINT ladder_queue_entries_requeued_from_fkey FOREIGN KEY (requeued_from_entry_id) REFERENCES public.ladder_queue_entries(id) ON DELETE SET NULL,
  CONSTRAINT ladder_queue_entries_matched_has_match CHECK ((status = 'matched') = (match_id IS NOT NULL))
);

-- One waiting ticket per player, ever. (The other half of "one at a time" — no waiting ticket
-- while holding an open ladder match — spans tables and is enforced by the join path.)
CREATE UNIQUE INDEX uniq_lqe_one_waiting
  ON public.ladder_queue_entries (player_id)
  WHERE status = 'waiting';

CREATE INDEX idx_lqe_tier_queue
  ON public.ladder_queue_entries (cycle_id, tier_id, queued_at)
  WHERE status = 'waiting';

CREATE INDEX idx_lqe_match
  ON public.ladder_queue_entries (match_id)
  WHERE match_id IS NOT NULL;

-- Public, read-only like the other ladder tables (20260718000004_ladder_rls.sql), so /ladder can
-- show "2/4 waiting in Gold". All writes go through the service-role client.
GRANT SELECT ON public.ladder_queue_entries TO anon, authenticated;

ALTER TABLE public.ladder_queue_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read ladder_queue_entries" ON public.ladder_queue_entries;
CREATE POLICY "Public read ladder_queue_entries"
  ON public.ladder_queue_entries
  FOR SELECT
  TO anon, authenticated
  USING (true);
