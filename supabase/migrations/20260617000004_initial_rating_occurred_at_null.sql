-- The initial_rating event is the genesis of a player's rating — it must always sort before every
-- match event. It was previously stamped with players.created_at, but that is unreliable: imported /
-- historical players were inserted into the DB long AFTER their matches were played, so created_at
-- sorts the starting rating into the middle (or end) of the progression, and can even be picked as
-- the "latest" rating. Use NULL instead: hooks order occurred_at ASC NULLS FIRST (genesis first) and
-- DESC NULLS LAST (so initial never beats a real match when resolving the current rating).

-- 1. Fix existing rows.
UPDATE public.player_rating_events
SET occurred_at = NULL
WHERE event_type = 'initial_rating';

-- 2. Stop the trigger from stamping created_at on initial_rating events.
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
