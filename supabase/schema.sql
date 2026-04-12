-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.admin_users (
  user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  email text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT admin_users_pkey PRIMARY KEY (user_id),
  CONSTRAINT admin_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.match_player_ratings (
  rating_id uuid NOT NULL DEFAULT gen_random_uuid(),
  player_id bigint NOT NULL,
  match_id bigint NOT NULL,
  rating_pre numeric NOT NULL,
  rating_post numeric NOT NULL,
  result text NOT NULL CHECK (result = ANY (ARRAY['win'::text, 'loss'::text])),
  formula_name text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT match_player_ratings_pkey PRIMARY KEY (rating_id),
  CONSTRAINT fk_player FOREIGN KEY (player_id) REFERENCES public.players(player_id),
  CONSTRAINT fk_match FOREIGN KEY (match_id) REFERENCES public.matches(match_id)
);
CREATE TABLE public.match_sets (
  set_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  match_id bigint NOT NULL,
  set_number smallint NOT NULL,
  team_1_games smallint NOT NULL,
  team_2_games smallint NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT match_sets_pkey PRIMARY KEY (set_id),
  CONSTRAINT match_sets_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(match_id)
);
CREATE TABLE public.match_teams (
  uuid uuid NOT NULL DEFAULT gen_random_uuid(),
  match_id bigint NOT NULL,
  player_1_id bigint,
  player_2_id bigint,
  team_number smallint,
  sets_won smallint,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT match_teams_pkey PRIMARY KEY (uuid),
  CONSTRAINT match_teams_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(match_id),
  CONSTRAINT match_teams_player_1_id_fkey FOREIGN KEY (player_1_id) REFERENCES public.players(player_id),
  CONSTRAINT match_teams_player_2_id_fkey FOREIGN KEY (player_2_id) REFERENCES public.players(player_id)
);
CREATE TABLE public.matches (
  match_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  date_local date,
  time_local time without time zone,
  venue text,
  type text NOT NULL CHECK (type = ANY (ARRAY['kotc'::text, 'group'::text, 'finals'::text, 'duel'::text, 'semis'::text])),
  winner_team smallint CHECK (winner_team = ANY (ARRAY[1, 2])),
  season_id bigint,
  status text NOT NULL CHECK (status = ANY (ARRAY['scheduled'::text, 'completed'::text, 'forfeit'::text, 'cancelled'::text])),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT matches_pkey PRIMARY KEY (match_id)
);
CREATE TABLE public.players (
  player_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  name text UNIQUE,
  nickname text UNIQUE,
  image_link text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  initial_rating numeric CHECK (initial_rating IS NULL OR initial_rating >= 0::numeric),
  CONSTRAINT players_pkey PRIMARY KEY (player_id)
);
CREATE TABLE public.teams (
  team_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  season_id bigint NOT NULL,
  team_name text NOT NULL,
  icon text,
  captain_player_id bigint,
  co_captain_player_id bigint,
  final_rank integer,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT teams_pkey PRIMARY KEY (team_id),
  CONSTRAINT teams_captain_player_id_fkey FOREIGN KEY (captain_player_id) REFERENCES public.players(player_id),
  CONSTRAINT teams_co_captain_player_id_fkey FOREIGN KEY (co_captain_player_id) REFERENCES public.players(player_id)
);