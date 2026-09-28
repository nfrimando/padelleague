import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventSignupStatus } from "@/lib/eventSignupStatus";
import {
  cancelPair,
  loadPairForSignup,
  markLookingForPartner,
  partnerIdOf,
  type PairRow,
} from "./pairs";
import { notifySignupPaymentRequired } from "@/lib/email/notifications/signupPaymentRequired";
import { notifySignupAccepted } from "@/lib/email/notifications/signupAccepted";
import { notifyPartnerLeft } from "@/lib/email/notifications/partnerLeft";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, "public", any>;

export type UpdatedSignup = {
  id: string;
  player_id: number | null;
  status: EventSignupStatus;
  pair_id: string | null;
  looking_for_partner: boolean | null;
  event_id: number;
  created_at: string;
  updated_at: string;
};

export type ApplyStatusResult = {
  signups: UpdatedSignup[];
  /** the row the caller named, for callers that still read a single `signup` */
  primary: UpdatedSignup | null;
  pair: PairRow | null;
  warning: string | null;
};

const SIGNUP_COLUMNS =
  "id, player_id, status, pair_id, looking_for_partner, event_id, created_at, updated_at";

/**
 * Set a signup's status, carrying the change across a confirmed pair unless the
 * caller opts out. Emails are sent one recipient at a time — Resend allows 2
 * requests/second and `sendEmail` serializes on module state, so never Promise.all.
 */
export async function applySignupStatus({
  client,
  eventId,
  eventName,
  signupId,
  status,
  applyToPartner = true,
}: {
  client: Client;
  eventId: number;
  eventName: string | null;
  signupId: string;
  status: EventSignupStatus;
  applyToPartner?: boolean;
}): Promise<ApplyStatusResult | { notFound: true }> {
  const { data: beforeRow } = await client
    .from("signups_events")
    .select(SIGNUP_COLUMNS)
    .eq("id", signupId)
    .eq("event_id", eventId)
    .maybeSingle();

  if (!beforeRow) return { notFound: true };

  const pair = await loadPairForSignup(client, signupId);
  const targetIds = [signupId];

  if (pair && applyToPartner) {
    const { data: siblings } = await client
      .from("signups_events")
      .select("id")
      .eq("pair_id", pair.id)
      .neq("id", signupId);
    for (const sibling of siblings ?? []) targetIds.push(sibling.id as string);
  }

  // Remember each row's previous status so the "no email when unchanged" guard can
  // be applied per member — otherwise a bulk apply over both halves double-emails.
  const { data: beforeRows } = await client
    .from("signups_events")
    .select(SIGNUP_COLUMNS)
    .in("id", targetIds);

  const statusBefore = new Map<string, EventSignupStatus>();
  for (const row of (beforeRows ?? []) as UpdatedSignup[]) {
    statusBefore.set(row.id, row.status);
  }

  const { data: updatedRows, error } = await client
    .from("signups_events")
    .update({ status, updated_at: new Date().toISOString() })
    .in("id", targetIds)
    .select(SIGNUP_COLUMNS);

  if (error) throw new Error(error.message);

  const signups = (updatedRows ?? []) as UpdatedSignup[];
  const primary = signups.find((s) => s.id === signupId) ?? null;
  let warning: string | null = null;

  // Cancelling unwinds the pair. Whoever is left keeps their own status.
  if (status === "cancelled" && pair) {
    const survivorPlayerId =
      primary?.player_id != null && !applyToPartner
        ? partnerIdOf(pair, Number(primary.player_id))
        : null;

    await cancelPair(client, pair, "cancelled");

    if (survivorPlayerId !== null) {
      await markLookingForPartner(client, eventId, survivorPlayerId, true);
      await notifyPartnerRemoved(client, {
        eventId,
        eventName,
        survivorPlayerId,
        leaverPlayerId: Number(primary!.player_id),
      });
    }
  }

  if (pair && !applyToPartner && status !== "cancelled") {
    warning = "Only this player was updated — their partner is unchanged.";
  }

  // Status emails, one recipient at a time.
  if (status === "pending_payment" || status === "accepted") {
    for (const row of signups) {
      if (row.player_id == null) continue;
      if (statusBefore.get(row.id) === status) continue;

      const { data: player } = await client
        .from("players")
        .select("name, nickname, email")
        .eq("player_id", row.player_id)
        .maybeSingle();

      if (!player?.email) continue;

      const notifyData = {
        playerId: Number(row.player_id),
        playerEmail: player.email as string,
        playerName: (player.name as string | null) ?? null,
        playerNickname: (player.nickname as string | null) ?? null,
        eventId,
        eventName,
      };

      if (status === "pending_payment") {
        await notifySignupPaymentRequired(notifyData).catch((err) =>
          console.error("[email] notifySignupPaymentRequired failed:", err),
        );
      } else {
        await notifySignupAccepted(notifyData).catch((err) =>
          console.error("[email] notifySignupAccepted failed:", err),
        );
      }
    }
  }

  return { signups, primary, pair, warning };
}

async function notifyPartnerRemoved(
  client: Client,
  {
    eventId,
    eventName,
    survivorPlayerId,
    leaverPlayerId,
  }: {
    eventId: number;
    eventName: string | null;
    survivorPlayerId: number;
    leaverPlayerId: number;
  },
): Promise<void> {
  const { data: people } = await client
    .from("players")
    .select("player_id, name, nickname, email")
    .in("player_id", [survivorPlayerId, leaverPlayerId]);

  const survivor = (people ?? []).find(
    (p) => Number(p.player_id) === survivorPlayerId,
  );
  const leaver = (people ?? []).find((p) => Number(p.player_id) === leaverPlayerId);

  if (!survivor?.email) return;

  await notifyPartnerLeft({
    playerId: survivorPlayerId,
    playerEmail: survivor.email as string,
    playerName: (survivor.name as string | null) ?? null,
    playerNickname: (survivor.nickname as string | null) ?? null,
    partnerName: (leaver?.name as string | null) ?? null,
    partnerNickname: (leaver?.nickname as string | null) ?? null,
    eventId,
    eventName,
    withdrew: true,
  }).catch((err) => console.error("[email] notifyPartnerLeft failed:", err));
}
