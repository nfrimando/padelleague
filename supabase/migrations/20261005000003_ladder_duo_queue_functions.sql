-- Atomic write paths for the DUO ladder queue. Mirrors 20261004000002_ladder_queue_functions.sql.
-- supabase-js can't hold a transaction across calls, and these must be all-or-nothing:
--   * joining (the "only one of a player's duos at a time" rule spans duo rows — a player can be
--     player_low in one duo and player_high in another — so it can't be a unique index; it's
--     checked here under per-player advisory locks),
--   * creating a match from 2 waiting duo tickets,
--   * cancelling a duo queue match + requeueing the duo that wasn't at fault.
--
-- Errors the caller is expected to map to a friendly message are raised with a `duo_queue:<code>`
-- message (see src/lib/ladder/ladderDuoQueue.ts).
--
-- Service-role only: execute is revoked from PUBLIC/anon/authenticated below.

-- Serializes queue joins / requeues for every duo that shares a player. Locks are taken in player id
-- order so two duos sharing a member can't deadlock.
CREATE OR REPLACE FUNCTION public.ladder_duo_lock_members(p_low bigint, p_high bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('ladder_duo_member'), least(p_low, p_high)::int);
  PERFORM pg_advisory_xact_lock(hashtext('ladder_duo_member'), greatest(p_low, p_high)::int);
END;
$$;

-- TRUE when either player is busy in the duo ladder through ANY duo other than p_except_duo_id: a
-- waiting ticket, or an open (assigned/scheduled, not cancelled) duo match.
CREATE OR REPLACE FUNCTION public.ladder_duo_members_busy(
  p_cycle_id      bigint,
  p_low           bigint,
  p_high          bigint,
  p_except_duo_id bigint
) RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH member_duos AS (
    SELECT d.id
    FROM ladder_duos d
    WHERE d.player_low_id IN (p_low, p_high) OR d.player_high_id IN (p_low, p_high)
  )
  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM ladder_duo_matches dm
      JOIN matches m ON m.match_id = dm.match_id
      WHERE dm.cycle_id = p_cycle_id
        AND dm.cancelled_at IS NULL
        AND m.status IN ('assigned', 'scheduled')
        AND (dm.team1_duo_id IN (SELECT id FROM member_duos) OR dm.team2_duo_id IN (SELECT id FROM member_duos))
    ) THEN 'has_open_match'
    WHEN EXISTS (
      SELECT 1
      FROM ladder_duo_queue_entries e
      WHERE e.status = 'waiting'
        AND e.duo_id IN (SELECT id FROM member_duos)
        AND e.duo_id IS DISTINCT FROM p_except_duo_id
    ) THEN 'member_busy'
    ELSE NULL
  END;
$$;

-- Puts a duo in the queue in p_tier_id. Returns the new ticket id.
CREATE OR REPLACE FUNCTION public.ladder_duo_queue_join(
  p_cycle_id     bigint,
  p_tier_id      bigint,
  p_duo_id       bigint,
  p_by_player_id bigint
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_low    bigint;
  v_high   bigint;
  v_status text;
  v_busy   text;
  v_id     uuid;
BEGIN
  SELECT player_low_id, player_high_id, status
  INTO v_low, v_high, v_status
  FROM ladder_duos
  WHERE id = p_duo_id;

  IF NOT FOUND OR v_status <> 'active' THEN
    RAISE EXCEPTION 'duo_queue:duo_inactive';
  END IF;
  IF p_by_player_id IS NOT NULL AND p_by_player_id NOT IN (v_low, v_high) THEN
    RAISE EXCEPTION 'duo_queue:not_member';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM ladder_cycles WHERE id = p_cycle_id AND status = 'active') THEN
    RAISE EXCEPTION 'duo_queue:no_active_cycle';
  END IF;

  PERFORM ladder_duo_lock_members(v_low, v_high);

  IF EXISTS (
    SELECT 1 FROM ladder_duo_queue_entries WHERE duo_id = p_duo_id AND status = 'waiting'
  ) THEN
    RAISE EXCEPTION 'duo_queue:already_waiting';
  END IF;

  v_busy := ladder_duo_members_busy(p_cycle_id, v_low, v_high, p_duo_id);
  IF v_busy IS NOT NULL THEN
    RAISE EXCEPTION 'duo_queue:%', v_busy;
  END IF;

  INSERT INTO ladder_duo_queue_entries (cycle_id, tier_id, duo_id, queued_by_player_id, status)
  VALUES (p_cycle_id, p_tier_id, p_duo_id, p_by_player_id, 'waiting')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Creates an `assigned` duo ladder match from exactly 2 waiting tickets. The ticket listed first is
-- team 1. Teams come from the duos themselves, so there's no split to validate. Returns the new
-- match_id, or NULL when the tickets are stale (left, matched elsewhere, duo dissolved, cycle closed)
-- so the caller re-reads the queue and retries.
CREATE OR REPLACE FUNCTION public.ladder_duo_queue_create_match(
  p_cycle_id  bigint,
  p_tier_id   bigint,
  p_entry_ids uuid[],
  p_play_by   timestamptz
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_duo1     bigint;
  v_duo2     bigint;
  v_t1_low   bigint;
  v_t1_high  bigint;
  v_t2_low   bigint;
  v_t2_high  bigint;
  v_valid    int;
  v_match_id bigint;
BEGIN
  IF coalesce(array_length(p_entry_ids, 1), 0) <> 2 OR p_entry_ids[1] = p_entry_ids[2] THEN
    RAISE EXCEPTION 'ladder_duo_queue_create_match needs 2 distinct entries';
  END IF;

  PERFORM 1
  FROM ladder_duo_queue_entries
  WHERE id = ANY (p_entry_ids)
  ORDER BY id
  FOR UPDATE;

  SELECT count(*) INTO v_valid
  FROM ladder_duo_queue_entries
  WHERE id = ANY (p_entry_ids)
    AND status = 'waiting'
    AND cycle_id = p_cycle_id
    AND tier_id = p_tier_id;
  IF v_valid <> 2 THEN
    RETURN NULL; -- stale
  END IF;

  IF NOT EXISTS (SELECT 1 FROM ladder_cycles WHERE id = p_cycle_id AND status = 'active') THEN
    RETURN NULL;
  END IF;

  SELECT duo_id INTO v_duo1 FROM ladder_duo_queue_entries WHERE id = p_entry_ids[1];
  SELECT duo_id INTO v_duo2 FROM ladder_duo_queue_entries WHERE id = p_entry_ids[2];

  SELECT player_low_id, player_high_id INTO v_t1_low, v_t1_high
  FROM ladder_duos WHERE id = v_duo1 AND status = 'active';
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT player_low_id, player_high_id INTO v_t2_low, v_t2_high
  FROM ladder_duos WHERE id = v_duo2 AND status = 'active';
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF v_t1_low IN (v_t2_low, v_t2_high) OR v_t1_high IN (v_t2_low, v_t2_high) THEN
    RAISE EXCEPTION 'duos % and % share a player', v_duo1, v_duo2;
  END IF;

  -- Same shape the solo queue writes: an undated 'duel' sitting at 'assigned'.
  INSERT INTO matches (event_id, date_local, time_local, venue, type, status, winner_team)
  VALUES (NULL, NULL, NULL, NULL, 'duel', 'assigned', NULL)
  RETURNING match_id INTO v_match_id;

  INSERT INTO match_teams (match_id, team_number, player_1_id, player_2_id, sets_won)
  VALUES
    (v_match_id, 1, v_t1_low, v_t1_high, NULL),
    (v_match_id, 2, v_t2_low, v_t2_high, NULL);

  INSERT INTO ladder_duo_matches (match_id, cycle_id, team1_duo_id, team2_duo_id, tier_id, source, play_by_at)
  VALUES (v_match_id, p_cycle_id, v_duo1, v_duo2, p_tier_id, 'queue', p_play_by);

  UPDATE ladder_duo_queue_entries
  SET status = 'matched',
      match_id = v_match_id,
      matched_at = now(),
      updated_at = now()
  WHERE id = ANY (p_entry_ids);

  RETURN v_match_id;
END;
$$;

-- Cancels an open duo queue match. Mirrors ladder_queue_cancel_match:
--   'backout'          (p_by_player_id required, must be in one of the two duos): that duo takes the
--                      strike (cancelled_by_duo_id) and only the OTHER duo is requeued.
--   'admin_cancelled'  both duos are requeued.
--   'deadline_expired' nobody is requeued; both rejoin by hand.
-- Requeued tickets copy the old queued_at (keep their place) and land in the duo's CURRENT tier
-- (latest ladder_duo_standing_events row), falling back to the old ticket's tier. A duo is skipped if
-- it's no longer active, the cycle is no longer active, or one of its players is now busy elsewhere
-- in the duo ladder.
--
-- Idempotent: an already-cancelled match returns no rows.
CREATE OR REPLACE FUNCTION public.ladder_duo_queue_cancel_match(
  p_match_id     bigint,
  p_reason       text,
  p_by_player_id bigint DEFAULT NULL
) RETURNS TABLE (requeued_duo_id bigint, requeued_tier_id bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source         text;
  v_cancelled_at   timestamptz;
  v_team1          bigint;
  v_team2          bigint;
  v_status         text;
  v_by_duo         bigint;
  v_requeue_reason text;
  v_entry          record;
  v_tier           bigint;
BEGIN
  IF p_reason NOT IN ('backout', 'deadline_expired', 'admin_cancelled') THEN
    RAISE EXCEPTION 'invalid cancel reason: %', p_reason;
  END IF;
  IF (p_reason = 'backout') <> (p_by_player_id IS NOT NULL) THEN
    RAISE EXCEPTION 'a backout needs the player who backed out, and only a backout has one';
  END IF;

  SELECT dm.source, dm.cancelled_at, dm.team1_duo_id, dm.team2_duo_id
  INTO v_source, v_cancelled_at, v_team1, v_team2
  FROM ladder_duo_matches dm
  WHERE dm.match_id = p_match_id
  FOR UPDATE;

  IF NOT FOUND OR v_source <> 'queue' THEN
    RAISE EXCEPTION 'match % is not a duo queue ladder match', p_match_id;
  END IF;
  IF v_cancelled_at IS NOT NULL THEN
    RETURN; -- already cancelled
  END IF;

  SELECT m.status INTO v_status FROM matches m WHERE m.match_id = p_match_id FOR UPDATE;
  IF v_status NOT IN ('assigned', 'scheduled', 'cancelled') THEN
    RAISE EXCEPTION 'match % is % and can no longer be cancelled', p_match_id, v_status;
  END IF;

  IF p_by_player_id IS NOT NULL THEN
    SELECT d.id INTO v_by_duo
    FROM ladder_duos d
    WHERE d.id IN (v_team1, v_team2)
      AND p_by_player_id IN (d.player_low_id, d.player_high_id);
    IF v_by_duo IS NULL THEN
      RAISE EXCEPTION 'player % is not in match %', p_by_player_id, p_match_id;
    END IF;
  END IF;

  UPDATE matches SET status = 'cancelled' WHERE match_id = p_match_id;

  UPDATE ladder_duo_matches
  SET cancel_reason = p_reason,
      cancelled_at = now(),
      cancelled_by_player_id = p_by_player_id,
      cancelled_by_duo_id = v_by_duo,
      updated_at = now()
  WHERE match_id = p_match_id;

  IF p_reason = 'deadline_expired' THEN
    RETURN;
  END IF;

  v_requeue_reason := CASE p_reason WHEN 'backout' THEN 'opponent_backout' ELSE p_reason END;

  FOR v_entry IN
    SELECT e.id, e.cycle_id, e.tier_id, e.duo_id, e.queued_at, e.queued_by_player_id,
           d.player_low_id, d.player_high_id
    FROM ladder_duo_queue_entries e
    JOIN ladder_duos d ON d.id = e.duo_id
    JOIN ladder_cycles c ON c.id = e.cycle_id
    WHERE e.match_id = p_match_id
      AND e.status = 'matched'
      AND e.duo_id IS DISTINCT FROM v_by_duo
      AND d.status = 'active'
      AND c.status = 'active'
    ORDER BY e.duo_id
  LOOP
    PERFORM ladder_duo_lock_members(v_entry.player_low_id, v_entry.player_high_id);

    -- This match is now cancelled, so it no longer counts as "open" for the busy check.
    IF ladder_duo_members_busy(v_entry.cycle_id, v_entry.player_low_id, v_entry.player_high_id, NULL) IS NOT NULL THEN
      CONTINUE;
    END IF;

    v_tier := coalesce(
      (SELECT s.tier_after_id
       FROM ladder_duo_standing_events s
       WHERE s.cycle_id = v_entry.cycle_id AND s.duo_id = v_entry.duo_id
       ORDER BY s.occurred_at DESC NULLS LAST, s.created_at DESC
       LIMIT 1),
      v_entry.tier_id
    );

    INSERT INTO ladder_duo_queue_entries
      (cycle_id, tier_id, duo_id, queued_by_player_id, status, queued_at, requeued_from_entry_id, requeue_reason)
    VALUES
      (v_entry.cycle_id, v_tier, v_entry.duo_id, v_entry.queued_by_player_id, 'waiting', v_entry.queued_at, v_entry.id, v_requeue_reason)
    ON CONFLICT (duo_id) WHERE status = 'waiting' DO NOTHING;

    IF FOUND THEN
      requeued_duo_id := v_entry.duo_id;
      requeued_tier_id := v_tier;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.ladder_duo_lock_members(bigint, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ladder_duo_members_busy(bigint, bigint, bigint, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ladder_duo_queue_join(bigint, bigint, bigint, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ladder_duo_queue_create_match(bigint, bigint, uuid[], timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ladder_duo_queue_cancel_match(bigint, text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ladder_duo_lock_members(bigint, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.ladder_duo_members_busy(bigint, bigint, bigint, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.ladder_duo_queue_join(bigint, bigint, bigint, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.ladder_duo_queue_create_match(bigint, bigint, uuid[], timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.ladder_duo_queue_cancel_match(bigint, text, bigint) TO service_role;
