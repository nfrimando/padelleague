-- Roulette metadata on ladder_matches: distinguishes admin-created ("manual")
-- matches from roulette-assigned ones, and tracks the play-by deadline plus
-- whether an assignment was neutrally cancelled by the expiry sweep.
ALTER TABLE public.ladder_matches
  ADD COLUMN source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'roulette')),
  ADD COLUMN schedule_deadline_at timestamptz,
  ADD COLUMN expired_at timestamptz;

ALTER TABLE public.ladder_matches
  ADD CONSTRAINT ladder_matches_deadline_requires_roulette
    CHECK (schedule_deadline_at IS NULL OR source = 'roulette');
