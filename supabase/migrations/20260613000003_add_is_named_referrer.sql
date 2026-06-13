ALTER TABLE public.signups_players_referrers
  ADD COLUMN is_named_referrer boolean NOT NULL DEFAULT false;

-- Backfill: all existing rows were inserted at application time (named by the recruit)
UPDATE public.signups_players_referrers SET is_named_referrer = true;
