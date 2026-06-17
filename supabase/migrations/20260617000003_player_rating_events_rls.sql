-- player_rating_events holds public, read-only rating data (like matches / match_player_ratings).
-- Reads come from the anon (public pages, server-rendered leaderboard) and authenticated (dashboard)
-- roles. Writes happen ONLY through the SECURITY DEFINER sync triggers and admin endpoints
-- (service_role), both of which bypass RLS — so a read-only policy is all that's needed.

GRANT SELECT ON public.player_rating_events TO anon, authenticated;

ALTER TABLE public.player_rating_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read player_rating_events" ON public.player_rating_events;
CREATE POLICY "Public read player_rating_events"
  ON public.player_rating_events
  FOR SELECT
  TO anon, authenticated
  USING (true);
