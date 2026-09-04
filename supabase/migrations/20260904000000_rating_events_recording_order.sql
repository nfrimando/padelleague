-- Order the rating ledger by when a result was RECORDED, not by the match's calendar date.
--
-- Background: sync_pre_match_event stamped occurred_at = matches.date_local::timestamptz (midnight,
-- time_local discarded), while resolvePreMatchRatings computes rating_pre from the globally latest
-- ledger event at the moment of entry. A result played on the 26th but entered on the 31st therefore
-- carried a rating_before from the END of the timeline while being filed in the MIDDLE of it, so the
-- chain (rating_before = previous rating_after) broke and "current rating" — the latest event by
-- occurred_at — resolved to the wrong row. Discarding time_local additionally left same-day matches
-- ordered by nothing but admin entry order.
--
-- New rule: a match is anchored at matches.result_recorded_at — set once, the first time its ratings
-- are written, and never moved afterwards, so revising a match keeps its place in the timeline
-- instead of jumping to the end. Historical rows are anchored at their true play datetime
-- (date_local + time_local), which is the order their pre/post ratings were actually computed in.
--
-- NO RATING VALUE IS REWRITTEN HERE. Only ordering keys move, and every one of them is recomputable
-- from result_recorded_at / date_local / time_local.

BEGIN;

-- ─── 1. The anchor column ────────────────────────────────────────────────────────────────────────
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS result_recorded_at TIMESTAMPTZ;

COMMENT ON COLUMN public.matches.result_recorded_at IS
  'When this match''s result was first recorded. Anchors the match''s position in player_rating_events and ladder_standing_events. Set once by sync_pre_match_event(); a revision never moves it.';

-- ─── 2. Backfill the anchor ──────────────────────────────────────────────────────────────────────
-- Two eras, split by the transaction that backfilled player_rating_events (20260617000000):
--   * rows created in that backfill are imported history — their only ordering signal is the play
--     datetime, which is the order the importer computed their pre/post ratings in;
--   * rows created after it were written live by the admin routes, so their created_at IS the
--     moment the result was recorded.
-- The eras do not interleave: the latest backfilled play datetime is 2026-06-13, the earliest live
-- recording is 2026-06-24.
WITH first_event AS (
  SELECT
    e.source_id::BIGINT AS match_id,
    MIN(e.created_at)   AS recorded_at
  FROM public.player_rating_events e
  WHERE e.source_type = 'match'
    AND e.source_id ~ '^[0-9]+$'
  GROUP BY 1
)
UPDATE public.matches m
SET result_recorded_at =
      CASE
        WHEN fe.recorded_at >= TIMESTAMPTZ '2026-06-17 05:41:27+00'
          THEN fe.recorded_at
        ELSE COALESCE(
               (m.date_local + COALESCE(m.time_local, TIME '00:00'))::TIMESTAMPTZ,
               fe.recorded_at)
      END
FROM first_event fe
WHERE m.match_id = fe.match_id
  AND m.result_recorded_at IS NULL;

-- ─── 3. Re-stamp the ledgers from the anchor ─────────────────────────────────────────────────────
-- initial_rating rows keep occurred_at = NULL (genesis); see 20260617000004.
UPDATE public.player_rating_events e
SET occurred_at = m.result_recorded_at
FROM public.matches m
WHERE e.source_type = 'match'
  AND e.source_id = m.match_id::TEXT
  AND m.result_recorded_at IS NOT NULL
  AND e.occurred_at IS DISTINCT FROM m.result_recorded_at;

-- Ladder standings share the rating ledger's timeline (they were stamped from date_local too).
UPDATE public.ladder_standing_events e
SET occurred_at = m.result_recorded_at
FROM public.matches m
WHERE e.source_type = 'match'
  AND e.source_id = m.match_id::TEXT
  AND m.result_recorded_at IS NOT NULL
  AND e.occurred_at IS DISTINCT FROM m.result_recorded_at;

-- ─── 4. Teach the sync trigger the new anchor ────────────────────────────────────────────────────
-- Same body as 20260617000002 except for how occurred_at is derived.
CREATE OR REPLACE FUNCTION public.sync_pre_match_event(p_player_id BIGINT, p_match_id BIGINT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  best     RECORD;
  m_anchor TIMESTAMPTZ;
BEGIN
  SELECT rating_pre, rating_post, result, formula_name
    INTO best
  FROM public.match_player_ratings
  WHERE player_id = p_player_id AND match_id = p_match_id
  ORDER BY CASE lower(formula_name) WHEN 'v3' THEN 2 WHEN 'v2' THEN 1 ELSE 0 END DESC,
           created_at DESC
  LIMIT 1;

  -- No source rows left for this pair → remove the ledger match-event (covers match deletion).
  IF NOT FOUND THEN
    DELETE FROM public.player_rating_events
     WHERE player_id = p_player_id
       AND source_type = 'match'
       AND source_id = p_match_id::text;
    RETURN;
  END IF;

  -- Anchor the match the first time any of its ratings are written. Sticky on purpose: a revision
  -- deletes and re-inserts match_player_ratings, and must not move the match in the timeline.
  UPDATE public.matches
     SET result_recorded_at = clock_timestamp()
   WHERE match_id = p_match_id
     AND result_recorded_at IS NULL;

  SELECT COALESCE(
           result_recorded_at,
           (date_local + COALESCE(time_local, TIME '00:00'))::timestamptz)
    INTO m_anchor
  FROM public.matches
  WHERE match_id = p_match_id;

  INSERT INTO public.player_rating_events
    (player_id, event_type, rating_before, rating_after, rating_delta,
     source_type, source_id, occurred_at, metadata)
  VALUES
    (p_player_id,
     CASE best.result
       WHEN 'win'  THEN 'match_win'
       WHEN 'loss' THEN 'match_loss'
       ELSE 'match_' || best.result
     END,
     best.rating_pre,
     best.rating_post,
     best.rating_post - best.rating_pre,
     'match',
     p_match_id::text,
     COALESCE(m_anchor, clock_timestamp()),
     jsonb_build_object('formula', best.formula_name))
  ON CONFLICT (player_id, source_id) WHERE source_type = 'match'
  DO UPDATE SET
     event_type    = EXCLUDED.event_type,
     rating_before = EXCLUDED.rating_before,
     rating_after  = EXCLUDED.rating_after,
     rating_delta  = EXCLUDED.rating_delta,
     occurred_at   = EXCLUDED.occurred_at,
     metadata      = EXCLUDED.metadata;
END $$;

COMMIT;
