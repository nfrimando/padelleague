import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerServiceClient } from "@/app/api/_lib/supabase";
import { resolveCallerPlayerId, isAdminUser } from "@/app/api/events/_lib/auth";
import { EventRestrictions } from "@/lib/types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** GET /api/events/[id] */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const eventId = parseInt(id, 10);
  if (isNaN(eventId)) {
    return NextResponse.json({ error: "Invalid event ID." }, { status: 400 });
  }

  const anonClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data: event, error } = await anonClient
    .from("events")
    .select(
      "*, creator:players!created_by_player_id(player_id,name,nickname,image_link)",
    )
    .eq("event_id", eventId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!event) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }

  // Published events are public
  if (event.visibility === "published") {
    return NextResponse.json({ event });
  }

  // Draft events: only creator or admin can view
  const authorization = request.headers.get("authorization");
  const [playerId, adminFlag] = await Promise.all([
    resolveCallerPlayerId(authorization),
    isAdminUser(authorization),
  ]);

  if (!adminFlag && playerId !== event.created_by_player_id) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }

  return NextResponse.json({ event });
}

/** PATCH /api/events/[id] — creator (own draft) or admin can update */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const eventId = parseInt(id, 10);
  if (isNaN(eventId)) {
    return NextResponse.json({ error: "Invalid event ID." }, { status: 400 });
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const [playerId, adminFlag] = await Promise.all([
    resolveCallerPlayerId(authorization),
    isAdminUser(authorization),
  ]);

  if (!playerId && !adminFlag) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const serviceClient = getServerServiceClient();
  const { data: event, error: fetchError } = await serviceClient
    .from("events")
    .select("event_id, visibility, created_by_player_id")
    .eq("event_id", eventId)
    .is("deleted_at", null)
    .maybeSingle();

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });

  const isCreator = playerId !== null && playerId === event.created_by_player_id;
  if (!adminFlag && !isCreator) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (typeof body.name === "string") update.name = body.name.trim() || null;
  if (typeof body.start_date === "string" && body.start_date.trim()) update.start_date = body.start_date.trim();
  if (typeof body.signup_deadline === "string") update.signup_deadline = body.signup_deadline.trim() || null;
  if (typeof body.end_date === "string") update.end_date = body.end_date.trim() || null;
  if (typeof body.format === "string") update.format = body.format.trim() || null;
  if (typeof body.player_limit === "number") update.player_limit = body.player_limit > 0 ? body.player_limit : null;
  if (Object.prototype.hasOwnProperty.call(body, "player_limit") && body.player_limit === null) update.player_limit = null;
  if (typeof body.description === "string") update.description = body.description.trim() || null;
  if (typeof body.notes === "string") update.notes = body.notes.trim() || null;
  if (typeof body.image_url === "string") update.image_url = body.image_url.trim() || null;
  if (typeof body.signup_list_visible === "boolean") update.signup_list_visible = body.signup_list_visible;

  if (Object.prototype.hasOwnProperty.call(body, "min_rating") || Object.prototype.hasOwnProperty.call(body, "max_rating")) {
    const restrictions: EventRestrictions = {};
    const minR = typeof body.min_rating === "number" ? body.min_rating : null;
    const maxR = typeof body.max_rating === "number" ? body.max_rating : null;
    if (minR !== null) restrictions.min_rating = minR;
    if (maxR !== null) restrictions.max_rating = maxR;
    update.restrictions = Object.keys(restrictions).length > 0 ? restrictions : null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }

  const { data: updated, error: updateError } = await serviceClient
    .from("events")
    .update(update)
    .eq("event_id", eventId)
    .select("*")
    .maybeSingle();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  if (!updated) return NextResponse.json({ error: "Event not found." }, { status: 404 });

  return NextResponse.json({ event: updated });
}
