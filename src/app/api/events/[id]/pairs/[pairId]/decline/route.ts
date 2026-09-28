import { NextResponse } from "next/server";
import { getServerServiceClient } from "@/app/api/_lib/supabase";
import { resolveCallerPlayerId } from "@/app/api/events/_lib/auth";
import {
  cancelPair,
  loadPairById,
  loadPlayers,
  markLookingForPartner,
} from "@/app/api/events/_lib/pairs";
import { notifyPairDeclined } from "@/lib/email/notifications/pairDeclined";

/** POST /api/events/[id]/pairs/[pairId]/decline — the invitee turns the invite down */
export async function POST(
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
  const callerPlayerId = await resolveCallerPlayerId(authorization);
  if (callerPlayerId === null) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const serviceClient = getServerServiceClient();

  const { data: event } = await serviceClient
    .from("events")
    .select("event_id, name")
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
    return NextResponse.json({ error: "Failed to load invite." }, { status: 500 });
  }

  if (!pair || pair.event_id !== eventId) {
    return NextResponse.json({ error: "Invite not found." }, { status: 404 });
  }
  if (pair.invitee_player_id !== callerPlayerId) {
    return NextResponse.json(
      { error: "This invite isn't addressed to you." },
      { status: 403 },
    );
  }
  if (pair.status !== "pending") {
    return NextResponse.json(
      { error: "This invite is no longer open." },
      { status: 409 },
    );
  }

  try {
    await cancelPair(serviceClient, pair, "declined");
    // The initiator keeps their spot and goes back into the solo pool.
    await markLookingForPartner(
      serviceClient,
      eventId,
      pair.initiator_player_id,
      true,
    );
  } catch (error) {
    console.error("Failed to decline pair:", error);
    return NextResponse.json(
      { error: "Failed to decline the invite. Please try again." },
      { status: 500 },
    );
  }

  const { data: initiator } = await serviceClient
    .from("players")
    .select("player_id, name, nickname, email")
    .eq("player_id", pair.initiator_player_id)
    .maybeSingle();

  const self = (await loadPlayers(serviceClient, [callerPlayerId])).get(callerPlayerId);

  if (initiator?.email) {
    await notifyPairDeclined({
      initiatorPlayerId: Number(initiator.player_id),
      initiatorEmail: initiator.email,
      initiatorName: initiator.name ?? null,
      initiatorNickname: initiator.nickname ?? null,
      partnerName: self?.name ?? null,
      partnerNickname: self?.nickname ?? null,
      eventId,
      eventName: event.name ?? null,
    }).catch((err) => console.error("[email] notifyPairDeclined failed:", err));
  }

  return NextResponse.json({ pair: { ...pair, status: "declined" } });
}
