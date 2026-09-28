import { NextResponse } from "next/server";
import {
  getAuthorizedAdminClient,
  normalizeRequiredPositiveInteger,
} from "@/app/api/admin/_lib/auth";
import {
  insertOrReviveSignup,
  loadLatestSignup,
} from "@/app/api/events/_lib/pairs";

type SignupStatus = "applied" | "pending_payment" | "accepted" | "waitlisted" | "cancelled";

const ALLOWED_SIGNUP_STATUSES: SignupStatus[] = [
  "applied",
  "pending_payment",
  "accepted",
  "waitlisted",
  "cancelled",
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
      "id,player_id,event_id,status,pair_id,looking_for_partner,applicant_name,applicant_contact,applicant_email,created_at,updated_at,player:player_id(player_id,name,email,nickname,image_link)",
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
        ? "applied"
        : null;

  if (!status) {
    return NextResponse.json(
      {
        error:
          "status must be one of applied, pending_payment, accepted, waitlisted, cancelled.",
      },
      { status: 400 },
    );
  }

  const { supabase } = authResult;

  const { data: eventRow, error: eventError } = await supabase
    .from("events")
    .select("event_id, signup_mode")
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

  let existingSignup;
  try {
    existingSignup = await loadLatestSignup(supabase, eventId, playerId);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Lookup failed." },
      { status: 500 },
    );
  }

  // A cancelled or waitlisted row is revived rather than duplicated; anything live
  // is a genuine conflict.
  if (
    existingSignup &&
    existingSignup.status !== "cancelled" &&
    existingSignup.status !== "waitlisted"
  ) {
    return NextResponse.json(
      { error: "Signup already exists for this player and event." },
      { status: 409 },
    );
  }

  let created;
  try {
    created = await insertOrReviveSignup(supabase, eventId, playerId, {
      status,
      lookingForPartner: eventRow.signup_mode === "paired",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create signup." },
      { status: 500 },
    );
  }

  const { data, error } = await supabase
    .from("signups_events")
    .select("*")
    .eq("id", created.id)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || "Failed to create signup." },
      { status: 500 },
    );
  }

  return NextResponse.json({ signup: data }, { status: 201 });
}
