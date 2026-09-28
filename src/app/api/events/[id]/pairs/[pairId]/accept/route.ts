import { NextResponse } from "next/server";
import { getServerServiceClient } from "@/app/api/_lib/supabase";
import { resolveCallerPlayerId } from "@/app/api/events/_lib/auth";
import { acceptPair, loadPairById, loadPlayers } from "@/app/api/events/_lib/pairs";
import { notifyPairAccepted } from "@/lib/email/notifications/pairAccepted";

/** POST /api/events/[id]/pairs/[pairId]/accept — the invitee confirms the pair */
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
    .select("event_id, name, registration_status, deleted_at")
    .eq("event_id", eventId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!event) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }
  if (event.registration_status !== "open") {
    return NextResponse.json(
      { error: "Registration for this event is closed." },
      { status: 409 },
    );
  }

  // The caller must be verified before accepting — accepting signs them up.
  const { data: caller } = await serviceClient
    .from("players")
    .select("player_id, is_profile_complete")
    .eq("player_id", callerPlayerId)
    .maybeSingle();

  if (!caller?.is_profile_complete) {
    return NextResponse.json(
      {
        error: "Your account is pending verification.",
        pendingVerification: true,
      },
      { status: 403 },
    );
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
  if (pair.status === "accepted") {
    return NextResponse.json({ pair, alreadyAccepted: true });
  }
  if (pair.status !== "pending") {
    return NextResponse.json(
      { error: "This invite is no longer open." },
      { status: 409 },
    );
  }

  let inviteeSignupId: string;
  try {
    ({ inviteeSignupId } = await acceptPair(serviceClient, pair));
  } catch (error) {
    console.error("Failed to accept pair:", error);
    return NextResponse.json(
      { error: "Failed to accept the invite. Please try again." },
      { status: 500 },
    );
  }

  const { data: initiator } = await serviceClient
    .from("players")
    .select("player_id, name, nickname, email")
    .eq("player_id", pair.initiator_player_id)
    .maybeSingle();

  const partners = await loadPlayers(serviceClient, [callerPlayerId]);
  const self = partners.get(callerPlayerId) ?? null;

  if (initiator?.email) {
    await notifyPairAccepted({
      initiatorPlayerId: Number(initiator.player_id),
      initiatorEmail: initiator.email,
      initiatorName: initiator.name ?? null,
      initiatorNickname: initiator.nickname ?? null,
      partnerName: self?.name ?? null,
      partnerNickname: self?.nickname ?? null,
      eventId,
      eventName: event.name ?? null,
    }).catch((err) => console.error("[email] notifyPairAccepted failed:", err));
  }

  return NextResponse.json({
    pair: { ...pair, status: "accepted" },
    signup_id: inviteeSignupId,
  });
}
