import { NextResponse } from "next/server";
import { getServerServiceClient } from "@/app/api/_lib/supabase";
import { resolveCallerPlayerId } from "@/app/api/events/_lib/auth";
import {
  cancelPair,
  loadLatestSignup,
  loadLivePairForPlayer,
  loadPlayers,
  markLookingForPartner,
  partnerIdOf,
} from "@/app/api/events/_lib/pairs";
import { notifyPartnerLeft } from "@/lib/email/notifications/partnerLeft";

/**
 * POST /api/events/[id]/signups/me/cancel — a player withdraws their own signup.
 *
 * Players previously had no way to withdraw at all; only the host could cancel a
 * signup. That becomes load-bearing with pairs, since leaving a pair means leaving
 * your own signup. A signup with a recorded payment needs the host (refunds).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const eventId = parseInt(id, 10);
  if (isNaN(eventId)) {
    return NextResponse.json({ error: "Invalid event ID." }, { status: 400 });
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

  let signup;
  try {
    signup = await loadLatestSignup(serviceClient, eventId, callerPlayerId);
  } catch (error) {
    console.error("Signup lookup failed:", error);
    return NextResponse.json({ error: "Failed to load your signup." }, { status: 500 });
  }

  if (!signup || signup.status === "cancelled") {
    return NextResponse.json(
      { error: "You're not signed up for this event." },
      { status: 404 },
    );
  }

  // Anything already paid for needs the host, so a refund isn't silently skipped.
  const { data: paidPayments } = await serviceClient
    .from("payments")
    .select("id")
    .eq("signup_id", signup.id)
    .eq("status", "paid")
    .limit(1);

  if ((paidPayments ?? []).length > 0) {
    return NextResponse.json(
      {
        error:
          "You've already paid for this event — message the host to withdraw and sort out a refund.",
        requiresHost: true,
      },
      { status: 409 },
    );
  }

  let pair;
  try {
    pair = await loadLivePairForPlayer(serviceClient, eventId, callerPlayerId);
  } catch (error) {
    console.error("Pair lookup failed:", error);
    return NextResponse.json({ error: "Failed to load your pair." }, { status: 500 });
  }

  const otherPlayerId = pair ? partnerIdOf(pair, callerPlayerId) : null;
  const notifyOther = pair?.status === "accepted";

  const { error: cancelError } = await serviceClient
    .from("signups_events")
    .update({
      status: "cancelled",
      looking_for_partner: false,
      pair_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", signup.id);

  if (cancelError) {
    console.error("Failed to cancel signup:", cancelError.message);
    return NextResponse.json(
      { error: "Failed to withdraw. Please try again." },
      { status: 500 },
    );
  }

  if (pair) {
    try {
      await cancelPair(serviceClient, pair, "cancelled");
      if (otherPlayerId !== null) {
        // The partner keeps their status and rejoins the solo pool.
        await markLookingForPartner(serviceClient, eventId, otherPlayerId, true);
      }
    } catch (error) {
      console.error("Failed to unwind pair after withdrawal:", error);
    }
  }

  if (notifyOther && otherPlayerId !== null) {
    const leaver = (await loadPlayers(serviceClient, [callerPlayerId])).get(
      callerPlayerId,
    );
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
        withdrew: true,
      }).catch((err) => console.error("[email] notifyPartnerLeft failed:", err));
    }
  }

  return NextResponse.json({ cancelled: true });
}
