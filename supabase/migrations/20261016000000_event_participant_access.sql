-- New events use participant/payment access; keep existing archived seasons public.
ALTER TABLE public.events ADD COLUMN payment_lock_enabled boolean NOT NULL DEFAULT true;
UPDATE public.events SET payment_lock_enabled = false WHERE status = 'completed';

-- Private information never lives in the publicly readable events row.
CREATE TABLE public.event_private_details (
  event_id bigint PRIMARY KEY REFERENCES public.events(event_id) ON DELETE CASCADE,
  information text,
  event_url text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.event_division_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id bigint NOT NULL REFERENCES public.events(event_id) ON DELETE CASCADE,
  division integer NOT NULL CHECK (division > 0),
  team_number integer NOT NULL CHECK (team_number > 0),
  player_1_id bigint NOT NULL REFERENCES public.players(player_id),
  player_2_id bigint NOT NULL REFERENCES public.players(player_id),
  CHECK (player_1_id <> player_2_id),
  UNIQUE (event_id, team_number),
  UNIQUE (event_id, player_1_id),
  UNIQUE (event_id, player_2_id)
);
-- The per-seat indexes above also need a cross-seat duplicate check.
CREATE FUNCTION public.check_event_division_team_members() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(NEW.event_id);
  IF EXISTS (
    SELECT 1 FROM public.event_division_teams t
    WHERE t.event_id = NEW.event_id AND t.id <> NEW.id
      AND (t.player_1_id IN (NEW.player_1_id, NEW.player_2_id)
        OR t.player_2_id IN (NEW.player_1_id, NEW.player_2_id))
  ) THEN RAISE EXCEPTION 'A player can only belong to one division team per event'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER event_division_team_members BEFORE INSERT OR UPDATE ON public.event_division_teams
FOR EACH ROW EXECUTE FUNCTION public.check_event_division_team_members();

-- One access decision for the API and direct database reads. Never trust signup
-- status alone: hosts can accept players before payment and partners pay separately.
CREATE FUNCTION public.get_event_access(target_event_id bigint) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ev public.events%ROWTYPE;
  caller_player_id bigint;
  signup public.signups_events%ROWTYPE;
  manager boolean := false;
  registered boolean := false;
  paid boolean := false;
  inside boolean := false;
BEGIN
  SELECT * INTO ev FROM public.events WHERE event_id = target_event_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('found', false); END IF;
  SELECT CASE WHEN count(*) = 1 THEN min(player_id) END INTO caller_player_id FROM public.players
    WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid());
  manager := EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid() AND revoked_at IS NULL)
    OR coalesce(caller_player_id = ev.created_by_player_id, false);
  IF ev.visibility <> 'published' AND NOT manager THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  SELECT * INTO signup FROM public.signups_events
    WHERE event_id = target_event_id AND player_id = caller_player_id;
  registered := signup.id IS NOT NULL AND signup.status <> 'cancelled';
  paid := registered AND EXISTS (SELECT 1 FROM public.payments p
    WHERE p.signup_id = signup.id AND p.event_id = target_event_id
      AND p.player_id = caller_player_id AND p.status = 'paid');
  inside := manager OR NOT ev.payment_lock_enabled OR
    (registered AND signup.status <> 'waitlisted' AND (NOT ev.requires_payment OR paid));
  RETURN jsonb_build_object(
    'found', true, 'canManage', manager, 'registered', registered, 'paid', paid,
    'signupId', signup.id, 'signupStatus', signup.status,
    'paymentRequired', ev.payment_lock_enabled AND ev.requires_payment AND NOT paid,
    'canViewInside', inside
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_event_access(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_event_access(bigint) TO anon, authenticated, service_role;

CREATE FUNCTION public.can_view_event_inside(target_event_id bigint) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((
    SELECT CASE WHEN e.visibility = 'published' AND NOT e.payment_lock_enabled THEN true
      ELSE coalesce((public.get_event_access(target_event_id)->>'canViewInside')::boolean, false) END
    FROM public.events e WHERE e.event_id = target_event_id AND e.deleted_at IS NULL
  ), false);
$$;
REVOKE ALL ON FUNCTION public.can_view_event_inside(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_event_inside(bigint) TO anon, authenticated, service_role;

ALTER TABLE public.event_private_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_division_teams ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.event_private_details, public.event_division_teams TO anon, authenticated;
GRANT ALL ON public.event_private_details, public.event_division_teams TO service_role;
CREATE POLICY event_private_details_read ON public.event_private_details FOR SELECT
  USING (public.can_view_event_inside(event_id));
CREATE POLICY event_division_teams_read ON public.event_division_teams FOR SELECT
  USING (public.can_view_event_inside(event_id));

-- Move inside notes and destination links off the public row for active events.
INSERT INTO public.event_private_details (event_id, information, event_url)
SELECT event_id, notes, coalesce(event_url, url_link) FROM public.events
WHERE payment_lock_enabled AND (notes IS NOT NULL OR event_url IS NOT NULL OR url_link IS NOT NULL);
UPDATE public.events SET notes = NULL, event_url = NULL, url_link = NULL WHERE payment_lock_enabled;

-- Keep future writes through legacy event editors private as well.
CREATE FUNCTION public.store_private_event_details() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.payment_lock_enabled AND (NEW.notes IS NOT NULL OR NEW.event_url IS NOT NULL OR NEW.url_link IS NOT NULL) THEN
    INSERT INTO public.event_private_details (event_id, information, event_url)
      VALUES (NEW.event_id, NEW.notes, coalesce(NEW.event_url, NEW.url_link))
    ON CONFLICT (event_id) DO UPDATE SET
      information = coalesce(EXCLUDED.information, event_private_details.information),
      event_url = coalesce(EXCLUDED.event_url, event_private_details.event_url), updated_at = now();
    UPDATE public.events SET notes = NULL, event_url = NULL, url_link = NULL WHERE event_id = NEW.event_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER store_private_event_details AFTER INSERT OR UPDATE ON public.events
FOR EACH ROW EXECUTE FUNCTION public.store_private_event_details();

-- Restrictive policies AND with existing read policies, so broad public policies
-- cannot bypass the gate through /matches, player pages or the Supabase REST API.
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY event_inside_matches ON public.matches AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (event_id IS NULL OR public.can_view_event_inside(event_id));
DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['match_teams', 'match_sets', 'match_player_ratings', 'predictions'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY event_inside_match_data ON public.%I AS RESTRICTIVE FOR SELECT TO anon, authenticated USING (EXISTS (SELECT 1 FROM public.matches m WHERE m.match_id = %I.match_id))', table_name, table_name);
  END LOOP;
END $$;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY event_inside_teams ON public.teams AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (public.can_view_event_inside(event_id));

ALTER TABLE public.prediction_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY event_inside_prediction_results ON public.prediction_results AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.predictions p WHERE p.id = prediction_results.user_pick_id));

-- Roster APIs return names only. Raw registration rows also contain pair IDs,
-- so non-paying viewers can read only their own signup / partner invitation.
CREATE FUNCTION public.can_view_event_signup(target_event_id bigint, target_player_id bigint) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_view_event_inside(target_event_id) OR EXISTS (
    SELECT 1 FROM public.players p JOIN auth.users u ON u.email = p.email
    WHERE u.id = auth.uid() AND p.player_id = target_player_id
  );
$$;
REVOKE ALL ON FUNCTION public.can_view_event_signup(bigint, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_event_signup(bigint, bigint) TO anon, authenticated, service_role;
ALTER TABLE public.signups_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY event_signup_private_pairs ON public.signups_events AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (public.can_view_event_signup(event_id, player_id));
ALTER TABLE public.event_signup_pairs ENABLE ROW LEVEL SECURITY;
CREATE POLICY event_signup_private_pairs ON public.event_signup_pairs AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (public.can_view_event_signup(event_id, initiator_player_id) OR public.can_view_event_signup(event_id, invitee_player_id));

-- Payment confirmation is written only by server-side admin/webhook handlers.
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY event_payment_server_insert ON public.payments AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY event_payment_server_update ON public.payments AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY event_payment_server_delete ON public.payments AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);

-- Event access flags and public/private content routing are server-managed too.
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY event_server_insert ON public.events AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY event_server_update ON public.events AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY event_server_delete ON public.events AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);

-- Rating progression stays public, but the ledger must not reveal a locked
-- match's ID or metadata (which could be joined across players into a matchup).
CREATE FUNCTION public.can_view_rating_event_source(kind text, source text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT kind IS DISTINCT FROM 'match' OR EXISTS (
    SELECT 1 FROM public.matches m WHERE m.match_id::text = source
      AND (m.event_id IS NULL OR public.can_view_event_inside(m.event_id))
  );
$$;
REVOKE ALL ON FUNCTION public.can_view_rating_event_source(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_rating_event_source(text, text) TO anon, authenticated, service_role;
ALTER TABLE public.player_rating_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY event_inside_rating_source ON public.player_rating_events AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (public.can_view_rating_event_source(source_type, source_id));

-- Owner-executed, read-only security-barrier projection. The CASE expressions
-- explicitly enforce source privacy while keeping every rating in the ledger.
-- Public consumers read this projection; rating writers keep using the base table.
CREATE VIEW public.player_rating_events_public WITH (security_barrier = true) AS
SELECT id, player_id, event_type, rating_before, rating_after, rating_delta, source_type,
  CASE WHEN public.can_view_rating_event_source(source_type, source_id) THEN source_id ELSE NULL END AS source_id,
  occurred_at,
  CASE WHEN public.can_view_rating_event_source(source_type, source_id) THEN metadata ELSE NULL END AS metadata,
  created_at
FROM public.player_rating_events;
REVOKE ALL ON public.player_rating_events_public FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.player_rating_events_public TO anon, authenticated, service_role;
