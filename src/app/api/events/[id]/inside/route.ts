import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerUserClient, getServerServiceClient } from "@/app/api/_lib/supabase";
import type { EventAccess } from "@/lib/eventAccess";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const eventId = Number(id);
  if (!Number.isSafeInteger(eventId) || eventId <= 0) {
    return NextResponse.json({ error: "Invalid event ID." }, { status: 400 });
  }
  const authorization = request.headers.get("authorization");
  const client = authorization?.startsWith("Bearer ")
    ? getServerUserClient(authorization)
    : createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data, error } = await client.rpc("get_event_access", { target_event_id: eventId });
  if (error) return NextResponse.json({ error: "Unable to verify event access." }, { status: 500 });
  const access = data as EventAccess;
  if (!access?.found) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  // Omit protected data entirely for locked viewers, including anonymous callers.
  if (!access.canViewInside) return NextResponse.json({ access }, { headers: { "Cache-Control": "private, no-store" } });
  const [details, teams, matches] = await Promise.all([
    client.from("event_private_details").select("information,event_url").eq("event_id", eventId).maybeSingle(),
    client.from("event_division_teams").select("id,division,team_number,player_1:player_1_id(player_id,name,nickname,image_link),player_2:player_2_id(player_id,name,nickname,image_link)").eq("event_id", eventId).order("team_number"),
    client.from("matches").select("match_id,status,date_local").eq("event_id", eventId).neq("status", "cancelled").order("match_id"),
  ]);
  if (details.error || teams.error || matches.error) {
    return NextResponse.json({ error: "Unable to load event information." }, { status: 500 });
  }
  return NextResponse.json({ access, details: details.data, teams: teams.data ?? [], matches: matches.data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
}

/** Managers edit only the protected information, without putting it in public event rows. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const eventId = Number(id);
  if (!Number.isSafeInteger(eventId) || eventId <= 0) return NextResponse.json({ error: "Invalid event ID." }, { status: 400 });
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const client = getServerUserClient(authorization);
  const { data: access, error: accessError } = await client.rpc("get_event_access", { target_event_id: eventId });
  if (accessError) return NextResponse.json({ error: "Unable to verify event access." }, { status: 500 });
  if (!access?.canManage) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  let body: { information?: unknown; event_url?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  if (!body || typeof body.information !== "string" || typeof body.event_url !== "string") return NextResponse.json({ error: "Information and event URL must be text." }, { status: 400 });
  const url = body.event_url.trim();
  if (url) {
    try { if (!["https:", "http:"].includes(new URL(url).protocol)) throw new Error(); }
    catch { return NextResponse.json({ error: "Use a valid http or https event URL." }, { status: 400 }); }
  }
  const { error } = await getServerServiceClient().from("event_private_details").upsert({ event_id: eventId, information: body.information.trim() || null, event_url: url || null, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: "Unable to save event information." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
