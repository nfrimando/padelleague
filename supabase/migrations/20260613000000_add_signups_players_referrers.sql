CREATE TABLE public.signups_players_referrers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  signup_id uuid NOT NULL REFERENCES public.signups_players(id) ON DELETE CASCADE,
  referrer_player_id bigint NOT NULL REFERENCES public.players(player_id),
  initial_rating numeric CHECK (initial_rating IS NULL OR initial_rating >= 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT signups_players_referrers_pkey PRIMARY KEY (id),
  CONSTRAINT signups_players_referrers_unique UNIQUE (signup_id, referrer_player_id)
);
