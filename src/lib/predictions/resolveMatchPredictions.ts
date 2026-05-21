import { AdminSupabaseClient } from "@/app/api/admin/_lib/auth";
import { calculateV1PredictionReward } from "@/lib/rewards/v1/calculate";

const REWARD_SYSTEM_VERSION = "v1";
const PREDICTION_MODEL_VERSION = "v3";

export async function resolveMatchPredictions(
  supabase: AdminSupabaseClient,
  matchId: number,
  options: { force?: boolean } = {},
): Promise<{ resolved: number; skipped: number }> {
  const { force = false } = options;

  const { data: match, error: matchErr } = await supabase
    .from("matches")
    .select("winner_team")
    .eq("match_id", matchId)
    .maybeSingle();

  if (matchErr || !match) {
    throw new Error(matchErr?.message ?? "Match not found.");
  }
  if (match.winner_team !== 1 && match.winner_team !== 2) {
    throw new Error("Match has no winner_team recorded.");
  }

  const winnerTeam = match.winner_team as 1 | 2;

  const { data: allPredictions, error: predErr } = await supabase
    .from("predictions")
    .select("id,prediction,pick_probability")
    .eq("match_id", matchId)
    .eq("type", "winning_team");

  if (predErr) throw new Error("Failed to fetch predictions.");

  const predictions = (allPredictions ?? []) as Array<{
    id: string;
    prediction: 1 | 2;
    pick_probability: number;
  }>;

  if (predictions.length === 0) return { resolved: 0, skipped: 0 };

  const predictionIds = predictions.map((p) => p.id);

  if (force) {
    const { error: deleteErr } = await supabase
      .from("prediction_results")
      .delete()
      .in("user_pick_id", predictionIds);

    if (deleteErr) throw new Error("Failed to clear existing prediction results.");
  }

  let pending = predictions;
  let skippedCount = 0;

  if (!force) {
    const { data: existingResults } = await supabase
      .from("prediction_results")
      .select("user_pick_id")
      .in("user_pick_id", predictionIds);

    const alreadyResolved = new Set((existingResults ?? []).map((r) => r.user_pick_id));
    pending = predictions.filter((p) => !alreadyResolved.has(p.id));
    skippedCount = alreadyResolved.size;
  }

  if (pending.length === 0) return { resolved: 0, skipped: skippedCount };

  const resultsToInsert = pending.map((pick) => {
    const wasCorrect = pick.prediction === winnerTeam;
    return {
      user_pick_id: pick.id,
      reward_system_version: REWARD_SYSTEM_VERSION,
      prediction_model_version: PREDICTION_MODEL_VERSION,
      was_correct: wasCorrect,
      points_awarded: calculateV1PredictionReward({
        predictedTeamWinProbability: Number(pick.pick_probability),
        wasCorrect,
      }),
    };
  });

  const { error: insertErr } = await supabase
    .from("prediction_results")
    .insert(resultsToInsert);

  if (insertErr) throw new Error("Failed to save prediction results.");

  return { resolved: pending.length, skipped: skippedCount };
}
