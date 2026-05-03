import { NextResponse } from "next/server";
import {
  getAuthorizedAdminClient,
  normalizeRequiredPositiveInteger,
} from "@/app/api/admin/_lib/auth";

type SignupStatus =
  | "registered"
  | "accepted"
  | "waitlisted"
  | "cancelled"
  | "pending_payment";

const ALLOWED_SIGNUP_STATUSES: SignupStatus[] = [
  "registered",
  "accepted",
  "waitlisted",
  "cancelled",
  "pending_payment",
];

/** GET /api/admin/signups?event_id=123 — list signups for an event */
export async function GET(request: Request) {
  const authResult = await getAuthorizedAdminClient(request);
  if (!authResult.ok) return authResult.response;

  const url = new URL(request.url);
  const rawEventId = url.searchParams.get("event_id");
  const eventId = normalizeRequiredPositiveInteger(rawEventId);

  if (eventId === null) {
    return NextResponse.json({ error: "event_id is required." }, { status: 400 });
  }

  const { supabase } = authResult;

  const { data, error } = await supabase
    .from("signups_events")
    .select(
      "id,player_id,event_id,status,applicant_name,applicant_contact,applicant_email,created_at,updated_at,player:player_id(player_id,name,email,nickname,image_link)",
    )
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ signups: data ?? [] });
}

/** POST /api/admin/signups — create signup directly
 *  Body: { event_id, player_id, status? }
 */
export async function POST(request: Request) {
  const authResult = await getAuthorizedAdminClient(request);
  if (!authResult.ok) return authResult.response;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const eventId = normalizeRequiredPositiveInteger(body.event_id);
  if (eventId === null) {
    return NextResponse.json({ error: "event_id is required." }, { status: 400 });
  }

  const playerId = normalizeRequiredPositiveInteger(body.player_id);
  if (playerId === null) {
    return NextResponse.json({ error: "player_id is required." }, { status: 400 });
  }

  const statusRaw = body.status;
  const status =
    typeof statusRaw === "string" && ALLOWED_SIGNUP_STATUSES.includes(statusRaw as SignupStatus)
      ? (statusRaw as SignupStatus)
      : statusRaw === undefined
        ? "registered"
        : null;

  if (!status) {
    return NextResponse.json(
      {
        error:
          "status must be one of registered, accepted, waitlisted, cancelled, pending_payment.",
      },
      { status: 400 },
    );
  }

  const { supabase } = authResult;

  const { data: eventRow, error: eventError } = await supabase
    .from("events")
    .select("event_id")
    .eq("event_id", eventId)
    .is("deleted_at", null)
    .maybeSingle();

  if (eventError) {
    return NextResponse.json({ error: eventError.message }, { status: 500 });
  }

  if (!eventRow) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }

  const { data: playerRow, error: playerError } = await supabase
    .from("players")
    .select("player_id")
    .eq("player_id", playerId)
    .maybeSingle();

  if (playerError) {
    return NextResponse.json({ error: playerError.message }, { status: 500 });
  }

  if (!playerRow) {
    return NextResponse.json({ error: "Player not found." }, { status: 404 });
  }

  const { data: existingSignup, error: existingError } = await supabase
    .from("signups_events")
    .select("id")
    .eq("event_id", eventId)
    .eq("player_id", playerId)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  if (existingSignup) {
    return NextResponse.json(
      { error: "Signup already exists for this player and event." },
      { status: 409 },
    );
  }

  const { data, error } = await supabase
    .from("signups_events")
    .insert({
      event_id: eventId,
      player_id: playerId,
      status,
    })
    .select("*")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || "Failed to create signup." },
      { status: 500 },
    );
  }

  return NextResponse.json({ signup: data }, { status: 201 });
}
