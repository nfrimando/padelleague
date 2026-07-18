-- ladder_matches: satellite table marking a `matches` row as counting toward the tier ladder.
-- Ladder matches are still real doubles matches (matches/match_teams/match_sets stay the source
-- of truth for what was played and are never modified) — the existence of a ladder_matches row
-- for a match_id is the answer to "does this match count toward the ladder". See .claude/ladder.md.

CREATE TABLE public.ladder_matches (
  id                    uuid NOT NULL DEFAULT gen_random_uuid(),
  match_id              bigint NOT NULL UNIQUE,
  cycle_id              bigint NOT NULL,
  match_kind            text NOT NULL CHECK (match_kind = ANY (ARRAY['own_tier'::text, 'challenge'::text])),
  challenger_player_id  bigint,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ladder_matches_pkey PRIMARY KEY (id),
  CONSTRAINT ladder_matches_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(match_id),
  CONSTRAINT ladder_matches_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES public.ladder_cycles(id),
  CONSTRAINT ladder_matches_challenger_player_id_fkey FOREIGN KEY (challenger_player_id) REFERENCES public.players(player_id),
  -- challenger_player_id is set iff match_kind='challenge'. (That the id is actually one of the
  -- 4 players seated in match_teams for this match is an app-layer invariant, not checkable here.)
  CONSTRAINT ladder_matches_challenger_consistent CHECK (
    (match_kind = 'own_tier' AND challenger_player_id IS NULL) OR
    (match_kind = 'challenge' AND challenger_player_id IS NOT NULL)
  )
);

CREATE INDEX idx_ladder_matches_cycle ON public.ladder_matches (cycle_id);
