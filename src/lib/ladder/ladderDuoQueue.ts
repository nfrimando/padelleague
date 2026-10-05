import type { SupabaseClient } from "@supabase/supabase-js";
import { computePlayByAt } from "@/lib/ladder/ladderQueueShared";
import { DUO_QUEUE_GROUP_SIZE, duoDisplayName } from "@/lib/ladder/ladderDuoShared";
import { ensureDuoPlacement, fetchLatestDuoStandings } from "@/lib/ladder/ladderDuoPlacement";
import { fetchActiveCycleId } from "@/lib/ladder/ladderQueue";
import { isMissingTableError } from "@/lib/ladder/ladderSchema";
import { notifyLadderMatchAssigned } from "@/lib/email/notifications/ladderMatchAssigned";
import {
  notifyLadderDuoPartnerBackedOut,
  notifyLadderQueueMatchExpired,
  notifyLadderQueueRequeued,
} from "@/lib/email/notifications/ladderQueueUpdates";

// The self-serve DUO ladder queue. Mirrors ladderQueue.ts, but a ticket is a duo and two duos in the
// same tier make a match. See .claude/ladder.md → "Duo ladder" and
// supabase/migrations/20261005000002..3. The writes that must be atomic (join, match creation,
// cancel + requeue) are Postgres functions; everything else is here.
//
// All functions take a service-role client: duo queue tables have no RLS write policy.

export type DuoCancelReason = "backout" | "deadline_expired" | "admin_cancelled";

export type DuoJoinErrorCode =
  | "no_active_cycle"
  | "not_placed"
  | "already_waiting"
  | "member_busy"
  | "has_open_match"
  | "duo_inactive"
  | "not_member"
  | "error";

export type JoinDuoQueueResult =
  | { ok: true; entryId: string; tierId: number; matchId: number | null; waitingCount: number }
  | { ok: false; code: DuoJoinErrorCode; error: string };

const JOIN_ERROR_TEXT: Record<Exclude<DuoJoinErrorCode, "not_placed" | "error">, string> = {
  no_active_cycle: "There's no active ladder cycle.",
  already_waiting: "This duo is already in the queue.",
  member_busy:
    "One of you is already in the duo queue with another duo. Leave that queue first — only one of your duos can queue at a time.",
  has_open_match:
    "One of you already has a duo match to play. Finish it (or back out) before queueing again.",
  duo_inactive: "This duo isn't active.",
  not_member: "You're not in this duo.",
};

// The join function raises `duo_queue:<code>`.
function parseDuoQueueError(message: string | undefined): DuoJoinErrorCode | null {
  const match = /duo_queue:([a-z_]+)/.exec(message ?? "");
  if (!match) return null;
  return match[1] in JOIN_ERROR_TEXT ? (match[1] as DuoJoinErrorCode) : null;
}

export async function countWaitingDuosInTier(
  supabase: SupabaseClient,
  cycleId: number,
  tierId: number,
): Promise<number> {
  const { count } = await supabase
    .from("ladder_duo_queue_entries")
    .select("id", { count: "exact", head: true })
    .eq("cycle_id", cycleId)
    .eq("tier_id", tierId)
    .eq("status", "waiting");
  return count ?? 0;
}

export async function joinDuoQueue(
  supabase: SupabaseClient,
  params: { duoId: number; playerId: number },
): Promise<JoinDuoQueueResult> {
  const cycleId = await fetchActiveCycleId(supabase);
  if (!cycleId) return { ok: false, code: "no_active_cycle", error: JOIN_ERROR_TEXT.no_active_cycle };

  // Idempotent: a duo formed before this cycle started (or whose placement failed) gets its rung now.
  const { standingsByDuo, warnings } = await ensureDuoPlacement(supabase, cycleId, [params.duoId]);
  const standing = standingsByDuo.get(String(params.duoId));
  if (!standing) {
    return {
      ok: false,
      code: "not_placed",
      error: warnings[0] ?? "Your duo doesn't have a ladder tier yet.",
    };
  }

  const { data: entryId, error } = await supabase.rpc("ladder_duo_queue_join", {
    p_cycle_id: cycleId,
    p_tier_id: standing.tierId,
    p_duo_id: params.duoId,
    p_by_player_id: params.playerId,
  });

  if (error || !entryId) {
    const code = parseDuoQueueError(error?.message);
    if (code && code !== "not_placed" && code !== "error") {
      return { ok: false, code, error: JOIN_ERROR_TEXT[code] };
    }
    // 23505 = uniq_ldqe_one_waiting: a double click racing past the function's own check.
    if (error?.code === "23505") {
      return { ok: false, code: "already_waiting", error: JOIN_ERROR_TEXT.already_waiting };
    }
    return { ok: false, code: "error", error: error?.message ?? "Failed to join the duo queue." };
  }

  const created = await runDuoQueueMatchmaking(supabase, cycleId, standing.tierId);
  const myMatchId = created.find((m) => m.duoIds.includes(params.duoId))?.matchId ?? null;

  return {
    ok: true,
    entryId: entryId as string,
    tierId: standing.tierId,
    matchId: myMatchId,
    waitingCount: await countWaitingDuosInTier(supabase, cycleId, standing.tierId),
  };
}

// Either member (or an admin, playerId null) can pull a duo's waiting ticket.
export async function leaveDuoQueue(
  supabase: SupabaseClient,
  params: { duoId: number; playerId: number | null },
): Promise<{ ok: boolean; error?: string }> {
  if (params.playerId != null) {
    const { data: duo } = await supabase
      .from("ladder_duos")
      .select("player_low_id, player_high_id")
      .eq("id", params.duoId)
      .maybeSingle();
    if (!duo || (duo.player_low_id !== params.playerId && duo.player_high_id !== params.playerId)) {
      return { ok: false, error: "You're not in this duo." };
    }
  }

  const isAdmin = params.playerId == null;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("ladder_duo_queue_entries")
    .update({
      status: isAdmin ? "removed" : "withdrawn",
      status_reason: isAdmin ? "admin" : "player_left",
      closed_at: now,
      updated_at: now,
    })
    .eq("duo_id", params.duoId)
    .eq("status", "waiting")
    .select("id");

  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "This duo isn't in the queue." };
  return { ok: true };
}

export type WaitingDuoTicket = {
  id: string;
  duoId: number;
  playerIds: [number, number];
};

// Picks the next pairing from tickets in queue order. The oldest ticket that has any valid opponent
// anchors the match; its opponent is the earliest ticket that isn't the anchor's most recent
// opponent this cycle. Only if every candidate is a rematch does the rematch go ahead — the duo pool
// is small, and leaving a duo waiting indefinitely is worse than a rematch. Duos sharing a player
// are never paired (the join function prevents it; this is defense in depth).
export function pickDuoOpponent(
  tickets: WaitingDuoTicket[],
  lastOpponentByDuo: Map<number, number>,
): [WaitingDuoTicket, WaitingDuoTicket] | null {
  for (let i = 0; i < tickets.length; i += 1) {
    const anchor = tickets[i];
    const candidates = tickets
      .slice(i + 1)
      .filter((t) => t.duoId !== anchor.duoId && !t.playerIds.some((p) => anchor.playerIds.includes(p)));
    if (candidates.length === 0) continue;

    const fresh = candidates.find(
      (t) => lastOpponentByDuo.get(anchor.duoId) !== t.duoId && lastOpponentByDuo.get(t.duoId) !== anchor.duoId,
    );
    return [anchor, fresh ?? candidates[0]];
  }
  return null;
}

// Each duo's most recent opponent in the cycle (cancelled matches included — a duo that just had a
// match fall through shouldn't immediately draw the same opponent if anyone else is waiting).
async function fetchLastDuoOpponents(
  supabase: SupabaseClient,
  cycleId: number,
  duoIds: number[],
): Promise<Map<number, number>> {
  const result = new Map<number, number>();
  if (duoIds.length === 0) return result;
  const list = duoIds.join(",");
  const { data } = await supabase
    .from("ladder_duo_matches")
    .select("team1_duo_id, team2_duo_id, created_at")
    .eq("cycle_id", cycleId)
    .or(`team1_duo_id.in.(${list}),team2_duo_id.in.(${list})`)
    .order("created_at", { ascending: false });

  for (const row of data ?? []) {
    const t1 = Number(row.team1_duo_id);
    const t2 = Number(row.team2_duo_id);
    if (!result.has(t1)) result.set(t1, t2);
    if (!result.has(t2)) result.set(t2, t1);
  }
  return result;
}

// Forms as many duo matches as the tier's queue allows, oldest tickets first. A NULL from
// ladder_duo_queue_create_match means a concurrent caller took a ticket — re-read and retry.
export async function runDuoQueueMatchmaking(
  supabase: SupabaseClient,
  cycleId: number,
  tierId: number,
): Promise<Array<{ matchId: number; duoIds: number[] }>> {
  const created: Array<{ matchId: number; duoIds: number[] }> = [];

  for (let round = 0; round < 25; round++) {
    const { data: waiting, error } = await supabase
      .from("ladder_duo_queue_entries")
      .select("id, duo_id, ladder_duos(player_low_id, player_high_id)")
      .eq("cycle_id", cycleId)
      .eq("tier_id", tierId)
      .eq("status", "waiting")
      .order("queued_at", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(10);

    if (error) {
      console.error("[ladder-duo-queue] failed to read queue:", error.message);
      break;
    }
    if (!waiting || waiting.length < DUO_QUEUE_GROUP_SIZE) break;

    type DuoEmbed = { player_low_id: number; player_high_id: number };
    const tickets: WaitingDuoTicket[] = [];
    for (const row of waiting) {
      const embed = row.ladder_duos as DuoEmbed | DuoEmbed[] | null;
      const duo = Array.isArray(embed) ? embed[0] : embed;
      if (!duo) continue;
      tickets.push({
        id: row.id as string,
        duoId: Number(row.duo_id),
        playerIds: [Number(duo.player_low_id), Number(duo.player_high_id)],
      });
    }

    const lastOpponents = await fetchLastDuoOpponents(
      supabase,
      cycleId,
      tickets.map((t) => t.duoId),
    );
    const pair = pickDuoOpponent(tickets, lastOpponents);
    if (!pair) break;

    const playByAt = computePlayByAt();
    const { data: matchId, error: rpcError } = await supabase.rpc("ladder_duo_queue_create_match", {
      p_cycle_id: cycleId,
      p_tier_id: tierId,
      p_entry_ids: [pair[0].id, pair[1].id],
      p_play_by: playByAt,
    });

    if (rpcError) {
      console.error("[ladder-duo-queue] ladder_duo_queue_create_match failed:", rpcError.message);
      break;
    }
    if (matchId == null) continue; // stale tickets; re-read

    created.push({ matchId: matchId as number, duoIds: [pair[0].duoId, pair[1].duoId] });

    await sendDuoMatchAssignedEmails(supabase, {
      cycleId,
      matchId: matchId as number,
      tierId,
      team1DuoId: pair[0].duoId,
      team2DuoId: pair[1].duoId,
      source: "queue",
      playByAt,
    });
  }

  return created;
}

type PlayerInfo = {
  player_id: number;
  name: string | null;
  nickname: string | null;
  email: string | null;
  is_notifications_subscribed?: boolean | null;
};

// Emails all 4 players of a freshly created duo match with their DUO's standing, so the email can
// flag promotion / demotion stakes. Never throws.
export async function sendDuoMatchAssignedEmails(
  supabase: SupabaseClient,
  params: {
    cycleId: number;
    matchId: number;
    tierId: number | null;
    team1DuoId: number;
    team2DuoId: number;
    source: "manual" | "queue";
    playByAt: string | null;
  },
): Promise<void> {
  try {
    const { data: duosData } = await supabase
      .from("ladder_duos")
      .select("id, name, player_low_id, player_high_id")
      .in("id", [params.team1DuoId, params.team2DuoId]);
    type DuoLite = { id: number; name: string | null; player_low_id: number; player_high_id: number };
    const duos = (duosData ?? []) as DuoLite[];
    const duo1 = duos.find((d) => d.id === params.team1DuoId);
    const duo2 = duos.find((d) => d.id === params.team2DuoId);
    if (!duo1 || !duo2) return;

    const playerIds = [duo1.player_low_id, duo1.player_high_id, duo2.player_low_id, duo2.player_high_id];
    const { data: playerDetails } = await supabase
      .from("players")
      .select("player_id,name,nickname,email,is_notifications_subscribed")
      .in("player_id", playerIds);
    const players = (playerDetails ?? []) as PlayerInfo[];
    if (players.length !== 4) return;
    const find = (id: number) => players.find((p) => p.player_id === id) as PlayerInfo;

    const standingsByDuo = await fetchLatestDuoStandings(supabase, params.cycleId, [duo1.id, duo2.id]);
    const standings: Record<string, { stars: number; cushionAvailable: boolean }> = {};
    for (const duo of [duo1, duo2]) {
      const s = standingsByDuo.get(String(duo.id));
      if (!s) continue;
      for (const pid of [duo.player_low_id, duo.player_high_id]) {
        standings[String(pid)] = { stars: s.stars, cushionAvailable: s.cushionAvailable };
      }
    }

    const { data: allTiersData } = await supabase
      .from("ladder_tiers")
      .select("id, name, rank")
      .order("rank", { ascending: true });
    const allTiers = (allTiersData ?? []) as Array<{ id: number; name: string; rank: number }>;
    const tier = allTiers.find((t) => t.id === params.tierId);
    const adjacent = (dir: 1 | -1) =>
      tier ? (allTiers.find((t) => t.rank === tier.rank + dir)?.name ?? null) : null;

    await notifyLadderMatchAssigned({
      matchId: params.matchId,
      tierName: tier?.name ?? "Ladder",
      nextTierName: adjacent(1),
      prevTierName: adjacent(-1),
      standings,
      team1Players: [find(duo1.player_low_id), find(duo1.player_high_id)],
      team2Players: [find(duo2.player_low_id), find(duo2.player_high_id)],
      source: params.source === "queue" ? "queue" : "roulette",
      playByAt: params.playByAt,
      mode: "duo",
      duoNames: [
        duoDisplayName(duo1.name, [find(duo1.player_low_id), find(duo1.player_high_id)]),
        duoDisplayName(duo2.name, [find(duo2.player_low_id), find(duo2.player_high_id)]),
      ],
    }).catch((err) => console.error("[email] notifyLadderMatchAssigned (duo) failed:", err));
  } catch (err) {
    console.error("[email] sendDuoMatchAssignedEmails failed:", err);
  }
}

async function duoMemberIds(supabase: SupabaseClient, duoIds: number[]): Promise<Map<number, [number, number]>> {
  const map = new Map<number, [number, number]>();
  if (duoIds.length === 0) return map;
  const { data } = await supabase
    .from("ladder_duos")
    .select("id, player_low_id, player_high_id")
    .in("id", duoIds);
  for (const row of data ?? []) {
    map.set(Number(row.id), [Number(row.player_low_id), Number(row.player_high_id)]);
  }
  return map;
}

// Cancels a duo queue match. A backout or admin cancel requeues the duo(s) not at fault (keeping
// their place), emails them, and runs matchmaking where they landed. A backout also tells the
// backer's partner (the strike is the duo's). 'deadline_expired' requeues nobody.
export async function cancelDuoQueueMatch(
  supabase: SupabaseClient,
  params: { matchId: number; reason: DuoCancelReason; byPlayerId?: number | null },
): Promise<{ ok: true; requeuedDuoIds: number[] } | { ok: false; error: string }> {
  const { matchId, reason } = params;

  const { data, error } = await supabase.rpc("ladder_duo_queue_cancel_match", {
    p_match_id: matchId,
    p_reason: reason,
    p_by_player_id: params.byPlayerId ?? null,
  });
  if (error) return { ok: false, error: error.message };

  const requeued = ((data ?? []) as Array<{ requeued_duo_id: number; requeued_tier_id: number }>).map(
    (r) => ({ duoId: Number(r.requeued_duo_id), tierId: Number(r.requeued_tier_id) }),
  );

  const { data: dm } = await supabase
    .from("ladder_duo_matches")
    .select("cycle_id, team1_duo_id, team2_duo_id, cancelled_by_duo_id")
    .eq("match_id", matchId)
    .maybeSingle();
  const cycleId = (dm?.cycle_id as number | undefined) ?? null;

  if (reason === "backout" && params.byPlayerId && dm?.cancelled_by_duo_id) {
    const members = await duoMemberIds(supabase, [Number(dm.cancelled_by_duo_id)]);
    const pair = members.get(Number(dm.cancelled_by_duo_id));
    const partnerId = pair ? (pair[0] === params.byPlayerId ? pair[1] : pair[0]) : null;
    if (partnerId) {
      const { data: backer } = await supabase
        .from("players")
        .select("name, nickname")
        .eq("player_id", params.byPlayerId)
        .maybeSingle();
      const backerName = (backer?.nickname as string | null) ?? (backer?.name as string | null) ?? "Your partner";
      await notifyLadderDuoPartnerBackedOut({ matchId, partnerId, backerName }).catch((err) =>
        console.error("[email] notifyLadderDuoPartnerBackedOut failed:", err),
      );
    }
  }

  if (requeued.length === 0) return { ok: true, requeuedDuoIds: [] };

  const members = await duoMemberIds(
    supabase,
    requeued.map((r) => r.duoId),
  );
  await notifyLadderQueueRequeued({
    matchId,
    reason,
    playerIds: requeued.flatMap((r) => members.get(r.duoId) ?? []),
    mode: "duo",
  }).catch((err) => console.error("[email] notifyLadderQueueRequeued (duo) failed:", err));

  if (cycleId) {
    for (const tierId of new Set(requeued.map((r) => r.tierId))) {
      await runDuoQueueMatchmaking(supabase, cycleId, tierId);
    }
  }

  return { ok: true, requeuedDuoIds: requeued.map((r) => r.duoId) };
}

// Admin-triggered expiry of a duo queue match past its play-by deadline. Nobody is requeued.
export async function expireDuoQueueMatch(
  supabase: SupabaseClient,
  matchId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: dm, error } = await supabase
    .from("ladder_duo_matches")
    .select("source, play_by_at, cancelled_at")
    .eq("match_id", matchId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!dm || dm.source !== "queue") return { ok: false, error: "Not a duo queue ladder match." };
  if (dm.cancelled_at) return { ok: false, error: "This match is already cancelled." };
  const playByAt = (dm.play_by_at as string | null) ?? null;
  if (!playByAt || new Date(playByAt) > new Date()) {
    return { ok: false, error: "This match isn't past its deadline yet." };
  }

  const result = await cancelDuoQueueMatch(supabase, { matchId, reason: "deadline_expired" });
  if (!result.ok) return result;

  const { data: teams } = await supabase
    .from("match_teams")
    .select("player_1_id, player_2_id")
    .eq("match_id", matchId);
  const playerIds = (teams ?? []).flatMap((t) => [t.player_1_id as number, t.player_2_id as number]);

  await notifyLadderQueueMatchExpired({ matchId, playByAt, playerIds, mode: "duo" }).catch((err) =>
    console.error("[email] notifyLadderQueueMatchExpired (duo) failed:", err),
  );

  return { ok: true };
}

// For admin paths that cancel a match without knowing what it is: if it's an open duo queue match,
// cancel it as 'admin_cancelled' (requeueing both duos). No-op otherwise, including when the duo
// tables don't exist yet.
export async function cancelDuoQueueMatchIfOpen(
  supabase: SupabaseClient,
  matchId: number,
): Promise<{ requeuedDuoIds: number[]; warning: string | null }> {
  const { data: dm, error } = await supabase
    .from("ladder_duo_matches")
    .select("source, cancelled_at")
    .eq("match_id", matchId)
    .maybeSingle();
  if (error) {
    return isMissingTableError(error)
      ? { requeuedDuoIds: [], warning: null }
      : { requeuedDuoIds: [], warning: `Failed to look up duo ladder match: ${error.message}` };
  }
  if (!dm || dm.source !== "queue" || dm.cancelled_at) return { requeuedDuoIds: [], warning: null };

  const result = await cancelDuoQueueMatch(supabase, { matchId, reason: "admin_cancelled" });
  return result.ok
    ? { requeuedDuoIds: result.requeuedDuoIds, warning: null }
    : { requeuedDuoIds: [], warning: `Failed to requeue duos: ${result.error}` };
}

// Call after anything that can move a duo's tier mid-cycle (match completion/revision, admin star
// adjustment). Moves its waiting ticket, if any, to its current tier and tries to match it there.
// Never throws.
export async function syncWaitingDuoEntriesToStanding(
  supabase: SupabaseClient,
  cycleId: number,
  duoIds: number[],
): Promise<void> {
  try {
    if (duoIds.length === 0) return;

    const { data: waiting } = await supabase
      .from("ladder_duo_queue_entries")
      .select("id, duo_id, tier_id")
      .eq("cycle_id", cycleId)
      .eq("status", "waiting")
      .in("duo_id", duoIds);
    if (!waiting || waiting.length === 0) return;

    const standings = await fetchLatestDuoStandings(
      supabase,
      cycleId,
      waiting.map((w) => w.duo_id as number),
    );

    const touchedTiers = new Set<number>();
    for (const entry of waiting) {
      const standing = standings.get(String(entry.duo_id));
      if (!standing || standing.tierId === entry.tier_id) continue;
      await supabase
        .from("ladder_duo_queue_entries")
        .update({ tier_id: standing.tierId, updated_at: new Date().toISOString() })
        .eq("id", entry.id)
        .eq("status", "waiting");
      touchedTiers.add(standing.tierId);
    }

    for (const tierId of touchedTiers) {
      await runDuoQueueMatchmaking(supabase, cycleId, tierId);
    }
  } catch (err) {
    console.error("[ladder-duo-queue] failed to sync waiting tickets:", err);
  }
}

// Strikes are derived, not stored: one per duo queue match a duo backed out of.
export async function fetchDuoBackoutCounts(
  supabase: SupabaseClient,
  cycleId: number,
): Promise<Map<number, number>> {
  const counts = new Map<number, number>();
  const { data } = await supabase
    .from("ladder_duo_matches")
    .select("cancelled_by_duo_id")
    .eq("cycle_id", cycleId)
    .eq("cancel_reason", "backout");
  for (const row of data ?? []) {
    const id = row.cancelled_by_duo_id as number | null;
    if (id != null) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}
