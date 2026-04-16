import { NextResponse } from "next/server";
import {
  getAuthorizedAdminClient,
  normalizeRequiredPositiveInteger,
} from "@/app/api/admin/_lib/auth";

/** PATCH /api/admin/players/:playerId/verify
 *  Sets is_profile_complete = true (verified) or false (revoked).
 *  Body: { verified: boolean }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ playerId: string }> },
) {
  const { playerId: rawId } = await params;
  const playerId = normalizeRequiredPositiveInteger(rawId);

  if (playerId === null) {
    return NextResponse.json(
      { error: "playerId must be a positive integer." },
      { status: 400 },
    );
  }

  let body: { verified?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body.verified !== "boolean") {
    return NextResponse.json(
      { error: "Body must contain { verified: boolean }." },
      { status: 400 },
    );
  }

  const authResult = await getAuthorizedAdminClient(request);
  if (!authResult.ok) return authResult.response;

  const { supabase } = authResult;

  const { data, error } = await supabase
    .from("players")
    .update({ is_profile_complete: body.verified })
    .eq("player_id", playerId)
    .select("player_id, name, email, is_profile_complete")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Player not found." }, { status: 404 });
  }

  return NextResponse.json({
    player: data,
    message: body.verified ? "Player verified." : "Verification revoked.",
  });
}
