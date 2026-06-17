-- Keep player_rating_events in sync with its sources automatically.
--
-- player_rating_events is the source of truth for a player's current/effective rating and
-- rating progression. Match outcomes (match_player_ratings) and initial ratings
-- (players.initial_rating) are mirrored into the ledger by the triggers below, so all current
-- AND future write paths stay consistent with zero application changes.
--
-- IMPORTANT: any future feature that changes a player's rating outside of these two sources
-- (recalibration, admin adjustment, bonus, penalty, ...) MUST insert its own player_rating_events
-- row with a descriptive event_type + metadata. See CLAUDE.md.

-- ─── 1. Partial unique indexes (one initial event per player; one match event per player+match) ──
-- Consistent with the existing backfilled rows (backfill already dedup'd to one row per pair).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pre_initial
  ON public.player_rating_events (player_id)
  WHERE event_type = 'initial_rating';

CREATE UNIQUE INDEX IF NOT EXISTS uniq_pre_match
  ON public.player_rating_events (player_id, source_id)
  WHERE source_type = 'match';

-- ─── 2. Match events: recompute the best-priority (v3 > v2 > other) ledger row for a pair ────────
CREATE OR REPLACE FUNCTION public.sync_pre_match_event(p_player_id BIGINT, p_match_id BIGINT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  best   RECORD;
  m_date TIMESTAMPTZ;
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

  SELECT date_local::timestamptz INTO m_date
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
     COALESCE(m_date, now()),
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

CREATE OR REPLACE FUNCTION public.trg_sync_match_player_ratings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    PERFORM public.sync_pre_match_event(OLD.player_id, OLD.match_id);
    RETURN OLD;
  END IF;

  PERFORM public.sync_pre_match_event(NEW.player_id, NEW.match_id);

  -- Handle the rare case where an UPDATE moved the row to a different player/match.
  IF (TG_OP = 'UPDATE')
     AND (OLD.player_id <> NEW.player_id OR OLD.match_id <> NEW.match_id) THEN
    PERFORM public.sync_pre_match_event(OLD.player_id, OLD.match_id);
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sync_match_player_ratings ON public.match_player_ratings;
CREATE TRIGGER sync_match_player_ratings
AFTER INSERT OR UPDATE OR DELETE ON public.match_player_ratings
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_match_player_ratings();

-- ─── 3. Initial rating events: mirror players.initial_rating ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_sync_initial_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.initial_rating IS NULL THEN
    DELETE FROM public.player_rating_events
     WHERE player_id = NEW.player_id AND event_type = 'initial_rating';
    RETURN NEW;
  END IF;

  -- occurred_at is NULL (genesis) so the initial rating always sorts before match events.
  INSERT INTO public.player_rating_events
    (player_id, event_type, rating_before, rating_after, rating_delta, occurred_at)
  VALUES
    (NEW.player_id, 'initial_rating', NULL, NEW.initial_rating, NULL, NULL)
  ON CONFLICT (player_id) WHERE event_type = 'initial_rating'
  DO UPDATE SET
     rating_after = EXCLUDED.rating_after,
     occurred_at  = EXCLUDED.occurred_at;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sync_initial_rating ON public.players;
CREATE TRIGGER sync_initial_rating
AFTER INSERT OR UPDATE OF initial_rating ON public.players
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_initial_rating();
