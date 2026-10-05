import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureLadderPlacement } from "@/lib/ladder/ladderPlacement";
import { fetchLatestLadderStandings } from "@/lib/ladder/ladderStandingLedger";
import {
  buildRouletteGroups,
  fetchLadderHistory,
  sendLadderMatchAssignedEmails,
} from "@/lib/ladder/ladderRoulette";
import { fetchLatestRatingsByPlayerIds } from "@/lib/ratingLedger";
import {
  notifyLadderQueueMatchExpired,
  notifyLadderQueueRequeued,
} from "@/lib/email/notifications/ladderQueueUpdates";
import { QUEUE_GROUP_SIZE, computePlayByAt } from "@/lib/ladder/ladderQueueShared";
import { cancelDuoQueueMatchIfOpen } from "@/lib/ladder/ladderDuoQueue";

// The self-serve ladder queue. See .claude/ladder.md → "Auto-queue" for the mechanic and
// supabase/migrations/20261004000000..2 for the schema. The two writes that must be atomic
// (match creation, cancel + requeue) are Postgres functions; everything else is here.
//
// All functions take a service-role client: queue writes have no RLS write policy.

export type CancelReason = "backout" | "deadline_expired" | "admin_cancelled";

export type OpenLadderMatch = {
  matchId: number;
  status: "assigned" | "scheduled";
  source: string;
  playByAt: string | null;
};

export type JoinQueueResult =
  | { ok: true; entryId: string; tierId: number; matchId: number | null; waitingCount: number }
  | {
      ok: false;
      code: "no_active_cycle" | "not_placed" | "already_waiting" | "has_open_match" | "error";
      error: string;
    };

// Most recently created active cycle, same lookup the roulette uses.
export async function fetchActiveCycleId(supabase: SupabaseClient): Promise<number | null> {
  const { data } = await supabase
    .from("ladder_cycles")
    .select("id")
    .eq("status", "active")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.id as number | undefined) ?? null;
}

// A player's open (assigned or scheduled) ladder match in the cycle, from any source. "One at a
// time" means this blocks joining the queue, whether it came from the queue, roulette or an admin.
export async function findOpenLadderMatch(
  supabase: SupabaseClient,
  cycleId: number,
  playerId: number,
): Promise<OpenLadderMatch | null> {
  const { data: teamRows } = await supabase
    .from("match_teams")
    .select("match_id")
    .or(`player_1_id.eq.${playerId},player_2_id.eq.${playerId}`);

  const matchIds = Array.from(new Set((teamRows ?? []).map((t) => t.match_id as number)));
  if (matchIds.length === 0) return null;

  const { data: ladderRows } = await supabase
    .from("ladder_matches")
    .select("match_id, source, play_by_at, matches(status)")
    .eq("cycle_id", cycleId)
    .in("match_id", matchIds);

  type StatusEmbed = { status?: string | null };
  for (const row of ladderRows ?? []) {
    const embed = row.matches as StatusEmbed | StatusEmbed[] | null;
    const status = (Array.isArray(embed) ? embed[0] : embed)?.status ?? null;
    if (status === "assigned" || status === "scheduled") {
      return {
        matchId: row.match_id as number,
        status,
        source: (row.source as string | null) ?? "manual",
        playByAt: (row.play_by_at as string | null) ?? null,
      };
    }
  }
  return null;
}

export async function countWaitingInTier(
  supabase: SupabaseClient,
  cycleId: number,
  tierId: number,
): Promise<number> {
  const { count } = await supabase
    .from("ladder_queue_entries")
    .select("id", { count: "exact", head: true })
    .eq("cycle_id", cycleId)
    .eq("tier_id", tierId)
    .eq("status", "waiting");
  return count ?? 0;
}

export async function joinLadderQueue(
  supabase: SupabaseClient,
  playerId: number,
): Promise<JoinQueueResult> {
  const cycleId = await fetchActiveCycleId(supabase);
  if (!cycleId) {
    return { ok: false, code: "no_active_cycle", error: "There's no active ladder cycle." };
  }

  // Placement is idempotent: a player who's never been placed this cycle gets their starting rung.
  const { standingsByPlayer, warnings } = await ensureLadderPlacement(supabase, cycleId, [playerId]);
  const standing = standingsByPlayer.get(String(playerId));
  if (!standing) {
    return {
      ok: false,
      code: "not_placed",
      error: warnings[0] ?? "You don't have a ladder tier yet.",
    };
  }

  const openMatch = await findOpenLadderMatch(supabase, cycleId, playerId);
  if (openMatch) {
    return {
      ok: false,
      code: "has_open_match",
      error: "You already have a ladder match to play. Finish it (or back out) before queueing again.",
    };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("ladder_queue_entries")
    .insert({ cycle_id: cycleId, tier_id: standing.tierId, player_id: playerId, status: "waiting" })
    .select("id")
    .maybeSingle();

  if (insertError || !inserted) {
    // 23505 = uniq_lqe_one_waiting: a double click or a second tab.
    if (insertError?.code === "23505") {
      return { ok: false, code: "already_waiting", error: "You're already in the queue." };
    }
    return { ok: false, code: "error", error: insertError?.message ?? "Failed to join the queue." };
  }

  const created = await runQueueMatchmaking(supabase, cycleId, standing.tierId);
  const myMatchId =
    created.find((m) => m.playerIds.includes(playerId))?.matchId ?? null;

  return {
    ok: true,
    entryId: inserted.id as string,
    tierId: standing.tierId,
    matchId: myMatchId,
    waitingCount: await countWaitingInTier(supabase, cycleId, standing.tierId),
  };
}

export async function leaveLadderQueue(
  supabase: SupabaseClient,
  playerId: number,
  reason: "player_left" | "admin" = "player_left",
): Promise<{ ok: boolean; error?: string }> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("ladder_queue_entries")
    .update({
      status: reason === "admin" ? "removed" : "withdrawn",
      status_reason: reason,
      closed_at: now,
      updated_at: now,
    })
    .eq("player_id", playerId)
    .eq("status", "waiting")
    .select("id");

  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "Not in the queue." };
  return { ok: true };
}

// Forms as many matches as the tier's queue allows, oldest tickets first. Each round reads the
// 4 longest-waiting tickets, splits them with the roulette's partner-repeat / rating-balance logic,
// and hands the split to ladder_queue_create_match, which re-checks the tickets under row locks. A
// NULL result means a concurrent caller got there first — re-read and try again.
export async function runQueueMatchmaking(
  supabase: SupabaseClient,
  cycleId: number,
  tierId: number,
): Promise<Array<{ matchId: number; playerIds: number[] }>> {
  const created: Array<{ matchId: number; playerIds: number[] }> = [];

  // Bounded so a persistent error can't spin; a tier never has anywhere near this many foursomes.
  for (let round = 0; round < 25; round++) {
    const { data: waiting, error } = await supabase
      .from("ladder_queue_entries")
      .select("id, player_id")
      .eq("cycle_id", cycleId)
      .eq("tier_id", tierId)
      .eq("status", "waiting")
      .order("queued_at", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(QUEUE_GROUP_SIZE);

    if (error) {
      console.error("[ladder-queue] failed to read queue:", error.message);
      break;
    }
    if (!waiting || waiting.length < QUEUE_GROUP_SIZE) break;

    const entryIds = waiting.map((w) => w.id as string);
    const playerIds = waiting.map((w) => w.player_id as number);

    const { lastPartner } = await fetchLadderHistory(supabase, cycleId, playerIds);
    const ratings = await fetchLatestRatingsByPlayerIds(supabase, playerIds);
    const split = buildRouletteGroups(playerIds, lastPartner, ratings).groups[0]?.split;
    if (!split) break;

    const playByAt = computePlayByAt();
    const { data: matchId, error: rpcError } = await supabase.rpc("ladder_queue_create_match", {
      p_cycle_id: cycleId,
      p_tier_id: tierId,
      p_entry_ids: entryIds,
      p_team1: split[0],
      p_team2: split[1],
      p_play_by: playByAt,
    });

    if (rpcError) {
      console.error("[ladder-queue] ladder_queue_create_match failed:", rpcError.message);
      break;
    }
    if (matchId == null) continue; // stale tickets; re-read

    created.push({ matchId: matchId as number, playerIds });

    await sendLadderMatchAssignedEmails(supabase, {
      cycleId,
      matchId: matchId as number,
      tierId,
      team1: split[0],
      team2: split[1],
      source: "queue",
      playByAt,
    });
  }

  return created;
}

// Cancels a queue match. For a backout or admin cancel it requeues everyone who wasn't at fault
// (keeping their place), emails them, then runs matchmaking for every tier that gained tickets — a
// requeue can complete a foursome. 'deadline_expired' requeues nobody (see expireQueueMatch).
export async function cancelQueueMatch(
  supabase: SupabaseClient,
  params: { matchId: number; reason: CancelReason; byPlayerId?: number | null },
): Promise<{ ok: true; requeuedPlayerIds: number[] } | { ok: false; error: string }> {
  const { matchId, reason } = params;

  const { data, error } = await supabase.rpc("ladder_queue_cancel_match", {
    p_match_id: matchId,
    p_reason: reason,
    p_by_player_id: params.byPlayerId ?? null,
  });

  if (error) return { ok: false, error: error.message };

  const requeued = ((data ?? []) as Array<{ requeued_player_id: number; requeued_tier_id: number }>)
    .map((r) => ({ playerId: Number(r.requeued_player_id), tierId: Number(r.requeued_tier_id) }));
  if (requeued.length === 0) return { ok: true, requeuedPlayerIds: [] };

  const { data: lm } = await supabase
    .from("ladder_matches")
    .select("cycle_id")
    .eq("match_id", matchId)
    .maybeSingle();
  const cycleId = (lm?.cycle_id as number | undefined) ?? null;

  await notifyLadderQueueRequeued({
    matchId,
    reason,
    playerIds: requeued.map((r) => r.playerId),
  }).catch((err) => console.error("[email] notifyLadderQueueRequeued failed:", err));

  if (cycleId) {
    for (const tierId of new Set(requeued.map((r) => r.tierId))) {
      await runQueueMatchmaking(supabase, cycleId, tierId);
    }
  }

  return { ok: true, requeuedPlayerIds: requeued.map((r) => r.playerId) };
}

// Admin-triggered expiry of a queue match past its play-by deadline. Nobody is requeued — all 4 rejoin
// by hand — and the admin penalizes whoever was at fault separately (admin star adjustment).
export async function expireQueueMatch(
  supabase: SupabaseClient,
  matchId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: lm, error } = await supabase
    .from("ladder_matches")
    .select("source, play_by_at, cancelled_at")
    .eq("match_id", matchId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!lm || lm.source !== "queue") return { ok: false, error: "Not a queue ladder match." };
  if (lm.cancelled_at) return { ok: false, error: "This match is already cancelled." };
  const playByAt = (lm.play_by_at as string | null) ?? null;
  if (!playByAt || new Date(playByAt) > new Date()) {
    return { ok: false, error: "This match isn't past its deadline yet." };
  }

  const result = await cancelQueueMatch(supabase, { matchId, reason: "deadline_expired" });
  if (!result.ok) return result;

  const { data: teams } = await supabase
    .from("match_teams")
    .select("player_1_id, player_2_id")
    .eq("match_id", matchId);
  const playerIds = (teams ?? []).flatMap((t) => [t.player_1_id as number, t.player_2_id as number]);

  await notifyLadderQueueMatchExpired({ matchId, playByAt, playerIds }).catch((err) =>
    console.error("[email] notifyLadderQueueMatchExpired failed:", err),
  );

  return { ok: true };
}

// For admin paths that cancel or delete a match without knowing whether it's a queue match: if it
// is an open one, cancel it as 'admin_cancelled' (requeueing all 4). No-op otherwise. A match with no
// solo ladder row may be a DUO queue match — that's handed to cancelDuoQueueMatchIfOpen, which
// requeues both duos (their 4 players are returned here).
export async function cancelQueueMatchIfOpen(
  supabase: SupabaseClient,
  matchId: number,
): Promise<{ requeuedPlayerIds: number[]; warning: string | null }> {
  const { data: lm } = await supabase
    .from("ladder_matches")
    .select("source, cancelled_at")
    .eq("match_id", matchId)
    .maybeSingle();
  if (!lm) {
    const duo = await cancelDuoQueueMatchIfOpen(supabase, matchId);
    if (duo.requeuedDuoIds.length === 0) return { requeuedPlayerIds: [], warning: duo.warning };
    const { data: members } = await supabase
      .from("ladder_duos")
      .select("player_low_id, player_high_id")
      .in("id", duo.requeuedDuoIds);
    return {
      requeuedPlayerIds: (members ?? []).flatMap((m) => [m.player_low_id as number, m.player_high_id as number]),
      warning: duo.warning,
    };
  }
  if (lm.source !== "queue" || lm.cancelled_at) {
    return { requeuedPlayerIds: [], warning: null };
  }

  const result = await cancelQueueMatch(supabase, { matchId, reason: "admin_cancelled" });
  return result.ok
    ? { requeuedPlayerIds: result.requeuedPlayerIds, warning: null }
    : { requeuedPlayerIds: [], warning: `Failed to requeue players: ${result.error}` };
}

// Call after anything that can move a player's tier mid-cycle (match completion/revision, admin
// star adjustment). Moves their waiting ticket, if any, to their current tier — keeping queued_at —
// and tries to match them there. Never throws.
export async function syncWaitingEntriesToStanding(
  supabase: SupabaseClient,
  cycleId: number,
  playerIds: number[],
): Promise<void> {
  try {
    if (playerIds.length === 0) return;

    const { data: waiting } = await supabase
      .from("ladder_queue_entries")
      .select("id, player_id, tier_id")
      .eq("cycle_id", cycleId)
      .eq("status", "waiting")
      .in("player_id", playerIds);
    if (!waiting || waiting.length === 0) return;

    const standings = await fetchLatestLadderStandings(
      supabase,
      cycleId,
      waiting.map((w) => w.player_id as number),
    );

    const touchedTiers = new Set<number>();
    for (const entry of waiting) {
      const standing = standings.get(String(entry.player_id));
      if (!standing || standing.tierId === entry.tier_id) continue;

      await supabase
        .from("ladder_queue_entries")
        .update({ tier_id: standing.tierId, updated_at: new Date().toISOString() })
        .eq("id", entry.id)
        .eq("status", "waiting");
      touchedTiers.add(standing.tierId);
    }

    for (const tierId of touchedTiers) {
      await runQueueMatchmaking(supabase, cycleId, tierId);
    }
  } catch (err) {
    console.error("[ladder-queue] failed to sync waiting tickets:", err);
  }
}

// Strikes are derived, not stored: one per queue match a player backed out of.
export async function fetchBackoutCounts(
  supabase: SupabaseClient,
  cycleId: number,
): Promise<Map<number, number>> {
  const counts = new Map<number, number>();
  const { data } = await supabase
    .from("ladder_matches")
    .select("cancelled_by_player_id")
    .eq("cycle_id", cycleId)
    .eq("cancel_reason", "backout");

  for (const row of data ?? []) {
    const id = row.cancelled_by_player_id as number | null;
    if (id != null) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}
