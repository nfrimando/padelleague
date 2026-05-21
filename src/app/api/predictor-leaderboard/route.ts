import { NextResponse } from "next/server";
import { getServerServiceClient } from "@/app/api/_lib/supabase";

type LeaderboardEntry = {
  player_id: number;
  name: string | null;
  nickname: string | null;
  image_link: string | null;
  points: number;
};

export async function GET() {
  const supabase = getServerServiceClient();

  const { data: results, error: resultsError } = await supabase
    .from("prediction_results")
    .select("user_pick_id, points_awarded");

  if (resultsError) {
    console.error("[predictor-leaderboard] prediction_results error:", resultsError);
    return NextResponse.json({ error: resultsError.message }, { status: 500 });
  }
  if (!results?.length) return NextResponse.json([]);

  const pickIds = results.map((r) => r.user_pick_id);
  const { data: predictions, error: predictionsError } = await supabase
    .from("predictions")
    .select("id, player_id")
    .in("id", pickIds)
    .not("player_id", "is", null);

  if (predictionsError) {
    console.error("[predictor-leaderboard] predictions error:", predictionsError);
    return NextResponse.json({ error: predictionsError.message }, { status: 500 });
  }
  if (!predictions?.length) return NextResponse.json([]);

  const playerIds = [...new Set(predictions.map((p) => p.player_id as number))];
  const { data: players, error: playersError } = await supabase
    .from("players")
    .select("player_id, name, nickname, image_link")
    .in("player_id", playerIds);

  if (playersError) {
    console.error("[predictor-leaderboard] players error:", playersError);
    return NextResponse.json({ error: playersError.message }, { status: 500 });
  }

  const predictionToPlayer = new Map<string, number>();
  for (const p of predictions) {
    predictionToPlayer.set(p.id as string, p.player_id as number);
  }

  const playerMap = new Map<number, Omit<LeaderboardEntry, "points">>();
  for (const p of players ?? []) {
    playerMap.set(p.player_id as number, {
      player_id: p.player_id as number,
      name: p.name as string | null,
      nickname: p.nickname as string | null,
      image_link: p.image_link as string | null,
    });
  }

  const byPlayer = new Map<number, LeaderboardEntry>();
  for (const row of results) {
    const playerId = predictionToPlayer.get(row.user_pick_id as string);
    if (!playerId) continue;
    const player = playerMap.get(playerId);
    if (!player) continue;

    if (!byPlayer.has(playerId)) {
      byPlayer.set(playerId, { ...player, points: 0 });
    }
    const entry = byPlayer.get(playerId)!;
    entry.points =
      Math.round((entry.points + Number(row.points_awarded ?? 0)) * 100) / 100;
  }

  const leaderboard = Array.from(byPlayer.values())
    .sort((a, b) => b.points - a.points)
    .slice(0, 20);

  return NextResponse.json(leaderboard);
}
