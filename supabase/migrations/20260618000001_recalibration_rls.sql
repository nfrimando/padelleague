-- recalibration_requests / recalibration_respondents hold sensitive peer-assessment
-- data. Unlike player_rating_events, do NOT grant broad anon/authenticated SELECT —
-- all reads/writes happen through API routes using service-role clients
-- (getAuthorizedAdminClient / getAuthorizedPlayer), which bypass RLS.

ALTER TABLE public.recalibration_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recalibration_respondents ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.recalibration_requests FROM anon, authenticated;
REVOKE ALL ON public.recalibration_respondents FROM anon, authenticated;
