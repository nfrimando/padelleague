-- ─── 1. Create table ──────────────────────────────────────────────────────────
CREATE TABLE public.player_rating_events (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id      BIGINT      NOT NULL REFERENCES public.players(player_id) ON DELETE CASCADE,
  event_type     TEXT        NOT NULL,  -- 'initial_rating' | 'match_win' | 'match_loss' | future types
  rating_before  NUMERIC,              -- NULL for initial_rating (no prior rating)
  rating_after   NUMERIC     NOT NULL,
  rating_delta   NUMERIC,              -- NULL for initial_rating
  source_type    TEXT,                 -- 'match' | 'recalibration' | 'admin' | NULL for initial_rating
  source_id      TEXT,                 -- ID of the source entity as text (match_id, uuid, etc.)
  occurred_at    TIMESTAMPTZ,          -- match date or player created_at; NULL = unknown
  metadata       JSONB,                -- extensible bag for extra context per event type
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Primary access pattern: latest rating for a player
CREATE INDEX idx_pre_player_occurred ON public.player_rating_events (player_id, occurred_at DESC NULLS LAST);
-- Reverse lookup: all rating events caused by a specific source (e.g. a match)
CREATE INDEX idx_pre_source ON public.player_rating_events (source_type, source_id) WHERE source_id IS NOT NULL;

-- ─── 2. Backfill: initial_rating events ───────────────────────────────────────
-- One row per player who has initial_rating set.
-- occurred_at is NULL (genesis): hooks order NULLS FIRST asc so it always precedes match events.
-- (players.created_at is unreliable — imported players were created after their historical matches.)
INSERT INTO public.player_rating_events
  (player_id, event_type, rating_before, rating_after, rating_delta, occurred_at)
SELECT
  player_id,
  'initial_rating',
  NULL,
  initial_rating,
  NULL,
  NULL
FROM public.players
WHERE initial_rating IS NOT NULL;

-- ─── 3. Backfill: match events ────────────────────────────────────────────────
-- Deduplicate player+match pairs: prefer v3 over v2 over anything else.
-- occurred_at uses match date_local (cast to timestamptz at midnight UTC); falls
-- back to the rating row's own created_at if date_local is NULL.
WITH ranked AS (
  SELECT
    mpr.player_id,
    mpr.match_id,
    mpr.rating_pre,
    mpr.rating_post,
    mpr.result,
    mpr.formula_name,
    mpr.created_at                 AS rating_created_at,
    m.date_local::timestamptz      AS match_date,
    ROW_NUMBER() OVER (
      PARTITION BY mpr.player_id, mpr.match_id
      ORDER BY
        CASE mpr.formula_name
          WHEN 'v3' THEN 2
          WHEN 'v2' THEN 1
          ELSE 0
        END DESC,
        mpr.created_at DESC
    ) AS rn
  FROM public.match_player_ratings mpr
  JOIN public.matches m ON m.match_id = mpr.match_id
)
INSERT INTO public.player_rating_events
  (player_id, event_type, rating_before, rating_after, rating_delta,
   source_type, source_id, occurred_at, metadata)
SELECT
  player_id,
  CASE result
    WHEN 'win'  THEN 'match_win'
    WHEN 'loss' THEN 'match_loss'
    ELSE 'match_' || result
  END,
  rating_pre,
  rating_post,
  rating_post - rating_pre,
  'match',
  match_id::text,
  COALESCE(match_date, rating_created_at),
  jsonb_build_object('formula', formula_name)
FROM ranked
WHERE rn = 1
ORDER BY match_date NULLS LAST, match_id, player_id;
