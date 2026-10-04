-- Queue-sourced ladder matches: a third `source`, a play-by deadline, and a record of WHY a match
-- was cancelled. matches.status stays the source of truth for "cancelled"; these columns only
-- explain it.
--
-- The deadline applies to source='queue' only — roulette/manual matches keep the "never expires"
-- behavior from 20260827000000_drop_ladder_match_deadlines.sql.
--
-- Strikes are NOT a table: a player's backout count is
--   SELECT count(*) FROM ladder_matches WHERE cancel_reason = 'backout' AND cancelled_by_player_id = :p
-- Penalties are applied by hand as admin star adjustments (ladder_standing_events
-- event_type='admin_adjustment').

-- The source CHECK was declared inline in 20260719000001, so look up its auto-generated name
-- rather than assuming it (same approach as 20260719000000_add_matches_assigned_status.sql).
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'public.ladder_matches'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%source%'
    AND pg_get_constraintdef(oid) ILIKE '%roulette%';

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.ladder_matches DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE public.ladder_matches
  ADD CONSTRAINT ladder_matches_source_check
    CHECK (source = ANY (ARRAY['manual'::text, 'roulette'::text, 'queue'::text])),
  ADD COLUMN play_by_at             timestamptz,
  ADD COLUMN cancel_reason          text
    CHECK (cancel_reason IS NULL OR cancel_reason = ANY (ARRAY['backout'::text, 'deadline_expired'::text, 'admin_cancelled'::text])),
  ADD COLUMN cancelled_at           timestamptz,
  ADD COLUMN cancelled_by_player_id bigint REFERENCES public.players(player_id),
  ADD CONSTRAINT ladder_matches_play_by_queue_only
    CHECK (play_by_at IS NULL OR source = 'queue'),
  ADD CONSTRAINT ladder_matches_cancel_consistent
    CHECK ((cancel_reason IS NULL) = (cancelled_at IS NULL)),
  ADD CONSTRAINT ladder_matches_backout_has_player
    CHECK ((cancel_reason IS NOT DISTINCT FROM 'backout') = (cancelled_by_player_id IS NOT NULL));

-- Admin overdue list (expiry is admin-triggered, not automatic).
CREATE INDEX idx_lm_queue_open_deadline
  ON public.ladder_matches (play_by_at)
  WHERE source = 'queue' AND cancelled_at IS NULL;

-- Strike counts.
CREATE INDEX idx_lm_backouts
  ON public.ladder_matches (cycle_id, cancelled_by_player_id)
  WHERE cancel_reason = 'backout';
