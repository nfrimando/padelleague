-- ladder_cycles: one row per ladder season. At the end of a cycle everyone drops a tier
-- (floored by ELO) and the climb starts again. See .claude/ladder.md.

CREATE TABLE public.ladder_cycles (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  label       text NOT NULL,
  status      text NOT NULL DEFAULT 'upcoming' CHECK (status = ANY (ARRAY['upcoming'::text, 'active'::text, 'completed'::text])),
  starts_at   timestamptz,
  ends_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

-- At most one active cycle at a time.
CREATE UNIQUE INDEX ladder_cycles_uniq_active
  ON public.ladder_cycles ((status))
  WHERE status = 'active';
