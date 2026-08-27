-- Ladder assignments no longer expire: a match stays open until it's played or an admin
-- cancels it, so the play-by deadline and the expiry-sweep marker are gone. `source`
-- (manual vs roulette) stays. Matches previously cancelled by the sweep keep their
-- `matches.status = 'cancelled'`; only the redundant marker is dropped.
ALTER TABLE public.ladder_matches
  DROP CONSTRAINT IF EXISTS ladder_matches_deadline_requires_roulette;

ALTER TABLE public.ladder_matches
  DROP COLUMN IF EXISTS schedule_deadline_at,
  DROP COLUMN IF EXISTS expired_at;
