import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventPairStatus } from "@/lib/types";
import type { EventSignupStatus } from "@/lib/eventSignupStatus";

/**
 * Shared server helpers for paired (doubles partner) event signups.
 *
 * The pair row IS the invite — it exists from the moment the initiator picks a
 * partner, before the invitee has any `signups_events` row. `signups_events.pair_id`
 * is stamped only once the pair reaches 'accepted', so a non-null pair_id always
 * means "confirmed partner".
 *
 * There are no transactions available through supabase-js, so multi-row writes are
 * ordered so that a mid-way failure leaves a retryable state rather than a broken
 * one (see acceptPair).
 */

export const LIVE_PAIR_STATUSES: EventPairStatus[] = ["pending", "accepted"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, "public", any>;

export type PairRow = {
  id: string;
  event_id: number;
  initiator_player_id: number;
  invitee_player_id: number;
  status: EventPairStatus;
  responded_at: string | null;
  created_at: string;
};

export type PartnerPlayer = {
  player_id: number;
  name: string | null;
  nickname: string | null;
  image_link: string | null;
};

const PAIR_COLUMNS =
  "id, event_id, initiator_player_id, invitee_player_id, status, responded_at, created_at";

/** The player's live (pending or accepted) pair for an event, in either seat. */
export async function loadLivePairForPlayer(
  client: Client,
  eventId: number,
  playerId: number,
): Promise<PairRow | null> {
  const { data, error } = await client
    .from("event_signup_pairs")
    .select(PAIR_COLUMNS)
    .eq("event_id", eventId)
    .in("status", LIVE_PAIR_STATUSES)
    .or(`initiator_player_id.eq.${playerId},invitee_player_id.eq.${playerId}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as PairRow | null) ?? null;
}

export async function loadPairById(
  client: Client,
  pairId: string,
): Promise<PairRow | null> {
  const { data, error } = await client
    .from("event_signup_pairs")
    .select(PAIR_COLUMNS)
    .eq("id", pairId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as PairRow | null) ?? null;
}

/** The accepted pair a signup belongs to, or null. */
export async function loadPairForSignup(
  client: Client,
  signupId: string,
): Promise<PairRow | null> {
  const { data: signup, error } = await client
    .from("signups_events")
    .select("pair_id")
    .eq("id", signupId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  const pairId = signup?.pair_id as string | null | undefined;
  if (!pairId) return null;

  const pair = await loadPairById(client, pairId);
  // A pair_id pointing at a non-accepted pair is an error state — treat it as null.
  return pair?.status === "accepted" ? pair : null;
}

export function partnerIdOf(pair: PairRow, playerId: number): number {
  return pair.initiator_player_id === playerId
    ? pair.invitee_player_id
    : pair.initiator_player_id;
}

export function roleOf(pair: PairRow, playerId: number): "initiator" | "invitee" {
  return pair.initiator_player_id === playerId ? "initiator" : "invitee";
}

export async function loadPlayers(
  client: Client,
  playerIds: number[],
): Promise<Map<number, PartnerPlayer>> {
  const unique = [...new Set(playerIds)].filter((id) => Number.isFinite(id));
  if (unique.length === 0) return new Map();

  const { data } = await client
    .from("players")
    .select("player_id, name, nickname, image_link")
    .in("player_id", unique);

  const map = new Map<number, PartnerPlayer>();
  for (const row of data ?? []) {
    map.set(Number(row.player_id), {
      player_id: Number(row.player_id),
      name: row.name ?? null,
      nickname: row.nickname ?? null,
      image_link: row.image_link ?? null,
    });
  }
  return map;
}

export type LatestSignup = {
  id: string;
  status: EventSignupStatus;
  pair_id: string | null;
  looking_for_partner: boolean;
};

/**
 * The player's most recent signup for an event.
 *
 * Historically the register routes inserted a second row on re-signup after a
 * cancellation while reading back with a bare `.maybeSingle()`, which then errored
 * once two rows existed. Always read the latest row, and revive it rather than
 * inserting another (see insertOrReviveSignup).
 */
export async function loadLatestSignup(
  client: Client,
  eventId: number,
  playerId: number,
): Promise<LatestSignup | null> {
  const { data, error } = await client
    .from("signups_events")
    .select("id, status, pair_id, looking_for_partner")
    .eq("event_id", eventId)
    .eq("player_id", playerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    id: data.id as string,
    status: data.status as EventSignupStatus,
    pair_id: (data.pair_id as string | null) ?? null,
    looking_for_partner: Boolean(data.looking_for_partner),
  };
}

/**
 * Create the player's signup, or revive their existing cancelled/waitlisted row.
 * Never leaves two rows for one (event, player).
 */
export async function insertOrReviveSignup(
  client: Client,
  eventId: number,
  playerId: number,
  options: { lookingForPartner?: boolean; status?: EventSignupStatus } = {},
): Promise<{ id: string }> {
  const status = options.status ?? "applied";
  const lookingForPartner = options.lookingForPartner ?? false;
  const existing = await loadLatestSignup(client, eventId, playerId);

  if (existing) {
    const { data, error } = await client
      .from("signups_events")
      .update({
        status,
        looking_for_partner: lookingForPartner,
        // Any previous pair is finished by the time we revive a signup.
        pair_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return { id: data.id as string };
  }

  const { data, error } = await client
    .from("signups_events")
    .insert({
      event_id: eventId,
      player_id: playerId,
      status,
      looking_for_partner: lookingForPartner,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return { id: data.id as string };
}

/** Flag a signup as looking for a partner (clearing any stale pair_id first). */
export async function markLookingForPartner(
  client: Client,
  eventId: number,
  playerId: number,
  looking: boolean,
): Promise<void> {
  const patch: Record<string, unknown> = {
    looking_for_partner: looking,
    updated_at: new Date().toISOString(),
  };
  // The DB CHECK forbids pair_id alongside looking_for_partner.
  if (looking) patch.pair_id = null;

  const { error } = await client
    .from("signups_events")
    .update(patch)
    .eq("event_id", eventId)
    .eq("player_id", playerId)
    .neq("status", "cancelled");

  if (error) throw new Error(error.message);
}

/**
 * End a pair. Clears pair_id from both halves but never changes their signup
 * statuses — losing a partner must not cost anyone a spot they already hold.
 */
export async function cancelPair(
  client: Client,
  pair: PairRow,
  nextStatus: Extract<EventPairStatus, "cancelled" | "declined"> = "cancelled",
): Promise<void> {
  const { error: clearError } = await client
    .from("signups_events")
    .update({ pair_id: null, updated_at: new Date().toISOString() })
    .eq("pair_id", pair.id);
  if (clearError) throw new Error(clearError.message);

  const { error } = await client
    .from("event_signup_pairs")
    .update({
      status: nextStatus,
      responded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", pair.id);
  if (error) throw new Error(error.message);
}

/**
 * Confirm a pending pair: give the invitee a signup, stamp pair_id on both halves,
 * then flip the pair to 'accepted' LAST. A failure part-way through leaves a
 * retryable 'pending' pair rather than an 'accepted' pair with only one half.
 */
export async function acceptPair(
  client: Client,
  pair: PairRow,
): Promise<{ inviteeSignupId: string }> {
  const invitee = await insertOrReviveSignup(
    client,
    pair.event_id,
    pair.invitee_player_id,
  );

  const { error: stampError } = await client
    .from("signups_events")
    .update({
      pair_id: pair.id,
      looking_for_partner: false,
      updated_at: new Date().toISOString(),
    })
    .eq("event_id", pair.event_id)
    .in("player_id", [pair.initiator_player_id, pair.invitee_player_id])
    .neq("status", "cancelled");
  if (stampError) throw new Error(stampError.message);

  const { error } = await client
    .from("event_signup_pairs")
    .update({
      status: "accepted",
      responded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", pair.id);
  if (error) throw new Error(error.message);

  return { inviteeSignupId: invitee.id };
}

/** Apply a status to every non-cancelled half of a pair. Returns the updated rows. */
export async function applyStatusToPair(
  client: Client,
  pair: PairRow,
  status: EventSignupStatus,
): Promise<{ id: string; player_id: number | null; status: EventSignupStatus }[]> {
  const { data, error } = await client
    .from("signups_events")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("pair_id", pair.id)
    .select("id, player_id, status");

  if (error) throw new Error(error.message);
  return (data ?? []) as {
    id: string;
    player_id: number | null;
    status: EventSignupStatus;
  }[];
}
