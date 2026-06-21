-- Rating recalibration requests: a player asks for their current rating to be
-- reassessed by a committee-selected group of recent opponents (respondents).
-- See CLAUDE.md / player_rating_events_sync.sql comment block: this is exactly the
-- kind of feature that must insert its own player_rating_events row on resolution.

CREATE TABLE public.recalibration_requests (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id         BIGINT NOT NULL REFERENCES public.players(player_id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'resolved', 'cancelled')),
  outcome           TEXT CHECK (outcome IN ('retained', 'updated')),  -- NULL while pending or cancelled
  rating_at_request NUMERIC NOT NULL,   -- snapshot of current rating when requested
  requestor_notes   TEXT,               -- free text from the requestor explaining their basis
  computed_average  NUMERIC,            -- avg of submitted respondent ratings, set at resolution
  resolved_rating   NUMERIC,            -- rating actually applied if outcome = 'updated'
  admin_notes       TEXT,
  requested_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at       TIMESTAMPTZ,        -- set on resolve OR cancel
  resolved_by       UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_recalibration_requests_player ON public.recalibration_requests (player_id, requested_at DESC);
CREATE INDEX idx_recalibration_requests_status ON public.recalibration_requests (status) WHERE status = 'pending';

CREATE TABLE public.recalibration_respondents (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recalibration_id BIGINT NOT NULL REFERENCES public.recalibration_requests(id) ON DELETE CASCADE,
  player_id        BIGINT NOT NULL REFERENCES public.players(player_id) ON DELETE CASCADE,
  rating           NUMERIC CHECK (rating IS NULL OR rating >= 0),
  notes            TEXT,
  added_by         UUID REFERENCES auth.users(id),
  submitted_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT recalibration_respondents_unique UNIQUE (recalibration_id, player_id)
);

CREATE INDEX idx_recalibration_respondents_request ON public.recalibration_respondents (recalibration_id);
CREATE INDEX idx_recalibration_respondents_player ON public.recalibration_respondents (player_id);
