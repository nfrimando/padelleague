import { NextResponse } from "next/server";
import {
  getServerServiceClient,
  getServerUserClient,
} from "@/app/api/_lib/supabase";

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
    .select("event_id, registration_status, deleted_at, restrictions")
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

  // 6a. Restrictions check
  const restrictions = event.restrictions as {
    min_rating?: number | null;
    max_rating?: number | null;
    max_games_per_player?: number | null;
  } | null;

  if (restrictions) {
    const hasRatingGate =
      (restrictions.min_rating != null) || (restrictions.max_rating != null);

    if (hasRatingGate) {
      const { data: ratingRow } = await serviceClient
        .from("match_player_ratings")
        .select("rating_post, formula_name")
        .eq("player_id", player.player_id)
        .in("formula_name", ["v3", "v2"])
        .order("formula_name", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const currentRating = ratingRow?.rating_post ?? null;

      if (currentRating == null) {
        return NextResponse.json(
          {
            error: "This event has a rating requirement, but you have no rated matches yet.",
            ineligible: true,
            reason: "no_rating",
          },
          { status: 403 },
        );
      }

      if (restrictions.min_rating != null && currentRating < restrictions.min_rating) {
        return NextResponse.json(
          {
            error: `Your current rating (${currentRating.toFixed(0)}) is below the minimum required (${restrictions.min_rating}) for this event.`,
            ineligible: true,
            reason: "rating_too_low",
          },
          { status: 403 },
        );
      }

      if (restrictions.max_rating != null && currentRating > restrictions.max_rating) {
        return NextResponse.json(
          {
            error: `Your current rating (${currentRating.toFixed(0)}) exceeds the maximum allowed (${restrictions.max_rating}) for this event.`,
            ineligible: true,
            reason: "rating_too_high",
          },
          { status: 403 },
        );
      }
    }

    if (restrictions.max_games_per_player != null) {
      const { count, error: countError } = await serviceClient
        .from("signups_events")
        .select("id", { count: "exact", head: true })
        .eq("event_id", eventId)
        .eq("player_id", player.player_id)
        .in("status", ["accepted"]);

      if (!countError && (count ?? 0) >= restrictions.max_games_per_player) {
        return NextResponse.json(
          {
            error: `You have reached the maximum of ${restrictions.max_games_per_player} game(s) allowed for this event.`,
            ineligible: true,
            reason: "games_limit_reached",
          },
          { status: 403 },
        );
      }
    }
  }

  // 7. Existing signup checks
  const { data: existingSignup, error: existingSignupError } = await serviceClient
    .from("signups_events")
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
    if (
      existingSignup.status === "applied" ||
      existingSignup.status === "pending_payment" ||
      existingSignup.status === "accepted"
    ) {
      return NextResponse.json(
        { error: "You have already signed up for this event." },
        { status: 409 },
      );
    }
    // For waitlisted/cancelled, allow re-signup
  }

  // 8. Create signup with status applied
  const { data: signup, error: signupError } = await serviceClient
    .from("signups_events")
    .insert({
      event_id: eventId,
      player_id: player.player_id,
      status: "applied",
    })
    .select("id")
    .single();

  if (signupError || !signup) {
    console.error("Failed to create signup:", signupError?.message);
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
