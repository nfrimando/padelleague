-- Manual strike adjustments. Strikes stay derived from backed-out queue matches
-- (ladder_matches / ladder_duo_matches with cancel_reason = 'backout'); this append-only table holds
-- the admin's ±1 corrections on top. Displayed strikes = backouts + SUM(delta), floored at 0.
-- Exactly one of player_id (solo ladder) / duo_id (duo ladder) is set.
CREATE TABLE public.ladder_strike_adjustments (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  cycle_id        bigint NOT NULL,
  player_id       bigint,
  duo_id          bigint,
  delta           smallint NOT NULL CHECK (delta = ANY (ARRAY[-1, 1]::smallint[])),
  reason          text NOT NULL,
  admin_user_id   uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ladder_strike_adjustments_pkey PRIMARY KEY (id),
  CONSTRAINT ladder_strike_adjustments_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES public.ladder_cycles(id),
  CONSTRAINT ladder_strike_adjustments_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(player_id),
  CONSTRAINT ladder_strike_adjustments_duo_id_fkey FOREIGN KEY (duo_id) REFERENCES public.ladder_duos(id),
  CONSTRAINT ladder_strike_adjustments_one_subject CHECK ((player_id IS NULL) <> (duo_id IS NULL))
);

CREATE INDEX idx_lsa_cycle_player ON public.ladder_strike_adjustments (cycle_id, player_id) WHERE player_id IS NOT NULL;
CREATE INDEX idx_lsa_cycle_duo    ON public.ladder_strike_adjustments (cycle_id, duo_id)    WHERE duo_id IS NOT NULL;

GRANT SELECT ON public.ladder_strike_adjustments TO anon, authenticated;

ALTER TABLE public.ladder_strike_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read ladder_strike_adjustments" ON public.ladder_strike_adjustments;
CREATE POLICY "Public read ladder_strike_adjustments"
  ON public.ladder_strike_adjustments FOR SELECT
  USING (true);
