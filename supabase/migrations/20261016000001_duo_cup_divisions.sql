-- Official Duo Cup draw, verified against live player records on 2026-10-16.
-- Gio R = Malvin Angelo C. Reyes, confirmed by the organizer.
-- Never infer identity at migration time or create placeholder players.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.events WHERE event_id = 17 AND name = 'Padel League Duo Cup') THEN
    RAISE EXCEPTION 'Expected Duo Cup event 17; verify target database before applying draw';
  END IF;
END $$;
INSERT INTO public.event_division_teams (event_id, division, team_number, player_1_id, player_2_id) VALUES
    (17, 1, 1, 146, 38), -- Pancho de Miguel Jessel & Derrick Santos
    (17, 1, 2, 92, 344), -- Jonah Cano & Justin Suarez
    (17, 1, 3, 41, 129), -- Duane Santos & Mikael Jiang
    (17, 1, 4, 84, 357), -- JM Liong & Jan Amandoron
    (17, 1, 5, 13, 94), -- Amaury Brucker & Josh Kachmarik
    (17, 2, 6, 143, 132), -- Norifumi Kawakita & Mike Wood
    (17, 2, 7, 20, 107), -- Armand Del Rosario & Kyle Dandan
    (17, 2, 8, 149, 351), -- Pedro Roxas & Juan Thomas de Carranza
    (17, 2, 9, 95, 354), -- Juancho Palacios & Gio Manito
    (17, 2, 10, 117, 181), -- Mark Javier & Vinz Toribio
    (17, 3, 11, 166, 93), -- Sol Mercado & Josh Curtis
    (17, 3, 12, 133, 355), -- Misagh Bahadoran & Antoine Ortega
    (17, 3, 13, 171, 182), -- Tiger Bitanga & Wesley Hontiveros
    (17, 3, 14, 80, 58), -- Jerry Companjen & Geoffrey Guin
    (17, 3, 15, 111, 23), -- Luca Romualdez & Ben Romualdez
    (17, 4, 16, 161, 59), -- Robin Kwee & George Schulze
    (17, 4, 17, 104, 158), -- Kino Obach & Rave Macasaet
    (17, 4, 18, 2, 66), -- Alberto Solano & Hamit Keswani
    (17, 4, 19, 162, 68), -- Ron Austria & Hein Gasacao
    (17, 4, 20, 8, 165), -- Alexis Offe & Shogo Kimura
    (17, 5, 21, 47, 33), -- Ernie Lopez & Ricardo Cuerva
    (17, 5, 22, 50, 27), -- Erwin Terrel Sy & Butch Evangelista
    (17, 5, 23, 1, 44), -- Alan Wafer & Elliot Fowler
    (17, 5, 24, 170, 178), -- Terry Lee & Vic Bernardo
    (17, 5, 25, 361, 348), -- Rafael Narciso & Malvin Angelo C. Reyes
    (17, 6, 26, 337, 345), -- Colin Gin & Srikanth Sangili
    (17, 6, 27, 25, 85), -- BJ Valdez & JM Tayao
    (17, 6, 28, 339, 189), -- Coco Eje & Jopet Arrobio
    (17, 6, 29, 9, 334), -- Alfonso Ancheta & Carvin Singian
    (17, 6, 30, 352, 21), -- Miguel Mangabat & Austin Uy
    (17, 7, 31, 187, 333), -- Karlo Ledda & Jose Tolentino
    (17, 7, 32, 128, 12), -- Miggy Silva & Alvin Mesa
    (17, 7, 33, 336, 360), -- Matias Alvarez & Jack Abdalla
    (17, 7, 34, 188, 139), -- Joe Malaya & Nikko Albano
    (17, 7, 35, 359, 358); -- Perkin Chai & Klentz Chua

-- Reuse existing partner invitations where possible. Abort on a conflicting
-- partnership instead of silently changing another player's confirmed partner.
DO $$ DECLARE team record; pair_uuid uuid; member_id bigint; BEGIN
  FOR team IN SELECT * FROM public.event_division_teams WHERE event_id = 17 ORDER BY team_number LOOP
    IF EXISTS (
      SELECT 1 FROM public.event_signup_pairs p WHERE p.event_id = 17 AND p.status IN ('pending', 'accepted')
        AND (p.initiator_player_id IN (team.player_1_id, team.player_2_id) OR p.invitee_player_id IN (team.player_1_id, team.player_2_id))
        AND NOT (p.initiator_player_id IN (team.player_1_id, team.player_2_id) AND p.invitee_player_id IN (team.player_1_id, team.player_2_id))
    ) THEN RAISE EXCEPTION 'Conflicting partner for Duo Cup team %', team.team_number; END IF;
    SELECT p.id INTO pair_uuid FROM public.event_signup_pairs p WHERE p.event_id = 17
      AND p.status IN ('pending', 'accepted')
      AND p.initiator_player_id IN (team.player_1_id, team.player_2_id)
      AND p.invitee_player_id IN (team.player_1_id, team.player_2_id);
    IF pair_uuid IS NULL THEN
      INSERT INTO public.event_signup_pairs (event_id, initiator_player_id, invitee_player_id, status, responded_at)
        VALUES (17, team.player_1_id, team.player_2_id, 'accepted', now()) RETURNING id INTO pair_uuid;
    ELSE
      UPDATE public.event_signup_pairs SET status = 'accepted', responded_at = coalesce(responded_at, now()), updated_at = now() WHERE id = pair_uuid;
    END IF;
    FOREACH member_id IN ARRAY ARRAY[team.player_1_id, team.player_2_id] LOOP
      INSERT INTO public.signups_events (event_id, player_id, status, pair_id, looking_for_partner)
        VALUES (17, member_id, 'pending_payment', pair_uuid, false)
      ON CONFLICT (event_id, player_id) WHERE player_id IS NOT NULL DO UPDATE
        SET pair_id = EXCLUDED.pair_id, looking_for_partner = false, updated_at = now();
      UPDATE public.signups_events s SET status = CASE
        WHEN EXISTS (SELECT 1 FROM public.payments p WHERE p.signup_id = s.id AND p.event_id = 17 AND p.player_id = member_id AND p.status = 'paid')
        THEN 'accepted' ELSE 'pending_payment' END
      WHERE s.event_id = 17 AND s.player_id = member_id;
    END LOOP;
  END LOOP;
END $$;
UPDATE public.events SET player_limit = 70, payment_lock_enabled = true, signup_list_visible = true WHERE event_id = 17;
