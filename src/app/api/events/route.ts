import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getServerServiceClient,
  getServerUserClient,
} from "@/app/api/_lib/supabase";
import { EventRestrictions } from "@/lib/types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** GET /api/events — public list of all published, non-deleted events */
export async function GET() {
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const { data, error } = await supabase
    .from("events")
    .select("*")
    .is("deleted_at", null)
    .eq("visibility", "published")
    .order("start_date", { ascending: false, nullsFirst: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ events: data ?? [] });
}

/**
 * POST /api/events — create a draft event (requires auth, linked player only)
 * Body: { name, start_date, signup_deadline, end_date?, format?, player_limit?,
 *         min_rating?, max_rating?, description?, notes?, image_url? }
 */
export async function POST(request: Request) {
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
  } catch {
    return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });
  }

  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const start_date = typeof body.start_date === "string" ? body.start_date.trim() : "";
  const signup_deadline = typeof body.signup_deadline === "string" ? body.signup_deadline.trim() : "";

  if (!name) return NextResponse.json({ error: "name is required." }, { status: 400 });
  if (!start_date) return NextResponse.json({ error: "start_date is required." }, { status: 400 });
  if (!signup_deadline) return NextResponse.json({ error: "signup_deadline is required." }, { status: 400 });

  const end_date = typeof body.end_date === "string" && body.end_date.trim() ? body.end_date.trim() : null;
  const format = typeof body.format === "string" && body.format.trim() ? body.format.trim() : null;
  const player_limit = typeof body.player_limit === "number" && body.player_limit > 0 ? body.player_limit : null;
  const description = typeof body.description === "string" && body.description.trim() ? body.description.trim() : null;
  const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;
  const image_url = typeof body.image_url === "string" && body.image_url.trim() ? body.image_url.trim() : null;

  const restrictions: EventRestrictions = {};
  const minRating = typeof body.min_rating === "number" ? body.min_rating : null;
  const maxRating = typeof body.max_rating === "number" ? body.max_rating : null;
  if (minRating !== null) restrictions.min_rating = minRating;
  if (maxRating !== null) restrictions.max_rating = maxRating;

  let serviceClient;
  try {
    serviceClient = getServerServiceClient();
  } catch {
    return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });
  }

  const { data: player, error: playerError } = await serviceClient
    .from("players")
    .select("player_id, is_profile_complete")
    .eq("email", user.email ?? "")
    .maybeSingle();

  if (playerError) {
    console.error("Player lookup error:", playerError.message);
    return NextResponse.json({ error: "Failed to verify player profile." }, { status: 500 });
  }
  if (!player) {
    return NextResponse.json(
      { error: "No player profile linked to your account." },
      { status: 403 },
    );
  }
  if (!player.is_profile_complete) {
    return NextResponse.json(
      { error: "Your account is pending verification." },
      { status: 403 },
    );
  }

  const { data: event, error: insertError } = await serviceClient
    .from("events")
    .insert({
      name,
      start_date,
      signup_deadline,
      end_date,
      format,
      player_limit,
      description,
      notes,
      image_url,
      restrictions: Object.keys(restrictions).length > 0 ? restrictions : null,
      visibility: "draft",
      created_by_player_id: player.player_id,
      event_type: "open_event",
      registration_status: "open",
      status: "upcoming",
    })
    .select("*")
    .single();

  if (insertError || !event) {
    console.error("Failed to create draft event:", insertError?.message);
    return NextResponse.json({ error: "Failed to create event." }, { status: 500 });
  }

  return NextResponse.json({ event }, { status: 201 });
}
