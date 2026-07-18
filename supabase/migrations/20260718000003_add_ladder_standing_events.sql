-- ladder_standing_events: the ledger and source of truth for a player's current/effective
-- ladder tier+stars and their progression history. Mirrors the player_rating_events pattern
-- (append-only ledger; current state = latest row per player+cycle ordered by
-- occurred_at desc, created_at desc). See .claude/ladder.md and CLAUDE.md's ledger rule.
--
-- event_type is deliberately left without a CHECK (cycle_start | match_win | match_loss |
-- promotion | cycle_reset | future...) so new event types stay safe to add — progression UIs
-- must handle unknown event_type values gracefully, same as describeRatingEvent.
--
-- Generating these rows from completed ladder_matches (a sync trigger mirroring
-- sync_pre_match_event / trg_sync_match_player_ratings in
-- 20260617000002_player_rating_events_sync.sql) is intentionally NOT part of this migration —
-- it belongs with the match-logging feature, since ladder star progression is stateful
-- (each match's outcome depends on the player's current tier/stars/cushion).

CREATE TABLE public.ladder_standing_events (
  id                 uuid NOT NULL DEFAULT gen_random_uuid(),
  cycle_id           bigint NOT NULL,
  player_id          bigint NOT NULL,
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
  CONSTRAINT ladder_standing_events_pkey PRIMARY KEY (id),
  CONSTRAINT ladder_standing_events_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES public.ladder_cycles(id),
  CONSTRAINT ladder_standing_events_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(player_id),
  CONSTRAINT ladder_standing_events_tier_before_id_fkey FOREIGN KEY (tier_before_id) REFERENCES public.ladder_tiers(id),
  CONSTRAINT ladder_standing_events_tier_after_id_fkey FOREIGN KEY (tier_after_id) REFERENCES public.ladder_tiers(id)
);

CREATE INDEX idx_lse_cycle_player_occurred
  ON public.ladder_standing_events (cycle_id, player_id, occurred_at DESC NULLS LAST, created_at DESC);

CREATE INDEX idx_lse_source
  ON public.ladder_standing_events (source_type, source_id)
  WHERE source_id IS NOT NULL;

CREATE UNIQUE INDEX uniq_lse_match
  ON public.ladder_standing_events (player_id, source_id)
  WHERE source_type = 'match';

CREATE UNIQUE INDEX uniq_lse_cycle_start
  ON public.ladder_standing_events (player_id, cycle_id)
  WHERE event_type = 'cycle_start';
