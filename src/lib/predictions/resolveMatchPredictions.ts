import { AdminSupabaseClient } from "@/app/api/admin/_lib/auth";
import { calculateV1PredictionReward } from "@/lib/rewards/v1/calculate";
import { computeV3ExpectedWinProbability } from "@/lib/ratings/v3/calculate";

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
    .select("id,prediction,pick_probability,email,player_id")
    .eq("match_id", matchId)
    .eq("type", "winning_team");

  if (predErr) throw new Error("Failed to fetch predictions.");

  const predictions = (allPredictions ?? []) as Array<{
    id: string;
    prediction: 1 | 2;
    pick_probability: number;
    email: string;
    player_id: number | null;
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

  // Derive win probabilities from pre-match ratings (rating_pre), falling back to
  // each player's initial_rating if no match rating record exists. Errors if any
  // player's rating cannot be resolved.
  let team1Probability: number;
  let team2Probability: number;
  {
    const [{ data: teamRows, error: teamErr }, { data: preRatingRows, error: preErr }] = await Promise.all([
      supabase
        .from("match_teams")
        .select("team_number,player_1_id,player_2_id")
        .eq("match_id", matchId),
      supabase
        .from("match_player_ratings")
        .select("player_id,rating_pre,formula_name")
        .eq("match_id", matchId),
    ]);

    if (teamErr) throw new Error("Failed to fetch match teams.");
    if (preErr) throw new Error("Failed to fetch match player ratings.");

    const team1 = (teamRows ?? []).find((t) => t.team_number === 1);
    const team2 = (teamRows ?? []).find((t) => t.team_number === 2);

    if (!team1 || !team2) throw new Error("Match team records not found.");

    // Build player → pre-rating map, preferring v3 > v2 > other
    const priorityOf = (f: string | null) => (f === "v3" ? 2 : f === "v2" ? 1 : 0);
    const sorted = [...(preRatingRows ?? [])].sort((a, b) => priorityOf(a.formula_name) - priorityOf(b.formula_name));
    const preRating = new Map<number, number>();
    for (const row of sorted) {
      const rating = Number(row.rating_pre);
      if (Number.isFinite(rating)) preRating.set(Number(row.player_id), rating);
    }

    const allPlayerIds = [
      team1.player_1_id, team1.player_2_id,
      team2.player_1_id, team2.player_2_id,
    ];
    const missingIds = allPlayerIds.filter((id) => !preRating.has(id));

    if (missingIds.length > 0) {
      const { data: playerRows, error: playerErr } = await supabase
        .from("players")
        .select("player_id,initial_rating")
        .in("player_id", missingIds);

      if (playerErr) throw new Error("Failed to fetch player initial ratings.");

      for (const row of playerRows ?? []) {
        const rating = Number(row.initial_rating);
        if (!Number.isFinite(rating)) {
          throw new Error(`Player ${row.player_id} has no pre-match rating and no initial_rating.`);
        }
        preRating.set(Number(row.player_id), rating);
      }

      // Re-check after fallback
      for (const id of missingIds) {
        if (!preRating.has(id)) {
          throw new Error(`Player ${id} has no pre-match rating and was not found in players table.`);
        }
      }
    }

    const r1 = preRating.get(team1.player_1_id)!;
    const r2 = preRating.get(team1.player_2_id)!;
    const r3 = preRating.get(team2.player_1_id)!;
    const r4 = preRating.get(team2.player_2_id)!;

    [team1Probability, team2Probability] = computeV3ExpectedWinProbability(
      (r1 + r2) / 2,
      (r3 + r4) / 2,
    );
  }

  const resultsToInsert = pending.map((pick) => {
    const wasCorrect = pick.prediction === winnerTeam;
    const predictedTeamWinProbability =
      pick.prediction === 1 ? team1Probability : team2Probability;
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

  const { error: insertErr } = await supabase
    .from("prediction_results")
    .insert(resultsToInsert);

  if (insertErr) throw new Error("Failed to save prediction results.");

  return { resolved: pending.length, skipped: skippedCount };
}
