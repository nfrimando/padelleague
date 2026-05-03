import { NextResponse } from "next/server";
import {
  getPaymentsServiceClient,
  getPaymentsUserClient,
} from "@/app/api/payments/_lib/supabase";

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
    userClient = getPaymentsUserClient(authorization);
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
  let body: { event_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const eventId = typeof body.event_id === "number" ? body.event_id : null;
  if (!eventId) {
    return NextResponse.json({ error: "event_id is required." }, { status: 400 });
  }

  let serviceClient;
  try {
    serviceClient = getPaymentsServiceClient();
  } catch (error) {
    console.error("Failed to initialize service Supabase client:", error);
    return NextResponse.json(
      { error: "Server misconfiguration." },
      { status: 500 },
    );
  }

  // 3. Find player by email
  let { data: player, error: playerLookupError } = await serviceClient
    .from("players")
    .select("player_id, name, email, is_profile_complete")
    .eq("email", user.email ?? "")
    .maybeSingle();

  if (playerLookupError) {
    console.error("Failed to lookup player:", playerLookupError.message);
    return NextResponse.json(
      { error: "Failed to lookup player profile." },
      { status: 500 },
    );
  }

  // 4. Auto-create player record when missing, then block pending verification
  if (!player) {
    const fullName: string =
      (user.user_metadata?.full_name as string | undefined)?.trim() ||
      user.email?.split("@")[0] ||
      "New Player";

    const nickname = fullName.split(" ")[0] ?? fullName;

    const { data: created, error: createError } = await serviceClient
      .from("players")
      .insert({
        name: fullName,
        nickname,
        email: user.email,
        image_link: (user.user_metadata?.avatar_url as string | undefined) ?? null,
        is_profile_complete: false,
        auto_renew_season: false,
      })
      .select("player_id, name, email, is_profile_complete")
      .single();

    if (createError || !created) {
      console.error("Failed to create player record:", createError?.message);
      return NextResponse.json(
        { error: "Failed to create player profile. Please try again." },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        error:
          "Your account is pending verification. An admin will approve it shortly.",
        pendingVerification: true,
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
    .select("event_id, requires_payment, registration_status, deleted_at")
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

  const requiresPayment = event.requires_payment === true;

  // 7. Existing signup checks
  const { data: existingSignup, error: existingSignupError } = await serviceClient
    .from("signups")
    .select("id, status")
    .eq("player_id", player.player_id)
    .eq("event_id", eventId)
    .maybeSingle();

  if (existingSignupError) {
    console.error("Existing signup lookup error:", existingSignupError.message);
    return NextResponse.json(
      { error: "Failed to validate existing signup." },
      { status: 500 },
    );
  }

  if (existingSignup) {
    if (existingSignup.status === "registered") {
      return NextResponse.json(
        { error: "You have already signed up for this event." },
        { status: 409 },
      );
    }

    if (existingSignup.status === "pending_payment") {
      if (requiresPayment) {
        return NextResponse.json(
          { requires_payment: true, pending: true },
          { status: 200 },
        );
      }

      const { error: deleteStaleSignupError } = await serviceClient
        .from("signups")
        .delete()
        .eq("id", existingSignup.id);

      if (deleteStaleSignupError) {
        console.error(
          "Failed to delete stale pending_payment signup:",
          deleteStaleSignupError.message,
        );
        return NextResponse.json(
          { error: "Failed to clean up stale signup." },
          { status: 500 },
        );
      }
    } else {
      return NextResponse.json(
        { error: "You have already signed up for this event." },
        { status: 409 },
      );
    }
  }

  // 8. Free vs paid branch
  if (!requiresPayment) {
    const { data: signup, error: signupError } = await serviceClient
      .from("signups")
      .insert({
        event_id: eventId,
        player_id: player.player_id,
        event_type: "event_registration",
        status: "registered",
      })
      .select("id")
      .single();

    if (signupError || !signup) {
      console.error("Failed to create free signup:", signupError?.message);
      return NextResponse.json(
        { error: "Failed to create signup." },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { registered: true, signup_id: signup.id },
      { status: 201 },
    );
  }

  return NextResponse.json({ requires_payment: true }, { status: 200 });
}
