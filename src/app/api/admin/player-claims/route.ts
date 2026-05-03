import { NextResponse } from "next/server";
import { getAuthorizedAdminClient } from "@/app/api/admin/_lib/auth";

/** GET /api/admin/player-claims — list pending profile claims */
export async function GET(request: Request) {
  const authResult = await getAuthorizedAdminClient(request);
  if (!authResult.ok) return authResult.response;

  const { supabase } = authResult;

  const { data, error } = await supabase
    .from("player_claims")
    .select(
      "id, player_id, claimed_by_email, claimed_by_name, status, created_at, reviewed_at, player:players(player_id, name, nickname)",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ claims: data ?? [] });
}
