import { NextResponse } from "next/server";
import { getAuthorizedAdminClient } from "@/app/api/admin/_lib/auth";

/** GET /api/admin/membership-applications — list pending membership applications */
export async function GET(request: Request) {
  const authResult = await getAuthorizedAdminClient(request);
  if (!authResult.ok) return authResult.response;

  const { supabase } = authResult;

  const { data, error } = await supabase
    .from("signups_players")
    .select(
      "id, status, applicant_name, applicant_nickname, applicant_contact, applicant_email, player_id, created_at, updated_at",
    )
    .eq("status", "registered")
    .is("player_id", null)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ applications: data ?? [] });
}
