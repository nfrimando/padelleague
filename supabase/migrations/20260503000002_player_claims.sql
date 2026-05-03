-- player_claims: tracks requests from authenticated users to claim an existing
-- player record that has no email yet (i.e. historical players loaded from CSV).
-- Admin approval links the email to the player and optionally verifies them.

CREATE TABLE public.player_claims (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  player_id bigint NOT NULL,
  claimed_by_email text NOT NULL,
  claimed_by_name text,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  reviewed_at timestamp with time zone,
  CONSTRAINT player_claims_pkey PRIMARY KEY (id),
  CONSTRAINT player_claims_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(player_id),
  -- One user can only submit one claim per player
  CONSTRAINT player_claims_player_email_unique UNIQUE (player_id, claimed_by_email)
);
