-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.players (
  player_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  name text UNIQUE,
  nickname text,
  image_link text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  initial_rating numeric CHECK (initial_rating IS NULL OR initial_rating >= 0::numeric),
  email text,
  is_profile_complete boolean NOT NULL DEFAULT false,
  phone_country_code character varying,
  phone_number character varying,
  country character varying,
  is_public boolean NOT NULL DEFAULT false,
  is_notifications_subscribed boolean NOT NULL DEFAULT false,
  preferred_side text CHECK (preferred_side IS NULL OR (preferred_side = ANY (ARRAY['left'::text, 'right'::text, 'both'::text]))),
  shirt_size character varying,
  ig_handle text,
  is_duel_roulette_opt_in boolean NOT NULL DEFAULT false,
  is_ladder_opt_in boolean NOT NULL DEFAULT false,
  CONSTRAINT players_pkey PRIMARY KEY (player_id)
);
CREATE TABLE public.matches (
  match_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  date_local date,
  time_local time without time zone,
  venue text,
  type text NOT NULL CHECK (type = ANY (ARRAY['kotc'::text, 'group'::text, 'finals'::text, 'duel'::text, 'semis'::text])),
  winner_team smallint CHECK (winner_team = ANY (ARRAY[1, 2])),
  event_id bigint,
  status text NOT NULL CHECK (status = ANY (ARRAY['scheduled'::text, 'completed'::text, 'forfeit'::text, 'cancelled'::text])),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  reminder_sent_at timestamp without time zone,
  youtube_link text,
  CONSTRAINT matches_pkey PRIMARY KEY (match_id)
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
CREATE TABLE public.teams (
  team_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  event_id bigint NOT NULL,
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
CREATE TABLE public.admin_users (
  user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  email text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  revoked_at timestamp with time zone,
  CONSTRAINT admin_users_pkey PRIMARY KEY (user_id),
  CONSTRAINT admin_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.webhook_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  processed_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT webhook_events_pkey PRIMARY KEY (id)
);
CREATE TABLE public.events (
  event_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  name text,
  event_type text NOT NULL DEFAULT 'league_season'::text,
  registration_fee numeric NOT NULL DEFAULT 1000,
  registration_status text NOT NULL DEFAULT 'open'::text CHECK (registration_status = ANY (ARRAY['open'::text, 'closed'::text])),
  status text NOT NULL DEFAULT 'upcoming'::text CHECK (status = ANY (ARRAY['upcoming'::text, 'ongoing'::text, 'completed'::text])),
  start_date date,
  end_date date,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  requires_payment boolean NOT NULL DEFAULT true,
  image_url text,
  description text,
  payment_instructions text,
  url_link text,
  restrictions jsonb,
  event_url text,
  visibility text NOT NULL DEFAULT 'published'::text CHECK (visibility = ANY (ARRAY['draft'::text, 'published'::text])),
  created_by_player_id bigint,
  signup_deadline date,
  player_limit integer,
  format text,
  notes text,
  signup_list_visible boolean NOT NULL DEFAULT true,
  is_rated boolean NOT NULL DEFAULT true,
  rating_details text,
  CONSTRAINT events_pkey PRIMARY KEY (event_id),
  CONSTRAINT events_created_by_player_id_fkey FOREIGN KEY (created_by_player_id) REFERENCES public.players(player_id)
);
CREATE TABLE public.player_claims (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  player_id bigint NOT NULL,
  claimed_by_email text NOT NULL,
  claimed_by_name text,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  reviewed_at timestamp with time zone,
  notes text,
  CONSTRAINT player_claims_pkey PRIMARY KEY (id),
  CONSTRAINT player_claims_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(player_id)
);
CREATE TABLE public.signups_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  player_id bigint,
  event_id bigint NOT NULL,
  status text NOT NULL DEFAULT 'registered'::text CHECK (status = ANY (ARRAY['applied'::text, 'pending_payment'::text, 'accepted'::text, 'waitlisted'::text, 'cancelled'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  applicant_name text,
  applicant_contact text,
  applicant_email text,
  CONSTRAINT signups_events_pkey PRIMARY KEY (id),
  CONSTRAINT signups_events_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(event_id),
  CONSTRAINT signups_events_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(player_id)
);
CREATE TABLE public.signups_players (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  player_id bigint,
  status text NOT NULL DEFAULT 'registered'::text CHECK (status = ANY (ARRAY['registered'::text, 'accepted'::text, 'waitlisted'::text, 'cancelled'::text])),
  applicant_name text,
  applicant_nickname text,
  applicant_contact text,
  applicant_email text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  notes text,
  referrer_id bigint,
  applicant_image_url text,
  CONSTRAINT signups_players_pkey PRIMARY KEY (id),
  CONSTRAINT signups_players_referrer_id_fkey FOREIGN KEY (referrer_id) REFERENCES public.players(player_id),
  CONSTRAINT signups_players_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(player_id)
);
CREATE TABLE public.payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  signup_id uuid NOT NULL,
  player_id bigint,
  event_id bigint NOT NULL,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'PHP'::text,
  method text NOT NULL CHECK (method = ANY (ARRAY['paymongo'::text, 'cash'::text, 'bank_transfer'::text, 'gcash'::text, 'other'::text])),
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'paid'::text, 'failed'::text, 'refunded'::text])),
  reference_number text,
  notes text,
  paid_at timestamp with time zone,
  recorded_by text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT payments_pkey PRIMARY KEY (id),
  CONSTRAINT payments_signup_id_fkey FOREIGN KEY (signup_id) REFERENCES public.signups_events(id),
  CONSTRAINT payments_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(player_id),
  CONSTRAINT payments_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(event_id)
);
CREATE TABLE public.payments_paymongo (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL,
  link_id text,
  link_url text,
  paymongo_payment_id text,
  webhook_data jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT payments_paymongo_pkey PRIMARY KEY (id),
  CONSTRAINT payments_paymongo_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id)
);
CREATE TABLE public.predictions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text NOT NULL,
  player_id bigint,
  match_id bigint,
  type text NOT NULL DEFAULT 'winning_team'::text,
  prediction smallint NOT NULL CHECK (prediction = ANY (ARRAY[1, 2])),
  pick_probability numeric NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  voided_at timestamp with time zone,
  void_reason text NOT NULL DEFAULT ''::text,
  CONSTRAINT predictions_pkey PRIMARY KEY (id),
  CONSTRAINT predictions_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(match_id),
  CONSTRAINT predictions_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(player_id)
);
CREATE TABLE public.prediction_results (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_pick_id uuid NOT NULL,
  reward_system_version text NOT NULL,
  prediction_model_version text NOT NULL,
  was_correct boolean NOT NULL,
  points_awarded numeric NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT prediction_results_pkey PRIMARY KEY (id),
  CONSTRAINT prediction_results_user_pick_id_fkey FOREIGN KEY (user_pick_id) REFERENCES public.predictions(id)
);
CREATE TABLE public.player_notification_preferences (
  player_id bigint NOT NULL,
  notif_type text NOT NULL,
  subscribed boolean NOT NULL DEFAULT true,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT player_notification_preferences_pkey PRIMARY KEY (player_id, notif_type),
  CONSTRAINT player_notification_preferences_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(player_id)
);
CREATE TABLE public.player_schedule_preferences (
  player_id bigint NOT NULL,
  day_of_week smallint NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_hour smallint NOT NULL CHECK (start_hour >= 0 AND start_hour <= 23),
  CONSTRAINT player_schedule_preferences_pkey PRIMARY KEY (player_id, day_of_week, start_hour),
  CONSTRAINT player_schedule_preferences_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(player_id)
);
CREATE TABLE public.signups_players_referrers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  signup_id uuid NOT NULL,
  referrer_player_id bigint NOT NULL,
  initial_rating numeric CHECK (initial_rating IS NULL OR initial_rating >= 0::numeric),
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_named_referrer boolean NOT NULL DEFAULT false,
  submitted_by_player_id bigint,
  survey_answers jsonb,
  CONSTRAINT signups_players_referrers_pkey PRIMARY KEY (id),
  CONSTRAINT signups_players_referrers_signup_id_fkey FOREIGN KEY (signup_id) REFERENCES public.signups_players(id),
  CONSTRAINT signups_players_referrers_referrer_player_id_fkey FOREIGN KEY (referrer_player_id) REFERENCES public.players(player_id),
  CONSTRAINT signups_players_referrers_submitted_by_player_id_fkey FOREIGN KEY (submitted_by_player_id) REFERENCES public.players(player_id)
);
CREATE TABLE public.player_rating_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  player_id bigint NOT NULL,
  event_type text NOT NULL,
  rating_before numeric,
  rating_after numeric NOT NULL,
  rating_delta numeric,
  source_type text,
  source_id text,
  occurred_at timestamp with time zone,
  metadata jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT player_rating_events_pkey PRIMARY KEY (id),
  CONSTRAINT player_rating_events_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(player_id)
);
CREATE TABLE public.recalibration_requests (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  player_id bigint NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'resolved'::text, 'cancelled'::text])),
  outcome text CHECK (outcome = ANY (ARRAY['retained'::text, 'updated'::text])),
  rating_at_request numeric NOT NULL,
  requestor_notes text,
  computed_average numeric,
  resolved_rating numeric,
  admin_notes text,
  requested_at timestamp with time zone NOT NULL DEFAULT now(),
  resolved_at timestamp with time zone,
  resolved_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT recalibration_requests_pkey PRIMARY KEY (id),
  CONSTRAINT recalibration_requests_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(player_id),
  CONSTRAINT recalibration_requests_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES auth.users(id)
);
CREATE TABLE public.recalibration_respondents (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  recalibration_id bigint NOT NULL,
  player_id bigint NOT NULL,
  rating numeric CHECK (rating IS NULL OR rating >= 0::numeric),
  notes text,
  added_by uuid,
  submitted_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  survey_answers jsonb,
  CONSTRAINT recalibration_respondents_pkey PRIMARY KEY (id),
  CONSTRAINT recalibration_respondents_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(player_id),
  CONSTRAINT recalibration_respondents_added_by_fkey FOREIGN KEY (added_by) REFERENCES auth.users(id),
  CONSTRAINT recalibration_respondents_recalibration_id_fkey FOREIGN KEY (recalibration_id) REFERENCES public.recalibration_requests(id)
);
CREATE TABLE public.ladder_tiers (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  name text NOT NULL UNIQUE,
  rank integer NOT NULL UNIQUE CHECK (rank > 0),
  elo_floor numeric NOT NULL DEFAULT 0 CHECK (elo_floor >= 0::numeric),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ladder_tiers_pkey PRIMARY KEY (id)
);
CREATE TABLE public.ladder_cycles (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  label text NOT NULL,
  status text NOT NULL DEFAULT 'upcoming'::text CHECK (status = ANY (ARRAY['upcoming'::text, 'active'::text, 'completed'::text])),
  starts_at timestamp with time zone,
  ends_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ladder_cycles_pkey PRIMARY KEY (id)
);
CREATE TABLE public.ladder_matches (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  match_id bigint NOT NULL UNIQUE,
  cycle_id bigint NOT NULL,
  match_kind text NOT NULL CHECK (match_kind = ANY (ARRAY['own_tier'::text, 'challenge'::text])),
  challenger_player_id bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ladder_matches_pkey PRIMARY KEY (id),
  CONSTRAINT ladder_matches_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(match_id),
  CONSTRAINT ladder_matches_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES public.ladder_cycles(id),
  CONSTRAINT ladder_matches_challenger_player_id_fkey FOREIGN KEY (challenger_player_id) REFERENCES public.players(player_id)
);
CREATE TABLE public.ladder_standing_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cycle_id bigint NOT NULL,
  player_id bigint NOT NULL,
  event_type text NOT NULL,
  tier_before_id bigint,
  tier_after_id bigint NOT NULL,
  stars_before smallint CHECK (stars_before IS NULL OR stars_before >= 0 AND stars_before <= 2),
  stars_after smallint NOT NULL CHECK (stars_after >= 0 AND stars_after <= 2),
  cushion_available boolean NOT NULL DEFAULT false,
  source_type text,
  source_id text,
  occurred_at timestamp with time zone,
  metadata jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ladder_standing_events_pkey PRIMARY KEY (id),
  CONSTRAINT ladder_standing_events_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES public.ladder_cycles(id),
  CONSTRAINT ladder_standing_events_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(player_id),
  CONSTRAINT ladder_standing_events_tier_before_id_fkey FOREIGN KEY (tier_before_id) REFERENCES public.ladder_tiers(id),
  CONSTRAINT ladder_standing_events_tier_after_id_fkey FOREIGN KEY (tier_after_id) REFERENCES public.ladder_tiers(id)
);