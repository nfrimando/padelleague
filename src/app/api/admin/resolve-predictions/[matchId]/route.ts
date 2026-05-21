import { NextResponse } from "next/server";
import { getAuthorizedAdminClient } from "@/app/api/admin/_lib/auth";
import { calculateV1PredictionReward } from "@/lib/rewards/v1/calculate";

const REWARD_SYSTEM_VERSION = "v1";
const PREDICTION_MODEL_VERSION = "v3";

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

  const adminSupabase = auth.supabase;

  // Verify match is completed and has a winner
  const { data: match, error: matchErr } = await adminSupabase
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

  const winnerTeam = match.winner_team as 1 | 2;

  // Fetch all predictions for this match
  const { data: allPredictions, error: predErr } = await adminSupabase
    .from("predictions")
    .select("id,prediction,pick_probability")
    .eq("match_id", matchId)
    .eq("type", "winning_team");

  if (predErr) {
    return NextResponse.json({ error: "Failed to fetch predictions." }, { status: 500 });
  }

  const predictions = (allPredictions ?? []) as Array<{
    id: string;
    prediction: 1 | 2;
    pick_probability: number;
  }>;

  if (predictions.length === 0) {
    return NextResponse.json({ resolved: 0, skipped: 0 });
  }

  // Find which picks already have results (to avoid double-resolving)
  const predictionIds = predictions.map((p) => p.id);
  const { data: existingResults } = await adminSupabase
    .from("prediction_results")
    .select("user_pick_id")
    .in("user_pick_id", predictionIds);

  const alreadyResolved = new Set((existingResults ?? []).map((r) => r.user_pick_id));
  const pending = predictions.filter((p) => !alreadyResolved.has(p.id));

  if (pending.length === 0) {
    return NextResponse.json({ resolved: 0, skipped: predictions.length });
  }

  const resultsToInsert = pending.map((pick) => {
    const wasCorrect = pick.prediction === winnerTeam;
    const predictedTeamWinProbability = Number(pick.pick_probability);

    return {
      user_pick_id: pick.id,
      reward_system_version: REWARD_SYSTEM_VERSION,
      prediction_model_version: PREDICTION_MODEL_VERSION,
      was_correct: wasCorrect,
      points_awarded: calculateV1PredictionReward({
        predictedTeamWinProbability,
        wasCorrect,
      }),
    };
  });

  const { error: insertErr } = await adminSupabase
    .from("prediction_results")
    .insert(resultsToInsert);

  if (insertErr) {
    console.error("[resolve-predictions] insert error:", insertErr.message);
    return NextResponse.json({ error: "Failed to save prediction results." }, { status: 500 });
  }

  return NextResponse.json({
    resolved: pending.length,
    skipped: alreadyResolved.size,
  });
}
