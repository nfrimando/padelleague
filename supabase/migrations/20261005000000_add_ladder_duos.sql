-- ladder_duos: a fixed two-player partnership for the DUO ladder. The duo ladder runs alongside the
-- solo ladder in the same ladder_cycles, but tracks the PAIR's tier/stars (ladder_duo_standing_events)
-- instead of each player's. See .claude/ladder.md → "Duo ladder".
--
-- One row per unordered pair, forever (player_low_id < player_high_id, UNIQUE). A declined /
-- withdrawn / dissolved pair that re-forms REVIVES the same row instead of minting a new id — so
-- dissolving and re-forming mid-cycle can't reset a duo's standing or re-arm its cushion (the
-- per-cycle cycle_start unique index on the duo ledger keys off duo_id).
--
-- A player may belong to many duos. "Only one of my duos active in the queue / holding an open duo
-- match at a time" spans rows where the player can be low in one and high in another, so it is
-- enforced inside ladder_duo_queue_join (20261005000003), not by an index.

CREATE TABLE public.ladder_duos (
  id                        bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  player_low_id             bigint NOT NULL,
  player_high_id            bigint NOT NULL,
  name                      text CHECK (name IS NULL OR char_length(name) BETWEEN 1 AND 40),
  status                    text NOT NULL DEFAULT 'pending'
                              CHECK (status = ANY (ARRAY['pending'::text, 'active'::text, 'declined'::text, 'withdrawn'::text, 'dissolved'::text])),
  -- NULL when an admin created the duo directly.
  invited_by_player_id      bigint,
  created_by_admin_user_id  uuid,
  invited_at                timestamptz,
  responded_at              timestamptz,
  accepted_at               timestamptz,
  dissolved_at              timestamptz,
  dissolved_by_player_id    bigint,
  dissolve_reason           text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ladder_duos_pkey PRIMARY KEY (id),
  CONSTRAINT ladder_duos_player_low_fkey  FOREIGN KEY (player_low_id)  REFERENCES public.players(player_id),
  CONSTRAINT ladder_duos_player_high_fkey FOREIGN KEY (player_high_id) REFERENCES public.players(player_id),
  CONSTRAINT ladder_duos_invited_by_fkey  FOREIGN KEY (invited_by_player_id) REFERENCES public.players(player_id),
  CONSTRAINT ladder_duos_dissolved_by_fkey FOREIGN KEY (dissolved_by_player_id) REFERENCES public.players(player_id),
  CONSTRAINT ladder_duos_canonical_pair CHECK (player_low_id < player_high_id),
  CONSTRAINT ladder_duos_inviter_is_member CHECK (
    invited_by_player_id IS NULL OR invited_by_player_id IN (player_low_id, player_high_id)
  ),
  CONSTRAINT ladder_duos_pair_uniq UNIQUE (player_low_id, player_high_id)
);

CREATE INDEX idx_ladder_duos_low_status  ON public.ladder_duos (player_low_id, status);
CREATE INDEX idx_ladder_duos_high_status ON public.ladder_duos (player_high_id, status);

-- Public read for formed duos only — pending/declined/withdrawn invites are private to the two
-- players and are served through the service-role API. No write policies: all writes go through the
-- service-role client, same as every other ladder table.
GRANT SELECT ON public.ladder_duos TO anon, authenticated;

ALTER TABLE public.ladder_duos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read formed ladder_duos" ON public.ladder_duos;
CREATE POLICY "Public read formed ladder_duos"
  ON public.ladder_duos
  FOR SELECT
  TO anon, authenticated
  USING (status IN ('active', 'dissolved'));
