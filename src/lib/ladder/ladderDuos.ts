import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canonicalPair,
  duoDisplayName,
  DUO_INVITE_EXPIRY_DAYS,
  MAX_LIVE_DUOS_PER_PLAYER,
  type DuoStatus,
} from "@/lib/ladder/ladderDuoShared";
import { placeDuoInActiveCycle, fetchLatestDuoStandings } from "@/lib/ladder/ladderDuoPlacement";
import { fetchActiveCycleId } from "@/lib/ladder/ladderQueue";
import { cancelDuoQueueMatch } from "@/lib/ladder/ladderDuoQueue";
import { isMissingTableError } from "@/lib/ladder/ladderSchema";
import {
  notifyDuoAccepted,
  notifyDuoCreatedByAdmin,
  notifyDuoDeclined,
  notifyDuoDissolved,
  notifyDuoInvite,
} from "@/lib/email/notifications/ladderDuoUpdates";

// Duo formation: invite → accept/decline/withdraw, rename, dissolve, admin create. See
// .claude/ladder.md → "Duo ladder". One ladder_duos row per unordered pair, forever: re-inviting a
// declined/withdrawn/dissolved pair revives that row, so a re-formed duo resumes its standing.
//
// All functions take a service-role client (ladder_duos has no RLS write policy) and return a
// { ok, status, error } shape the API routes pass straight through. Emails are awaited and
// sequential, per CLAUDE.md.

export type DuoRow = {
  id: number;
  player_low_id: number;
  player_high_id: number;
  name: string | null;
  status: DuoStatus;
  invited_by_player_id: number | null;
  invited_at: string | null;
  responded_at: string | null;
  accepted_at: string | null;
  dissolved_at: string | null;
  dissolved_by_player_id: number | null;
  dissolve_reason: string | null;
  created_at: string;
};

export const DUO_COLUMNS =
  "id, player_low_id, player_high_id, name, status, invited_by_player_id, invited_at, responded_at, accepted_at, dissolved_at, dissolved_by_player_id, dissolve_reason, created_at";

const LIVE_STATUSES: DuoStatus[] = ["pending", "active"];

export type DuoFailure = { ok: false; status: number; error: string; code?: string };

export function partnerOf(duo: Pick<DuoRow, "player_low_id" | "player_high_id">, playerId: number): number {
  return duo.player_low_id === playerId ? duo.player_high_id : duo.player_low_id;
}

export function isMember(duo: Pick<DuoRow, "player_low_id" | "player_high_id">, playerId: number): boolean {
  return duo.player_low_id === playerId || duo.player_high_id === playerId;
}

export async function loadDuo(client: SupabaseClient, duoId: number): Promise<DuoRow | null> {
  const { data, error } = await client.from("ladder_duos").select(DUO_COLUMNS).eq("id", duoId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as DuoRow | null) ?? null;
}

export async function loadDuoByPair(
  client: SupabaseClient,
  playerA: number,
  playerB: number,
): Promise<DuoRow | null> {
  const [low, high] = canonicalPair(playerA, playerB);
  const { data, error } = await client
    .from("ladder_duos")
    .select(DUO_COLUMNS)
    .eq("player_low_id", low)
    .eq("player_high_id", high)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as DuoRow | null) ?? null;
}

export async function listDuosForPlayer(
  client: SupabaseClient,
  playerId: number,
  statuses: DuoStatus[] = LIVE_STATUSES,
): Promise<DuoRow[]> {
  const { data, error } = await client
    .from("ladder_duos")
    .select(DUO_COLUMNS)
    .or(`player_low_id.eq.${playerId},player_high_id.eq.${playerId}`)
    .in("status", statuses)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as DuoRow[];
}

// The duo's open (assigned/scheduled, not cancelled) duo ladder match, from any source.
export async function findOpenDuoMatch(
  client: SupabaseClient,
  duoId: number,
): Promise<{ matchId: number; source: string; status: string; playByAt: string | null } | null> {
  const { data } = await client
    .from("ladder_duo_matches")
    .select("match_id, source, play_by_at, cancelled_at, matches(status)")
    .or(`team1_duo_id.eq.${duoId},team2_duo_id.eq.${duoId}`)
    .is("cancelled_at", null);

  type StatusEmbed = { status?: string | null };
  for (const row of data ?? []) {
    const embed = row.matches as StatusEmbed | StatusEmbed[] | null;
    const status = (Array.isArray(embed) ? embed[0] : embed)?.status ?? null;
    if (status === "assigned" || status === "scheduled") {
      return {
        matchId: row.match_id as number,
        source: (row.source as string) ?? "manual",
        status,
        playByAt: (row.play_by_at as string | null) ?? null,
      };
    }
  }
  return null;
}

// Lazy expiry: flips every `pending` invite older than DUO_INVITE_EXPIRY_DAYS to `expired`. There is
// no cron — this runs at the start of anything that reads or acts on invites, so a stale invite is
// gone before anyone can see, count or accept it. One indexed UPDATE; never throws.
export async function expireStaleDuoInvites(client: SupabaseClient): Promise<void> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - DUO_INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await client
    .from("ladder_duos")
    .update({ status: "expired", responded_at: now.toISOString(), updated_at: now.toISOString() })
    .eq("status", "pending")
    .lt("invited_at", cutoff);
  if (error && !isMissingTableError(error)) {
    console.error("[ladder-duo] failed to expire stale invites:", error.message);
  }
}

async function countLiveDuos(client: SupabaseClient, playerId: number): Promise<number> {
  const { count } = await client
    .from("ladder_duos")
    .select("id", { count: "exact", head: true })
    .or(`player_low_id.eq.${playerId},player_high_id.eq.${playerId}`)
    .in("status", LIVE_STATUSES);
  return count ?? 0;
}

async function loadPlayerNames(
  client: SupabaseClient,
  ids: number[],
): Promise<Map<number, { name: string | null; nickname: string | null }>> {
  const { data } = await client.from("players").select("player_id, name, nickname").in("player_id", ids);
  const map = new Map<number, { name: string | null; nickname: string | null }>();
  for (const row of data ?? []) {
    map.set(Number(row.player_id), {
      name: (row.name as string | null) ?? null,
      nickname: (row.nickname as string | null) ?? null,
    });
  }
  return map;
}

export async function duoLabel(client: SupabaseClient, duo: DuoRow): Promise<string> {
  if (duo.name) return duo.name;
  const names = await loadPlayerNames(client, [duo.player_low_id, duo.player_high_id]);
  return duoDisplayName(null, [names.get(duo.player_low_id), names.get(duo.player_high_id)]);
}

async function tierNameForDuo(client: SupabaseClient, duoId: number): Promise<string | null> {
  const cycleId = await fetchActiveCycleId(client);
  if (!cycleId) return null;
  const standing = (await fetchLatestDuoStandings(client, cycleId, [duoId])).get(String(duoId));
  if (!standing) return null;
  const { data } = await client.from("ladder_tiers").select("name").eq("id", standing.tierId).maybeSingle();
  return (data?.name as string | undefined) ?? null;
}

// ---- Invite ----------------------------------------------------------------------------------

export async function inviteDuo(
  client: SupabaseClient,
  params: { inviterId: number; partnerId: number; name: string | null },
): Promise<{ ok: true; duo: DuoRow } | DuoFailure> {
  const { inviterId, partnerId, name } = params;
  if (inviterId === partnerId) {
    return { ok: false, status: 400, error: "You can't form a duo with yourself." };
  }

  // Lapsed invites must not count toward the cap or block re-inviting the same pair.
  await expireStaleDuoInvites(client);

  const { data: partner } = await client
    .from("players")
    .select("player_id")
    .eq("player_id", partnerId)
    .maybeSingle();
  if (!partner) return { ok: false, status: 404, error: "That player doesn't exist." };

  const existing = await loadDuoByPair(client, inviterId, partnerId);
  if (existing?.status === "active") {
    return { ok: false, status: 409, error: "You two are already a duo.", code: "already_active" };
  }
  if (existing?.status === "pending") {
    return { ok: false, status: 409, error: "There's already a pending invite between you two.", code: "already_pending" };
  }

  if ((await countLiveDuos(client, inviterId)) >= MAX_LIVE_DUOS_PER_PLAYER) {
    return {
      ok: false,
      status: 409,
      error: `You can have at most ${MAX_LIVE_DUOS_PER_PLAYER} duos and pending invites.`,
      code: "too_many_duos",
    };
  }
  if ((await countLiveDuos(client, partnerId)) >= MAX_LIVE_DUOS_PER_PLAYER) {
    return {
      ok: false,
      status: 409,
      error: "That player already has the maximum number of duos and pending invites.",
      code: "partner_too_many_duos",
    };
  }

  const now = new Date().toISOString();
  const [low, high] = canonicalPair(inviterId, partnerId);
  const fields = {
    status: "pending" as const,
    invited_by_player_id: inviterId,
    created_by_admin_user_id: null,
    invited_at: now,
    responded_at: null,
    accepted_at: null,
    dissolved_at: null,
    dissolved_by_player_id: null,
    dissolve_reason: null,
    updated_at: now,
  };

  let duo: DuoRow | null = null;
  if (existing) {
    // Revive the pair's row. Guarded on the status we read so a concurrent accept/invite can't be
    // overwritten.
    const { data, error } = await client
      .from("ladder_duos")
      .update({ ...fields, name: name ?? existing.name })
      .eq("id", existing.id)
      .eq("status", existing.status)
      .select(DUO_COLUMNS)
      .maybeSingle();
    if (error) return { ok: false, status: 500, error: error.message };
    if (!data) return { ok: false, status: 409, error: "This duo changed just now. Refresh and try again." };
    duo = data as DuoRow;
  } else {
    const { data, error } = await client
      .from("ladder_duos")
      .insert({ ...fields, player_low_id: low, player_high_id: high, name })
      .select(DUO_COLUMNS)
      .single();
    if (error) {
      if (error.code === "23505") {
        return { ok: false, status: 409, error: "There's already an invite between you two." };
      }
      return { ok: false, status: 500, error: error.message };
    }
    duo = data as DuoRow;
  }

  await notifyDuoInvite({ inviterId, inviteeId: partnerId, duoName: duo.name }).catch((err) =>
    console.error("[email] notifyDuoInvite failed:", err),
  );

  return { ok: true, duo };
}

// ---- Respond ---------------------------------------------------------------------------------

async function requirePending(
  client: SupabaseClient,
  duoId: number,
  playerId: number,
  role: "invitee" | "inviter",
): Promise<{ ok: true; duo: DuoRow } | DuoFailure> {
  await expireStaleDuoInvites(client);
  const duo = await loadDuo(client, duoId);
  if (!duo || !isMember(duo, playerId)) return { ok: false, status: 404, error: "Duo invite not found." };
  if (duo.status === "expired") {
    return { ok: false, status: 409, error: "This invite has expired. Send a new one to team up." };
  }
  if (duo.status !== "pending") {
    return { ok: false, status: 409, error: `This invite is already ${duo.status}.` };
  }
  const isInviter = duo.invited_by_player_id === playerId;
  if (role === "invitee" && isInviter) {
    return { ok: false, status: 403, error: "Only the invited player can respond to this invite." };
  }
  if (role === "inviter" && !isInviter) {
    return { ok: false, status: 403, error: "Only the player who sent this invite can withdraw it." };
  }
  return { ok: true, duo };
}

async function setStatusFromPending(
  client: SupabaseClient,
  duoId: number,
  fields: Record<string, unknown>,
): Promise<{ ok: true; duo: DuoRow } | DuoFailure> {
  const { data, error } = await client
    .from("ladder_duos")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", duoId)
    .eq("status", "pending")
    .select(DUO_COLUMNS)
    .maybeSingle();
  if (error) return { ok: false, status: 500, error: error.message };
  if (!data) return { ok: false, status: 409, error: "This invite changed just now. Refresh and try again." };
  return { ok: true, duo: data as DuoRow };
}

export async function acceptDuo(
  client: SupabaseClient,
  params: { duoId: number; playerId: number },
): Promise<{ ok: true; duo: DuoRow; ladderWarning: string | null } | DuoFailure> {
  const check = await requirePending(client, params.duoId, params.playerId, "invitee");
  if (!check.ok) return check;

  const now = new Date().toISOString();
  const updated = await setStatusFromPending(client, params.duoId, {
    status: "active",
    responded_at: now,
    accepted_at: now,
  });
  if (!updated.ok) return updated;

  // Place the duo straight away so it shows on the Duo Ladder. Non-fatal.
  const { warnings } = await placeDuoInActiveCycle(client, params.duoId);

  const inviterId = updated.duo.invited_by_player_id;
  if (inviterId) {
    const tierName = await tierNameForDuo(client, params.duoId);
    await notifyDuoAccepted({ inviterId, inviteeId: params.playerId, tierName }).catch((err) =>
      console.error("[email] notifyDuoAccepted failed:", err),
    );
  }

  return { ok: true, duo: updated.duo, ladderWarning: warnings.length > 0 ? warnings.join(" ") : null };
}

export async function declineDuo(
  client: SupabaseClient,
  params: { duoId: number; playerId: number },
): Promise<{ ok: true; duo: DuoRow } | DuoFailure> {
  const check = await requirePending(client, params.duoId, params.playerId, "invitee");
  if (!check.ok) return check;

  const updated = await setStatusFromPending(client, params.duoId, {
    status: "declined",
    responded_at: new Date().toISOString(),
  });
  if (!updated.ok) return updated;

  const inviterId = updated.duo.invited_by_player_id;
  if (inviterId) {
    await notifyDuoDeclined({ inviterId, inviteeId: params.playerId }).catch((err) =>
      console.error("[email] notifyDuoDeclined failed:", err),
    );
  }
  return updated;
}

export async function withdrawDuo(
  client: SupabaseClient,
  params: { duoId: number; playerId: number },
): Promise<{ ok: true; duo: DuoRow } | DuoFailure> {
  const check = await requirePending(client, params.duoId, params.playerId, "inviter");
  if (!check.ok) return check;
  return setStatusFromPending(client, params.duoId, {
    status: "withdrawn",
    responded_at: new Date().toISOString(),
  });
}

// ---- Rename ----------------------------------------------------------------------------------

export async function renameDuo(
  client: SupabaseClient,
  params: { duoId: number; byPlayerId: number | null; name: string | null },
): Promise<{ ok: true; duo: DuoRow } | DuoFailure> {
  const duo = await loadDuo(client, params.duoId);
  if (!duo) return { ok: false, status: 404, error: "Duo not found." };
  if (params.byPlayerId != null && !isMember(duo, params.byPlayerId)) {
    return { ok: false, status: 404, error: "Duo not found." };
  }
  if (duo.status !== "active" && duo.status !== "pending") {
    return { ok: false, status: 409, error: `This duo is ${duo.status}.` };
  }

  const { data, error } = await client
    .from("ladder_duos")
    .update({ name: params.name, updated_at: new Date().toISOString() })
    .eq("id", duo.id)
    .select(DUO_COLUMNS)
    .single();
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true, duo: data as DuoRow };
}

// ---- Dissolve --------------------------------------------------------------------------------

// Dissolves an active duo. Never deletes ledger rows or cycle results.
//   * A waiting queue ticket is withdrawn.
//   * An open duo match blocks a member's dissolve (409): back out of / finish it first. An implicit
//     backout would hand out a strike and surprise the partner.
//   * An admin dissolve with `force` cancels an open QUEUE match as 'admin_cancelled' (the opponent
//     is requeued; this duo isn't, since it's no longer active). An open MANUAL match is left alone
//     and can still be completed — the sync accepts dissolved duos.
export async function dissolveDuo(
  client: SupabaseClient,
  params: { duoId: number; byPlayerId: number | null; force?: boolean; reason?: string | null },
): Promise<{ ok: true; duo: DuoRow; warnings: string[] } | DuoFailure> {
  const warnings: string[] = [];
  const duo = await loadDuo(client, params.duoId);
  if (!duo) return { ok: false, status: 404, error: "Duo not found." };
  if (params.byPlayerId != null && !isMember(duo, params.byPlayerId)) {
    return { ok: false, status: 404, error: "Duo not found." };
  }
  if (duo.status !== "active") {
    return { ok: false, status: 409, error: `Only an active duo can be dissolved (this one is ${duo.status}).` };
  }

  const openMatch = await findOpenDuoMatch(client, duo.id);
  const isAdmin = params.byPlayerId == null;
  if (openMatch && !(isAdmin && params.force)) {
    return {
      ok: false,
      status: 409,
      code: "has_open_match",
      error: isAdmin
        ? `This duo has an open match (#${openMatch.matchId}). Tick "force" to dissolve anyway.`
        : "Your duo has an open match. Back out of it (or play it) before dissolving.",
    };
  }

  const now = new Date().toISOString();
  const { data, error } = await client
    .from("ladder_duos")
    .update({
      status: "dissolved",
      dissolved_at: now,
      dissolved_by_player_id: params.byPlayerId,
      dissolve_reason: params.reason ?? (isAdmin ? "admin" : "member"),
      updated_at: now,
    })
    .eq("id", duo.id)
    .eq("status", "active")
    .select(DUO_COLUMNS)
    .maybeSingle();
  if (error) return { ok: false, status: 500, error: error.message };
  if (!data) return { ok: false, status: 409, error: "This duo changed just now. Refresh and try again." };

  const { error: ticketError } = await client
    .from("ladder_duo_queue_entries")
    .update({ status: "withdrawn", status_reason: "duo_dissolved", closed_at: now, updated_at: now })
    .eq("duo_id", duo.id)
    .eq("status", "waiting");
  if (ticketError) warnings.push(`Failed to withdraw the duo's queue ticket: ${ticketError.message}`);

  if (openMatch && openMatch.source === "queue") {
    const cancelled = await cancelDuoQueueMatch(client, {
      matchId: openMatch.matchId,
      reason: "admin_cancelled",
    });
    if (!cancelled.ok) warnings.push(`Failed to cancel open match #${openMatch.matchId}: ${cancelled.error}`);
  } else if (openMatch) {
    warnings.push(`Open manual match #${openMatch.matchId} was left in place and can still be completed.`);
  }

  const label = await duoLabel(client, data as DuoRow);
  const recipients = params.byPlayerId
    ? [partnerOf(duo, params.byPlayerId)]
    : [duo.player_low_id, duo.player_high_id];
  for (const recipientId of recipients) {
    await notifyDuoDissolved({ recipientId, actorId: params.byPlayerId, duoLabel: label }).catch((err) =>
      console.error("[email] notifyDuoDissolved failed:", err),
    );
  }

  return { ok: true, duo: data as DuoRow, warnings };
}

// ---- Admin create ----------------------------------------------------------------------------

// Creates (or revives) a duo directly as active — no invite. Used by the admin Duos tab and by
// manual duo-match creation ("create duo on save").
export async function adminCreateDuo(
  client: SupabaseClient,
  params: { playerA: number; playerB: number; name: string | null; adminUserId: string | null },
): Promise<{ ok: true; duo: DuoRow; created: boolean; ladderWarning: string | null } | DuoFailure> {
  if (params.playerA === params.playerB) {
    return { ok: false, status: 400, error: "A duo needs two different players." };
  }

  const { data: players } = await client
    .from("players")
    .select("player_id")
    .in("player_id", [params.playerA, params.playerB]);
  if ((players ?? []).length !== 2) return { ok: false, status: 404, error: "Both players must exist." };

  const existing = await loadDuoByPair(client, params.playerA, params.playerB);
  if (existing?.status === "active") {
    return { ok: true, duo: existing, created: false, ladderWarning: null };
  }

  const now = new Date().toISOString();
  const [low, high] = canonicalPair(params.playerA, params.playerB);
  const fields = {
    status: "active" as const,
    invited_by_player_id: null,
    created_by_admin_user_id: params.adminUserId,
    invited_at: now,
    responded_at: now,
    accepted_at: now,
    dissolved_at: null,
    dissolved_by_player_id: null,
    dissolve_reason: null,
    updated_at: now,
  };

  let duo: DuoRow;
  if (existing) {
    const { data, error } = await client
      .from("ladder_duos")
      .update({ ...fields, name: params.name ?? existing.name })
      .eq("id", existing.id)
      .select(DUO_COLUMNS)
      .single();
    if (error) return { ok: false, status: 500, error: error.message };
    duo = data as DuoRow;
  } else {
    const { data, error } = await client
      .from("ladder_duos")
      .insert({ ...fields, player_low_id: low, player_high_id: high, name: params.name })
      .select(DUO_COLUMNS)
      .single();
    if (error) return { ok: false, status: 500, error: error.message };
    duo = data as DuoRow;
  }

  const { warnings } = await placeDuoInActiveCycle(client, duo.id);

  // No invite was involved, so this is the first either player hears of it.
  const tierName = await tierNameForDuo(client, duo.id);
  for (const [recipientId, partnerId] of [
    [duo.player_low_id, duo.player_high_id],
    [duo.player_high_id, duo.player_low_id],
  ]) {
    await notifyDuoCreatedByAdmin({ recipientId, partnerId, duoName: duo.name, tierName }).catch((err) =>
      console.error("[email] notifyDuoCreatedByAdmin failed:", err),
    );
  }

  return {
    ok: true,
    duo,
    created: true,
    ladderWarning: warnings.length > 0 ? warnings.join(" ") : null,
  };
}
