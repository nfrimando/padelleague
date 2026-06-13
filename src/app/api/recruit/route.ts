import { NextResponse } from "next/server";
import { getServerServiceClient } from "@/app/api/_lib/supabase";
import { getAuthorizedPlayer } from "@/app/api/recruit/_lib/auth";

/** GET /api/recruit — list pending member applications (members only) */
export async function GET(request: Request) {
  const auth = await getAuthorizedPlayer(request);
  if (!auth.ok) return auth.response;

  const serviceClient = getServerServiceClient();

  const { data: signups, error: signupsError } = await serviceClient
    .from("signups_players")
    .select(
      "id, applicant_name, applicant_nickname, applicant_image_url, created_at",
    )
    .eq("status", "registered")
    .is("player_id", null)
    .order("created_at", { ascending: true });

  if (signupsError) {
    return NextResponse.json({ error: signupsError.message }, { status: 500 });
  }

  const applications = signups ?? [];

  if (applications.length === 0) {
    return NextResponse.json({ applications: [] });
  }

  const signupIds = applications.map((a) => a.id as string);

  const { data: referrerRows } = await serviceClient
    .from("signups_players_referrers")
    .select("signup_id, initial_rating")
    .in("signup_id", signupIds);

  const statsMap = new Map<string, { referrer_count: number; rated_count: number }>();
  for (const row of referrerRows ?? []) {
    const id = row.signup_id as string;
    const existing = statsMap.get(id) ?? { referrer_count: 0, rated_count: 0 };
    existing.referrer_count += 1;
    if (row.initial_rating !== null) existing.rated_count += 1;
    statsMap.set(id, existing);
  }

  const enriched = applications.map((app) => ({
    ...app,
    referrer_count: statsMap.get(app.id as string)?.referrer_count ?? 0,
    rated_count: statsMap.get(app.id as string)?.rated_count ?? 0,
  }));

  return NextResponse.json({ applications: enriched });
}
