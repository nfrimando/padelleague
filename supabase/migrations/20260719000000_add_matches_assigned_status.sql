-- Add 'assigned' as a valid matches.status value: a roulette-created match that
-- has no confirmed date/time/venue yet, sitting between creation and 'scheduled'.
-- The existing CHECK constraint on matches.status is unnamed in the original table
-- definition, so find whatever Postgres auto-named it as (rather than assuming
-- "matches_status_check") before replacing it.
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'public.matches'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%';

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.matches DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE public.matches ADD CONSTRAINT matches_status_check
  CHECK (status = ANY (ARRAY['scheduled'::text, 'completed'::text, 'forfeit'::text, 'cancelled'::text, 'assigned'::text]));
