import { AdminSupabaseClient } from "@/app/api/admin/_lib/auth";
import { calculateV1PredictionReward } from "@/lib/rewards/v1/calculate";
import { computeV3ExpectedWinProbability } from "@/lib/ratings/v3/calculate";
import { notifyPredictionCorrect } from "@/lib/email/notifications/predictionCorrect";
import { fetchPlayerPrefsMap } from "@/lib/notificationPreferences";

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

  // Derive win probabilities from pre-match ratings so reward matches what the UI displayed.
  // Falls back to stored pick_probability if pre-match rating data is incomplete.
  let team1Probability: number | null = null;
  let team2Probability: number | null = null;
  {
    const [{ data: teamRows }, { data: preRatingRows }] = await Promise.all([
      supabase
        .from("match_teams")
        .select("team_number,player_1_id,player_2_id")
        .eq("match_id", matchId),
      supabase
        .from("match_player_ratings")
        .select("player_id,rating_pre,formula_name")
        .eq("match_id", matchId),
    ]);

    const team1 = (teamRows ?? []).find((t) => t.team_number === 1);
    const team2 = (teamRows ?? []).find((t) => t.team_number === 2);

    if (team1 && team2) {
      // Build player → pre-rating map, preferring v3 > v2 > other
      const priorityOf = (f: string | null) => (f === "v3" ? 2 : f === "v2" ? 1 : 0);
      const sorted = [...(preRatingRows ?? [])].sort((a, b) => priorityOf(a.formula_name) - priorityOf(b.formula_name));
      const preRating = new Map<number, number>();
      for (const row of sorted) {
        const rating = Number(row.rating_pre);
        if (Number.isFinite(rating)) preRating.set(Number(row.player_id), rating);
      }

      const r1 = preRating.get(team1.player_1_id);
      const r2 = preRating.get(team1.player_2_id);
      const r3 = preRating.get(team2.player_1_id);
      const r4 = preRating.get(team2.player_2_id);

      if (r1 != null && r2 != null && r3 != null && r4 != null) {
        [team1Probability, team2Probability] = computeV3ExpectedWinProbability(
          (r1 + r2) / 2,
          (r3 + r4) / 2,
        );
      }
    }
  }

  const resultsToInsert = pending.map((pick) => {
    const wasCorrect = pick.prediction === winnerTeam;
    const preMatchProb =
      pick.prediction === 1 ? team1Probability : team2Probability;
    const predictedTeamWinProbability =
      preMatchProb != null ? preMatchProb : Number(pick.pick_probability);
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

  const correctPending = pending.filter((p) => p.prediction === winnerTeam);
  if (correctPending.length > 0) {
    await sendCorrectPredictionEmails(supabase, matchId, correctPending, resultsToInsert)
      .catch((err) => console.error("[email] sendCorrectPredictionEmails failed:", err));
  }

  return { resolved: pending.length, skipped: skippedCount };
}

async function sendCorrectPredictionEmails(
  supabase: AdminSupabaseClient,
  matchId: number,
  correctPicks: Array<{ id: string; email: string; player_id: number | null }>,
  resultsToInsert: Array<{ user_pick_id: string; points_awarded: number }>,
): Promise<void> {
  const [{ data: matchRow }, { data: teamRows }, { data: setRows }] = await Promise.all([
    supabase
      .from("matches")
      .select("date_local,time_local")
      .eq("match_id", matchId)
      .maybeSingle(),
    supabase
      .from("match_teams")
      .select("team_number,player_1_id,player_2_id")
      .eq("match_id", matchId)
      .order("team_number"),
    supabase
      .from("match_sets")
      .select("set_number,team_1_games,team_2_games")
      .eq("match_id", matchId)
      .order("set_number"),
  ]);

  const teamPlayerIds = (teamRows ?? []).flatMap((t) =>
    [t.player_1_id, t.player_2_id].filter((id): id is number => typeof id === "number"),
  );
  const predictorPlayerIds = correctPicks
    .map((p) => p.player_id)
    .filter((id): id is number => typeof id === "number");
  const allPlayerIds = [...new Set([...teamPlayerIds, ...predictorPlayerIds])];

  const { data: playerRows } = await supabase
    .from("players")
    .select("player_id,name,nickname,is_notifications_subscribed")
    .in("player_id", allPlayerIds);

  const playerMap = new Map(
    (playerRows ?? []).map((p) => [
      p.player_id as number,
      (p.nickname ?? p.name ?? "Unknown") as string,
    ]),
  );

  const playerNotifMap = new Map(
    (playerRows ?? []).map((p) => [
      p.player_id as number,
      p.is_notifications_subscribed as boolean | null,
    ]),
  );

  const predictorPrefsMap = await fetchPlayerPrefsMap(supabase, predictorPlayerIds);

  const team1 = (teamRows ?? []).find((t) => t.team_number === 1);
  const team2 = (teamRows ?? []).find((t) => t.team_number === 2);
  const team1Players: [string, string] = [
    playerMap.get(team1?.player_1_id ?? -1) ?? "?",
    playerMap.get(team1?.player_2_id ?? -1) ?? "?",
  ];
  const team2Players: [string, string] = [
    playerMap.get(team2?.player_1_id ?? -1) ?? "?",
    playerMap.get(team2?.player_2_id ?? -1) ?? "?",
  ];

  const sets = (setRows ?? []).map((s) => ({
    team_1_games: s.team_1_games as number,
    team_2_games: s.team_2_games as number,
  }));

  const pointsMap = new Map(resultsToInsert.map((r) => [r.user_pick_id, r.points_awarded]));

  for (const pick of correctPicks) {
    if (!pick.email) continue;
    if (pick.player_id != null && playerNotifMap.get(pick.player_id) === false) continue;
    if (pick.player_id != null && predictorPrefsMap.get(pick.player_id)?.predictions === false) continue;
    const recipientName =
      pick.player_id != null ? (playerMap.get(pick.player_id) ?? pick.email) : pick.email;
    const pointsAwarded = pointsMap.get(pick.id) ?? 0;

    await notifyPredictionCorrect({
      playerId: pick.player_id,
      recipientName,
      recipientEmail: pick.email,
      team1Players,
      team2Players,
      dateLocal: (matchRow?.date_local as string | null) ?? null,
      timeLocal: (matchRow?.time_local as string | null) ?? null,
      sets,
      pointsAwarded,
    });
  }
}
