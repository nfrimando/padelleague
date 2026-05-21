import { NextResponse } from "next/server";
import { getAuthorizedAdminClient } from "@/app/api/admin/_lib/auth";
import { resolveMatchPredictions } from "@/lib/predictions/resolveMatchPredictions";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const auth = await getAuthorizedAdminClient(request);
  if (!auth.ok) return auth.response;

  const { matchId: matchIdParam } = await params;
  const matchId = Number.parseInt(matchIdParam, 10);
  if (!Number.isInteger(matchId) || matchId <= 0) {
    return NextResponse.json({ error: "Invalid matchId." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({})) as { force?: boolean };
  const force = body.force === true;

  const { data: match, error: matchErr } = await auth.supabase
    .from("matches")
    .select("status,winner_team")
    .eq("match_id", matchId)
    .maybeSingle();

  if (matchErr) {
    return NextResponse.json({ error: "Failed to look up match." }, { status: 500 });
  }
  if (!match) {
    return NextResponse.json({ error: "Match not found." }, { status: 404 });
  }
  if (match.status !== "completed") {
    return NextResponse.json(
      { error: "Match must be completed before resolving predictions." },
      { status: 400 },
    );
  }
  if (match.winner_team !== 1 && match.winner_team !== 2) {
    return NextResponse.json(
      { error: "Match has no winner_team recorded." },
      { status: 400 },
    );
  }

  try {
    const result = await resolveMatchPredictions(auth.supabase, matchId, { force });
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error.";
    console.error("[resolve-predictions]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
