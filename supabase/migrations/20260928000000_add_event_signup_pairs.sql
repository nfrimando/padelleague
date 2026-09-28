-- Paired (doubles partner) event signups.
--
-- A pair row IS the invite: it exists from the moment the initiator picks a partner,
-- before the invitee has any signups_events row. signups_events.pair_id is stamped only
-- once the pair reaches 'accepted', so pair_id IS NOT NULL always means "confirmed partner".

CREATE TABLE public.event_signup_pairs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_id bigint NOT NULL REFERENCES public.events(event_id) ON DELETE CASCADE,
  initiator_player_id bigint NOT NULL REFERENCES public.players(player_id),
  invitee_player_id bigint NOT NULL REFERENCES public.players(player_id),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  invited_by_player_id bigint REFERENCES public.players(player_id), -- set when a host pairs two players
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_signup_pairs_pkey PRIMARY KEY (id),
  CONSTRAINT event_signup_pairs_distinct_players
    CHECK (initiator_player_id <> invitee_player_id)
);

-- One live pair per player per event, per seat. NOTE: these two partial indexes do NOT
-- prevent player X being initiator of one live pair and invitee of another; the API checks
-- both seats before inserting (see src/app/api/events/_lib/pairs.ts).
CREATE UNIQUE INDEX event_signup_pairs_one_live_initiator
  ON public.event_signup_pairs (event_id, initiator_player_id)
  WHERE status IN ('pending', 'accepted');
CREATE UNIQUE INDEX event_signup_pairs_one_live_invitee
  ON public.event_signup_pairs (event_id, invitee_player_id)
  WHERE status IN ('pending', 'accepted');
CREATE INDEX event_signup_pairs_event_status_idx
  ON public.event_signup_pairs (event_id, status);

ALTER TABLE public.signups_events
  ADD COLUMN pair_id uuid REFERENCES public.event_signup_pairs(id) ON DELETE SET NULL,
  ADD COLUMN looking_for_partner boolean NOT NULL DEFAULT false;

-- A confirmed pair and "looking for a partner" are mutually exclusive.
ALTER TABLE public.signups_events
  ADD CONSTRAINT signups_events_pair_xor_looking
  CHECK (pair_id IS NULL OR looking_for_partner = false);

CREATE INDEX signups_events_pair_id_idx ON public.signups_events (pair_id);
CREATE INDEX signups_events_event_player_idx ON public.signups_events (event_id, player_id);

-- Latent bug: the existing DEFAULT 'registered' violates this column's own CHECK
-- constraint. All code paths set status explicitly, so correcting it is zero-risk.
ALTER TABLE public.signups_events ALTER COLUMN status SET DEFAULT 'applied';

-- Paired mode is gated on a dedicated constrained column, NOT on the free-text event_type.
ALTER TABLE public.events
  ADD COLUMN signup_mode text NOT NULL DEFAULT 'individual'
    CHECK (signup_mode IN ('individual', 'paired'));
