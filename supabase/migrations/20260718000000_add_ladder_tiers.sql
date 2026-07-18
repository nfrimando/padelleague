-- ladder_tiers: the tier ladder definition (Bronze/Silver/Gold/...), global and not per-cycle.
-- elo_floor does double duty: initial placement into a tier based on current ELO, and the
-- post-cycle-reset floor (players never drop below the tier their ELO says they belong in).
-- See .claude/ladder.md for the full mechanic and schema design.

CREATE TABLE public.ladder_tiers (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        text NOT NULL UNIQUE,
  rank        integer NOT NULL UNIQUE CHECK (rank > 0),
  elo_floor   numeric NOT NULL DEFAULT 0 CHECK (elo_floor >= 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Placeholder tiers/thresholds — edit via SQL once real names/cutoffs are decided.
INSERT INTO public.ladder_tiers (name, rank, elo_floor) VALUES
  ('Bronze',   1, 0),
  ('Silver',   2, 1000),
  ('Gold',     3, 1200),
  ('Platinum', 4, 1400);
