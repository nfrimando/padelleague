-- Pending duo invites expire after DUO_INVITE_EXPIRY_DAYS (src/lib/ladder/ladderDuoShared.ts) so
-- stale ones stop counting toward a player's live-duo cap. Expiry is lazy — the app flips stale
-- `pending` rows to `expired` whenever it reads or writes invites (expireStaleDuoInvites in
-- src/lib/ladder/ladderDuos.ts); there is no cron. An expired pair is revived by a fresh invite, like
-- a declined one.
--
-- The status CHECK was declared inline in 20261005000000, so look up its auto-generated name rather
-- than assuming it (same approach as 20261004000001_ladder_matches_queue_fields.sql).
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'public.ladder_duos'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%'
    AND pg_get_constraintdef(oid) ILIKE '%dissolved%';

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.ladder_duos DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE public.ladder_duos
  ADD CONSTRAINT ladder_duos_status_check
    CHECK (status = ANY (ARRAY['pending'::text, 'active'::text, 'declined'::text, 'withdrawn'::text, 'dissolved'::text, 'expired'::text]));

-- The lazy-expiry sweep filters on pending + invited_at.
CREATE INDEX IF NOT EXISTS idx_ladder_duos_pending_invited
  ON public.ladder_duos (invited_at)
  WHERE status = 'pending';
