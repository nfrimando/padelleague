import { NextResponse } from "next/server";
import {
  getServerServiceClient,
  getServerUserClient,
} from "@/app/api/_lib/supabase";
import {
  insertOrReviveSignup,
  loadLatestSignup,
  loadLivePairForPlayer,
  loadPlayers,
} from "@/app/api/events/_lib/pairs";
import { notifyPairInvite } from "@/lib/email/notifications/pairInvite";

/**
 * POST /api/events/register
 * Body: { event_id, partner_player_id?, looking_for_partner? }
 *
 * On a 'paired' event the caller either names a partner (creating a pending invite
 * the partner must accept) or signs up solo flagged as looking for one.
 */
export async function POST(request: Request) {
  // 1. Authenticate
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Missing or invalid Authorization header." },
      { status: 401 },
    );
  }

  let userClient;
  try {
    userClient = getServerUserClient(authorization);
  } catch (error) {
    console.error("Failed to initialize user Supabase client:", error);
    return NextResponse.json(
      { error: "Server misconfiguration." },
      { status: 500 },
    );
  }

  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // 2. Parse body
  let body: {
    event_id?: unknown;
    partner_player_id?: unknown;
    looking_for_partner?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const eventId = typeof body.event_id === "number" ? body.event_id : null;
  if (!eventId) {
    return NextResponse.json({ error: "event_id is required." }, { status: 400 });
  }

  const partnerPlayerId =
    typeof body.partner_player_id === "number" ? body.partner_player_id : null;
  const wantsLookingForPartner = body.looking_for_partner === true;

  let serviceClient;
  try {
    serviceClient = getServerServiceClient();
  } catch (error) {
    console.error("Failed to initialize service Supabase client:", error);
    return NextResponse.json(
      { error: "Server misconfiguration." },
      { status: 500 },
    );
  }

  // 3. Find player by email
  const { data: player, error: playerLookupError } = await serviceClient
    .from("players")
    .select("player_id, name, nickname, email, is_profile_complete")
    .eq("email", user.email ?? "")
    .maybeSingle();

  if (playerLookupError) {
    console.error("Failed to lookup player:", playerLookupError.message);
    return NextResponse.json(
      { error: "Failed to lookup player profile." },
      { status: 500 },
    );
  }

  // 4. No player linked to this email — send them to /join to claim or create profile
  if (!player) {
    return NextResponse.json(
      {
        error:
          "No player profile is linked to your account. Go to /join to claim an existing profile or create a new player profile.",
        noProfile: true,
      },
      { status: 403 },
    );
  }

  // 5. Existing but unverified player
  if (!player.is_profile_complete) {
    return NextResponse.json(
      {
        error:
          "Your account is pending verification. An admin will approve it shortly.",
        pendingVerification: true,
      },
      { status: 403 },
    );
  }

  // 6. Load event (must exist, not soft-deleted, and registration open)
  const { data: event, error: eventError } = await serviceClient
    .from("events")
    .select(
      "event_id, name, registration_status, deleted_at, signup_mode, registration_fee",
    )
    .eq("event_id", eventId)
    .is("deleted_at", null)
    .eq("registration_status", "open")
    .maybeSingle();

  if (eventError || !event) {
    console.error("Event lookup error:", eventError?.message);
    return NextResponse.json(
      { error: "Event not found or registration is closed." },
      { status: 404 },
    );
  }

  const isPaired = event.signup_mode === "paired";

  // 7. Mode validation
  if (!isPaired && partnerPlayerId !== null) {
    return NextResponse.json(
      { error: "This event isn't a paired event — sign up individually." },
      { status: 400 },
    );
  }

  if (isPaired && partnerPlayerId === null && !wantsLookingForPartner) {
    return NextResponse.json(
      { error: "Choose a partner, or sign up looking for one." },
      { status: 400 },
    );
  }

  if (partnerPlayerId === player.player_id) {
    return NextResponse.json(
      { error: "You can't pair with yourself." },
      { status: 400 },
    );
  }

  // 8. Existing signup checks — always read the latest row
  let existingSignup;
  try {
    existingSignup = await loadLatestSignup(
      serviceClient,
      eventId,
      player.player_id,
    );
  } catch (error) {
    console.error("Existing signup lookup error:", error);
    return NextResponse.json(
      { error: "Failed to validate existing signup." },
      { status: 500 },
    );
  }

  const hasLiveSignup =
    existingSignup !== null &&
    existingSignup.status !== "cancelled" &&
    existingSignup.status !== "waitlisted";

  // A solo signup looking for a partner may pair up through this same endpoint;
  // any other live signup is a duplicate.
  const isUpgradingSoloToPair =
    hasLiveSignup &&
    isPaired &&
    partnerPlayerId !== null &&
    existingSignup!.looking_for_partner &&
    existingSignup!.pair_id === null;

  if (hasLiveSignup && !isUpgradingSoloToPair) {
    return NextResponse.json(
      { error: "You have already signed up for this event." },
      { status: 409 },
    );
  }

  // 9. Partner validation + pair creation
  let pairId: string | null = null;
  let partnerRow: {
    player_id: number;
    name: string | null;
    nickname: string | null;
    email: string | null;
  } | null = null;

  if (partnerPlayerId !== null) {
    const { data: partner, error: partnerError } = await serviceClient
      .from("players")
      .select("player_id, name, nickname, email, is_profile_complete")
      .eq("player_id", partnerPlayerId)
      .maybeSingle();

    if (partnerError) {
      return NextResponse.json(
        { error: "Failed to look up your partner." },
        { status: 500 },
      );
    }
    if (!partner || !partner.is_profile_complete) {
      return NextResponse.json(
        { error: "That player isn't a verified member yet." },
        { status: 404 },
      );
    }

    partnerRow = {
      player_id: Number(partner.player_id),
      name: partner.name ?? null,
      nickname: partner.nickname ?? null,
      email: partner.email ?? null,
    };

    try {
      // The partial unique indexes cover each seat separately, so check both.
      const callerPair = await loadLivePairForPlayer(
        serviceClient,
        eventId,
        player.player_id,
      );
      if (callerPair) {
        return NextResponse.json(
          {
            error:
              callerPair.status === "accepted"
                ? "You already have a partner for this event."
                : "You already have a pending partner invite for this event.",
          },
          { status: 409 },
        );
      }

      const partnerPair = await loadLivePairForPlayer(
        serviceClient,
        eventId,
        partnerPlayerId,
      );
      if (partnerPair) {
        const partnerLabel = partnerRow.nickname ?? partnerRow.name ?? "That player";
        // They may already have invited the caller — point them at it.
        if (
          partnerPair.status === "pending" &&
          partnerPair.initiator_player_id === partnerPlayerId &&
          partnerPair.invitee_player_id === player.player_id
        ) {
          return NextResponse.json(
            {
              error: `${partnerLabel} already invited you — check your dashboard to accept.`,
              inviteFromPartner: true,
            },
            { status: 409 },
          );
        }
        return NextResponse.json(
          {
            error: `${partnerLabel} already has a partner or a pending invite for this event.`,
            partnerUnavailable: true,
          },
          { status: 409 },
        );
      }

      const partnerSignup = await loadLatestSignup(
        serviceClient,
        eventId,
        partnerPlayerId,
      );
      const partnerHasLiveSignup =
        partnerSignup !== null &&
        partnerSignup.status !== "cancelled" &&
        partnerSignup.status !== "waitlisted";

      // Someone already signed up and looking for a partner is exactly who we want
      // to be able to invite; anyone else already holds a spot of their own.
      if (partnerHasLiveSignup && !partnerSignup!.looking_for_partner) {
        return NextResponse.json(
          {
            error: `${partnerRow.nickname ?? partnerRow.name ?? "That player"} is already signed up for this event.`,
            partnerAlreadySignedUp: true,
          },
          { status: 409 },
        );
      }
    } catch (error) {
      console.error("Partner validation failed:", error);
      return NextResponse.json(
        { error: "Failed to validate your partner." },
        { status: 500 },
      );
    }

    const { data: pair, error: pairError } = await serviceClient
      .from("event_signup_pairs")
      .insert({
        event_id: eventId,
        initiator_player_id: player.player_id,
        invitee_player_id: partnerPlayerId,
        status: "pending",
      })
      .select("id")
      .single();

    if (pairError || !pair) {
      console.error("Failed to create pair:", pairError?.message);
      return NextResponse.json(
        { error: "Failed to send the partner invite." },
        { status: 500 },
      );
    }
    pairId = pair.id as string;
  }

  // 10. Create or revive the caller's own signup.
  // pair_id stays null until the invite is accepted, so an initiator waiting on a
  // reply is stored the same way as a solo signup looking for a partner.
  const lookingForPartner = isPaired;
  let signup;
  try {
    signup = await insertOrReviveSignup(serviceClient, eventId, player.player_id, {
      lookingForPartner,
      // A solo player adding a partner keeps whatever status they already hold —
      // finding a partner must never cost them an approved or paid spot.
      status: isUpgradingSoloToPair ? existingSignup!.status : "applied",
    });
  } catch (error) {
    console.error("Failed to create signup:", error);
    // Don't leave an orphan invite behind.
    if (pairId) {
      await serviceClient
        .from("event_signup_pairs")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", pairId);
    }
    return NextResponse.json(
      { error: "Failed to create signup." },
      { status: 500 },
    );
  }

  if (pairId && partnerRow?.email) {
    await notifyPairInvite({
      inviteePlayerId: partnerRow.player_id,
      inviteeEmail: partnerRow.email,
      inviteeName: partnerRow.name,
      inviteeNickname: partnerRow.nickname,
      initiatorName: player.name ?? null,
      initiatorNickname: player.nickname ?? null,
      eventId,
      eventName: event.name ?? null,
      registrationFee: event.registration_fee ?? null,
    }).catch((err) => console.error("[email] notifyPairInvite failed:", err));
  }

  const partnerView =
    pairId && partnerRow
      ? {
          pair_id: pairId,
          status: "pending" as const,
          role: "initiator" as const,
          partner: (await loadPlayers(serviceClient, [partnerRow.player_id])).get(
            partnerRow.player_id,
          ) ?? null,
        }
      : null;

  return NextResponse.json(
    {
      registered: true,
      signup_id: signup.id,
      looking_for_partner: lookingForPartner,
      pair: partnerView,
    },
    { status: 201 },
  );
}
