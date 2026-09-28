import { NextResponse } from "next/server";
import { getServerServiceClient } from "@/app/api/_lib/supabase";
import { isAdminUser, resolveCallerPlayerId } from "@/app/api/events/_lib/auth";
import {
  cancelPair,
  loadPairById,
  loadPlayers,
  markLookingForPartner,
  partnerIdOf,
} from "@/app/api/events/_lib/pairs";
import { notifyPartnerLeft } from "@/lib/email/notifications/partnerLeft";

/**
 * DELETE /api/events/[id]/pairs/[pairId]
 *
 * Cancels a pending invite or breaks up a confirmed pair. Nobody's signup status
 * changes — losing a partner must not cost either player a spot they already hold.
 * Callable by either member, or by the event host/an admin.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; pairId: string }> },
) {
  const { id, pairId: rawPairId } = await params;
  const eventId = parseInt(id, 10);
  const pairId = rawPairId.trim();
  if (isNaN(eventId) || !pairId) {
    return NextResponse.json(
      { error: "Invalid event or invite ID." },
      { status: 400 },
    );
  }

  const authorization = request.headers.get("authorization");
  const [callerPlayerId, adminFlag] = await Promise.all([
    resolveCallerPlayerId(authorization),
    isAdminUser(authorization),
  ]);

  if (callerPlayerId === null && !adminFlag) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const serviceClient = getServerServiceClient();

  const { data: event } = await serviceClient
    .from("events")
    .select("event_id, name, created_by_player_id")
    .eq("event_id", eventId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!event) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }

  let pair;
  try {
    pair = await loadPairById(serviceClient, pairId);
  } catch (error) {
    console.error("Pair lookup failed:", error);
    return NextResponse.json({ error: "Failed to load pair." }, { status: 500 });
  }

  if (!pair || pair.event_id !== eventId) {
    return NextResponse.json({ error: "Pair not found." }, { status: 404 });
  }
  if (pair.status !== "pending" && pair.status !== "accepted") {
    return NextResponse.json({ pair, alreadyEnded: true });
  }

  const isMember =
    callerPlayerId !== null &&
    (pair.initiator_player_id === callerPlayerId ||
      pair.invitee_player_id === callerPlayerId);
  const isHost =
    adminFlag ||
    (callerPlayerId !== null && callerPlayerId === event.created_by_player_id);

  if (!isMember && !isHost) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const wasAccepted = pair.status === "accepted";

  try {
    await cancelPair(serviceClient, pair, "cancelled");
    // Both halves go back into the solo pool. For a pending invite only the
    // initiator has a signup, and markLookingForPartner is a no-op for the other.
    await markLookingForPartner(serviceClient, eventId, pair.initiator_player_id, true);
    await markLookingForPartner(serviceClient, eventId, pair.invitee_player_id, true);
  } catch (error) {
    console.error("Failed to cancel pair:", error);
    return NextResponse.json(
      { error: "Failed to update the pair. Please try again." },
      { status: 500 },
    );
  }

  // Only a confirmed pair breaking up is worth an email; a cancelled invite that
  // was never accepted isn't news to the invitee.
  if (wasAccepted && callerPlayerId !== null && isMember) {
    const otherPlayerId = partnerIdOf(pair, callerPlayerId);
    const people = await loadPlayers(serviceClient, [callerPlayerId, otherPlayerId]);
    const leaver = people.get(callerPlayerId) ?? null;

    const { data: other } = await serviceClient
      .from("players")
      .select("player_id, name, nickname, email")
      .eq("player_id", otherPlayerId)
      .maybeSingle();

    if (other?.email) {
      await notifyPartnerLeft({
        playerId: Number(other.player_id),
        playerEmail: other.email,
        playerName: other.name ?? null,
        playerNickname: other.nickname ?? null,
        partnerName: leaver?.name ?? null,
        partnerNickname: leaver?.nickname ?? null,
        eventId,
        eventName: event.name ?? null,
        withdrew: false,
      }).catch((err) => console.error("[email] notifyPartnerLeft failed:", err));
    }
  }

  return NextResponse.json({ pair: { ...pair, status: "cancelled" } });
}
