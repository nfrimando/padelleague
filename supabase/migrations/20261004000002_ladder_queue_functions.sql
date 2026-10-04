-- Atomic write paths for the ladder queue. supabase-js can't hold a transaction across calls, and
-- both of these must be all-or-nothing:
--   * creating a match from 4 waiting tickets (two simultaneous joins must never double-book a
--     player or leave an orphaned match), and
--   * cancelling a queue match + requeueing the players who weren't at fault.
-- The team split itself (partner-repeat avoidance, rating balance) stays in TypeScript
-- (src/lib/ladder/ladderQueue.ts reuses buildRouletteGroups) and is passed in.
--
-- Service-role only: execute is revoked from PUBLIC/anon/authenticated below.

-- Creates an `assigned` ladder match from exactly 4 waiting tickets. Returns the new match_id, or
-- NULL when the tickets are stale (someone left or was matched by a concurrent call) so the caller
-- re-reads the queue and retries. Row locks taken in id order serialize concurrent callers without
-- deadlocking.
CREATE OR REPLACE FUNCTION public.ladder_queue_create_match(
  p_cycle_id  bigint,
  p_tier_id   bigint,
  p_entry_ids uuid[],
  p_team1     bigint[],
  p_team2     bigint[],
  p_play_by   timestamptz
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_players bigint[];
  v_team_players  bigint[];
  v_match_id      bigint;
BEGIN
  IF coalesce(array_length(p_entry_ids, 1), 0) <> 4
     OR coalesce(array_length(p_team1, 1), 0) <> 2
     OR coalesce(array_length(p_team2, 1), 0) <> 2 THEN
    RAISE EXCEPTION 'ladder_queue_create_match needs 4 entries and two 2-player teams';
  END IF;

  PERFORM 1
  FROM ladder_queue_entries
  WHERE id = ANY (p_entry_ids)
  ORDER BY id
  FOR UPDATE;

  SELECT array_agg(player_id ORDER BY player_id)
  INTO v_entry_players
  FROM ladder_queue_entries
  WHERE id = ANY (p_entry_ids)
    AND status = 'waiting'
    AND cycle_id = p_cycle_id
    AND tier_id = p_tier_id;

  IF coalesce(array_length(v_entry_players, 1), 0) <> 4 THEN
    RETURN NULL; -- stale
  END IF;

  SELECT array_agg(x ORDER BY x) INTO v_team_players FROM unnest(p_team1 || p_team2) AS x;
  IF v_team_players IS DISTINCT FROM v_entry_players THEN
    RAISE EXCEPTION 'teams do not match the queued players';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM ladder_cycles WHERE id = p_cycle_id AND status = 'active') THEN
    RETURN NULL;
  END IF;

  -- Same shape confirmLadderRouletteProposal writes: an undated 'duel' sitting at 'assigned'.
  INSERT INTO matches (event_id, date_local, time_local, venue, type, status, winner_team)
  VALUES (NULL, NULL, NULL, NULL, 'duel', 'assigned', NULL)
  RETURNING match_id INTO v_match_id;

  INSERT INTO match_teams (match_id, team_number, player_1_id, player_2_id, sets_won)
  VALUES
    (v_match_id, 1, p_team1[1], p_team1[2], NULL),
    (v_match_id, 2, p_team2[1], p_team2[2], NULL);

  INSERT INTO ladder_matches (match_id, cycle_id, match_kind, source, play_by_at)
  VALUES (v_match_id, p_cycle_id, 'own_tier', 'queue', p_play_by);

  UPDATE ladder_queue_entries
  SET status = 'matched',
      match_id = v_match_id,
      matched_at = now(),
      updated_at = now()
  WHERE id = ANY (p_entry_ids);

  RETURN v_match_id;
END;
$$;

-- Cancels an open queue match. For 'backout' and 'admin_cancelled' it requeues everyone except the
-- player who backed out (if any), copying each player's previous queued_at so they keep their place.
-- 'deadline_expired' (admin-triggered from the Queue tab) requeues NOBODY: all 4 rejoin by hand, and
-- the admin docks stars for whoever was at fault. Requeued tickets land in the
-- player's CURRENT tier (latest ladder_standing_events row), falling back to the old ticket's tier.
-- Nobody is requeued once the cycle is no longer active. (The queue is independent of
-- players.is_ladder_opt_in, which remains the roulette-draw flag.)
--
-- Idempotent: calling it on an already-cancelled queue match returns no rows. Returns the
-- (player, tier) pairs that were requeued so the caller can run matchmaking and send emails.
--
-- p_reason: 'backout' (p_by_player_id required, must be seated) | 'deadline_expired' (no requeue) |
-- 'admin_cancelled' (the admin route may already have set matches.status='cancelled').
CREATE OR REPLACE FUNCTION public.ladder_queue_cancel_match(
  p_match_id     bigint,
  p_reason       text,
  p_by_player_id bigint DEFAULT NULL
) RETURNS TABLE (requeued_player_id bigint, requeued_tier_id bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source         text;
  v_cancelled_at   timestamptz;
  v_status         text;
  v_requeue_reason text;
BEGIN
  IF p_reason NOT IN ('backout', 'deadline_expired', 'admin_cancelled') THEN
    RAISE EXCEPTION 'invalid cancel reason: %', p_reason;
  END IF;
  IF (p_reason = 'backout') <> (p_by_player_id IS NOT NULL) THEN
    RAISE EXCEPTION 'a backout needs the player who backed out, and only a backout has one';
  END IF;

  SELECT lm.source, lm.cancelled_at
  INTO v_source, v_cancelled_at
  FROM ladder_matches lm
  WHERE lm.match_id = p_match_id
  FOR UPDATE;

  IF NOT FOUND OR v_source <> 'queue' THEN
    RAISE EXCEPTION 'match % is not a queue ladder match', p_match_id;
  END IF;
  IF v_cancelled_at IS NOT NULL THEN
    RETURN; -- already cancelled
  END IF;

  SELECT m.status INTO v_status FROM matches m WHERE m.match_id = p_match_id FOR UPDATE;
  IF v_status NOT IN ('assigned', 'scheduled', 'cancelled') THEN
    RAISE EXCEPTION 'match % is % and can no longer be cancelled', p_match_id, v_status;
  END IF;

  IF p_by_player_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM ladder_queue_entries e
    WHERE e.match_id = p_match_id AND e.player_id = p_by_player_id
  ) THEN
    RAISE EXCEPTION 'player % is not in match %', p_by_player_id, p_match_id;
  END IF;

  UPDATE matches SET status = 'cancelled' WHERE match_id = p_match_id;

  UPDATE ladder_matches
  SET cancel_reason = p_reason,
      cancelled_at = now(),
      cancelled_by_player_id = p_by_player_id,
      updated_at = now()
  WHERE match_id = p_match_id;

  IF p_reason = 'deadline_expired' THEN
    RETURN; -- nobody is requeued
  END IF;

  v_requeue_reason := CASE p_reason
    WHEN 'backout' THEN 'partner_backout'
    ELSE p_reason
  END;

  RETURN QUERY
  INSERT INTO ladder_queue_entries AS q
    (cycle_id, tier_id, player_id, status, queued_at, requeued_from_entry_id, requeue_reason)
  SELECT
    e.cycle_id,
    coalesce(
      (SELECT s.tier_after_id
       FROM ladder_standing_events s
       WHERE s.cycle_id = e.cycle_id AND s.player_id = e.player_id
       ORDER BY s.occurred_at DESC NULLS LAST, s.created_at DESC
       LIMIT 1),
      e.tier_id
    ),
    e.player_id,
    'waiting',
    e.queued_at,
    e.id,
    v_requeue_reason
  FROM ladder_queue_entries e
  JOIN ladder_cycles c ON c.id = e.cycle_id
  WHERE e.match_id = p_match_id
    AND e.status = 'matched'
    AND e.player_id IS DISTINCT FROM p_by_player_id
    AND c.status = 'active'
  ON CONFLICT (player_id) WHERE status = 'waiting' DO NOTHING
  RETURNING q.player_id, q.tier_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ladder_queue_create_match(bigint, bigint, uuid[], bigint[], bigint[], timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ladder_queue_cancel_match(bigint, text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ladder_queue_create_match(bigint, bigint, uuid[], bigint[], bigint[], timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.ladder_queue_cancel_match(bigint, text, bigint) TO service_role;
