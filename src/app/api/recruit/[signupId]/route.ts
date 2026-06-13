import { NextResponse } from "next/server";
import { getServerServiceClient } from "@/app/api/_lib/supabase";
import { getAuthorizedPlayer } from "@/app/api/recruit/_lib/auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ signupId: string }> },
) {
  const auth = await getAuthorizedPlayer(request);
  if (!auth.ok) return auth.response;

  const { signupId } = await params;
  const serviceClient = getServerServiceClient();

  const { data: signup, error: signupError } = await serviceClient
    .from("signups_players")
    .select(
      "id, status, applicant_name, applicant_nickname, applicant_contact, applicant_email, applicant_image_url, created_at, updated_at, player_id",
    )
    .eq("id", signupId)
    .maybeSingle();

  if (signupError) {
    return NextResponse.json({ error: signupError.message }, { status: 500 });
  }

  if (!signup) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  const { data: referrers, error: referrersError } = await serviceClient
    .from("signups_players_referrers")
    .select(
      "id, signup_id, referrer_player_id, submitted_by_player_id, initial_rating, notes, is_named_referrer, created_at, updated_at, players:referrer_player_id (player_id, name, nickname, image_link)",
    )
    .eq("signup_id", signupId)
    .order("created_at", { ascending: true });

  if (referrersError) {
    return NextResponse.json({ error: referrersError.message }, { status: 500 });
  }

  return NextResponse.json({ signup, referrers: referrers ?? [] });
}
