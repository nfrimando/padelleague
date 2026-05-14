import { NextResponse } from "next/server";
import { getServerServiceClient } from "@/app/api/_lib/supabase";

type PlayerRegisterBody = {
  event_id?: unknown;
  player_id?: unknown;
};

export async function POST(request: Request) {
  let body: PlayerRegisterBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const eventId = typeof body.event_id === "number" ? body.event_id : null;
  const playerId = typeof body.player_id === "number" ? body.player_id : null;

  if (!eventId) {
    return NextResponse.json({ error: "event_id is required." }, { status: 400 });
  }

  if (!playerId) {
    return NextResponse.json({ error: "player_id is required." }, { status: 400 });
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

  const { data: event, error: eventError } = await serviceClient
    .from("events")
    .select("event_id, registration_status, deleted_at")
    .eq("event_id", eventId)
    .is("deleted_at", null)
    .eq("registration_status", "open")
    .maybeSingle();

  if (eventError || !event) {
    return NextResponse.json(
      { error: "Event not found or registration is closed." },
      { status: 404 },
    );
  }

  const { data: player, error: playerError } = await serviceClient
    .from("players")
    .select("player_id")
    .eq("player_id", playerId)
    .is("email", null)
    .eq("is_profile_complete", true)
    .maybeSingle();

  if (playerError) {
    return NextResponse.json(
      { error: "Failed to load selected player." },
      { status: 500 },
    );
  }

  if (!player) {
    return NextResponse.json(
      { error: "Selected player is unavailable for this signup path." },
      { status: 404 },
    );
  }

  const { data: existingSignup, error: existingSignupError } = await serviceClient
    .from("signups_events")
    .select("id, status")
    .eq("event_id", eventId)
    .eq("player_id", playerId)
    .maybeSingle();

  if (existingSignupError) {
    return NextResponse.json(
      { error: "Failed to validate existing signup." },
      { status: 500 },
    );
  }

  if (existingSignup) {
    if (
      existingSignup.status === "registered" ||
      existingSignup.status === "accepted"
    ) {
      return NextResponse.json(
        { error: "This player is already signed up for the event." },
        { status: 409 },
      );
    }
  }

  const { data: signup, error: signupError } = await serviceClient
    .from("signups_events")
    .insert({
      event_id: eventId,
      player_id: playerId,
      status: "registered",
    })
    .select("id")
    .single();

  if (signupError || !signup) {
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
