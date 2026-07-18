-- Ladder tables hold public, read-only data (like matches / player_rating_events). Reads come
-- from the anon (public ladder page) and authenticated (dashboard) roles. There is no write
-- path yet (match logging is future work) — a read-only policy is all that's needed today.
-- matches itself is untouched by the ladder feature and keeps its existing RLS policies.

GRANT SELECT ON public.ladder_tiers TO anon, authenticated;
GRANT SELECT ON public.ladder_cycles TO anon, authenticated;
GRANT SELECT ON public.ladder_matches TO anon, authenticated;
GRANT SELECT ON public.ladder_standing_events TO anon, authenticated;

ALTER TABLE public.ladder_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ladder_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ladder_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ladder_standing_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read ladder_tiers" ON public.ladder_tiers;
CREATE POLICY "Public read ladder_tiers"
  ON public.ladder_tiers
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Public read ladder_cycles" ON public.ladder_cycles;
CREATE POLICY "Public read ladder_cycles"
  ON public.ladder_cycles
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Public read ladder_matches" ON public.ladder_matches;
CREATE POLICY "Public read ladder_matches"
  ON public.ladder_matches
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Public read ladder_standing_events" ON public.ladder_standing_events;
CREATE POLICY "Public read ladder_standing_events"
  ON public.ladder_standing_events
  FOR SELECT
  TO anon, authenticated
  USING (true);
