import { NextResponse } from "next/server";
import { getAuthorizedAdminClient } from "@/app/api/admin/_lib/auth";

/** GET /api/admin/seasons — list all seasons */
export async function GET(request: Request) {
  const authResult = await getAuthorizedAdminClient(request);
  if (!authResult.ok) return authResult.response;

  const { supabase } = authResult;

  const { data, error } = await supabase
    .from("seasons")
    .select("*")
    .order("season_id", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ seasons: data });
}

/** POST /api/admin/seasons — create a season
 *  Body: { name?, start_date, end_date, registration_fee?, registration_status?, status? }
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

  const startDate = typeof body.start_date === "string" ? body.start_date.trim() : null;
  const endDate   = typeof body.end_date   === "string" ? body.end_date.trim()   : null;

  if (!startDate || !endDate) {
    return NextResponse.json(
      { error: "start_date and end_date are required." },
      { status: 400 },
    );
  }

  const insert: Record<string, unknown> = {
    start_date:          startDate,
    end_date:            endDate,
    registration_status: typeof body.registration_status === "string" ? body.registration_status : "closed",
    status:              typeof body.status              === "string" ? body.status              : "upcoming",
  };

  // Optional columns added by migration 20260414000001
  if (typeof body.name === "string" && body.name.trim()) {
    insert.name = body.name.trim();
  }
  if (typeof body.registration_fee === "number" && body.registration_fee > 0) {
    insert.registration_fee = body.registration_fee;
  }

  const { supabase } = authResult;

  const { data, error } = await supabase
    .from("seasons")
    .insert(insert)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ season: data }, { status: 201 });
}

/** PATCH /api/admin/seasons/:seasonId — update a season's status fields */
export async function PATCH(request: Request) {
  const authResult = await getAuthorizedAdminClient(request);
  if (!authResult.ok) return authResult.response;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const seasonId = typeof body.season_id === "number" ? body.season_id : null;
  if (!seasonId) {
    return NextResponse.json({ error: "season_id is required." }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (typeof body.registration_status === "string") update.registration_status = body.registration_status;
  if (typeof body.status              === "string") update.status              = body.status;
  if (typeof body.name                === "string") update.name                = body.name;
  if (typeof body.registration_fee    === "number") update.registration_fee    = body.registration_fee;
  if (typeof body.start_date          === "string") update.start_date          = body.start_date;
  if (typeof body.end_date            === "string") update.end_date            = body.end_date;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }

  const { supabase } = authResult;

  const { data, error } = await supabase
    .from("seasons")
    .update(update)
    .eq("season_id", seasonId)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Season not found." }, { status: 404 });
  }

  return NextResponse.json({ season: data });
}
