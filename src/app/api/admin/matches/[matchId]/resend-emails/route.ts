import { NextResponse } from "next/server";
import {
  getAuthorizedAdminClient,
  normalizeRequiredPositiveInteger,
} from "@/app/api/admin/_lib/auth";
import { notifyMatchCompleted } from "@/lib/email/notifications/matchCompleted";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const { matchId: rawMatchId } = await params;
  const matchId = normalizeRequiredPositiveInteger(rawMatchId);

  if (matchId === null) {
    return NextResponse.json(
      { error: "matchId must be a positive integer." },
      { status: 400 },
    );
  }

  const authResult = await getAuthorizedAdminClient(request);
  if (!authResult.ok) {
    return authResult.response;
  }
  const { supabase } = authResult;

  const { data: matchRow, error: matchError } = await supabase
    .from("matches")
    .select("match_id,status,winner_team,date_local,time_local,venue")
    .eq("match_id", matchId)
    .maybeSingle();

  if (matchError) {
    return NextResponse.json(
      { error: matchError.message || "Failed to load match." },
      { status: 500 },
    );
  }
  if (!matchRow) {
    return NextResponse.json({ error: "Match not found." }, { status: 404 });
  }
  if (matchRow.status !== "completed") {
    return NextResponse.json(
      { error: "Match is not completed. Only completed matches can have emails resent." },
      { status: 400 },
    );
  }
  if (matchRow.winner_team !== 1 && matchRow.winner_team !== 2) {
    return NextResponse.json(
      { error: "Match has no recorded winner_team." },
      { status: 400 },
    );
  }

  const { data: teams, error: teamsError } = await supabase
    .from("match_teams")
    .select("team_number,player_1_id,player_2_id")
    .eq("match_id", matchId);

  if (teamsError) {
    return NextResponse.json(
      { error: teamsError.message || "Failed to load match teams." },
      { status: 500 },
    );
  }

  const team1 = (teams ?? []).find((t) => t.team_number === 1);
  const team2 = (teams ?? []).find((t) => t.team_number === 2);

  if (
    !team1 ||
    !team2 ||
    typeof team1.player_1_id !== "number" ||
    typeof team1.player_2_id !== "number" ||
    typeof team2.player_1_id !== "number" ||
    typeof team2.player_2_id !== "number"
  ) {
    return NextResponse.json(
      { error: "Match teams are incomplete." },
      { status: 400 },
    );
  }

  const playerIds = [
    team1.player_1_id,
    team1.player_2_id,
    team2.player_1_id,
    team2.player_2_id,
  ];

  const { data: playerRows, error: playersError } = await supabase
    .from("players")
    .select("player_id,name,nickname,email,is_notifications_subscribed")
    .in("player_id", playerIds);

  if (playersError) {
    return NextResponse.json(
      { error: playersError.message || "Failed to load players." },
      { status: 500 },
    );
  }

  const byPlayerId = new Map(
    (playerRows ?? []).map((p) => [p.player_id as number, p]),
  );
  const toPlayerInfo = (id: number) => ({
    player_id: id,
    name: (byPlayerId.get(id)?.name as string | null) ?? null,
    nickname: (byPlayerId.get(id)?.nickname as string | null) ?? null,
    email: (byPlayerId.get(id)?.email as string | null) ?? null,
    is_notifications_subscribed:
      (byPlayerId.get(id)?.is_notifications_subscribed as boolean | null) ??
      null,
  });

  const { data: setsRows, error: setsError } = await supabase
    .from("match_sets")
    .select("set_number,team_1_games,team_2_games")
    .eq("match_id", matchId)
    .order("set_number", { ascending: true });

  if (setsError) {
    return NextResponse.json(
      { error: setsError.message || "Failed to load match sets." },
      { status: 500 },
    );
  }

  const { data: ratingsRows, error: ratingsError } = await supabase
    .from("match_player_ratings")
    .select("player_id,rating_pre,rating_post,result,formula_name")
    .eq("match_id", matchId)
    .in("player_id", playerIds);

  if (ratingsError) {
    return NextResponse.json(
      { error: ratingsError.message || "Failed to load match ratings." },
      { status: 500 },
    );
  }

  // Prefer v3 ratings; fall back to whatever exists per player
  const ratingByPlayer = new Map<
    number,
    { rating_pre: number; rating_post: number; result: "win" | "loss" }
  >();
  for (const r of ratingsRows ?? []) {
    const playerId = r.player_id as number;
    const existing = ratingByPlayer.get(playerId);
    if (!existing || r.formula_name === "v3") {
      ratingByPlayer.set(playerId, {
        rating_pre: r.rating_pre as number,
        rating_post: r.rating_post as number,
        result: r.result as "win" | "loss",
      });
    }
  }

  const ratings = playerIds.flatMap((id) => {
    const r = ratingByPlayer.get(id);
    return r ? [{ player_id: id, ...r }] : [];
  });

  const emailResult = await notifyMatchCompleted({
    matchId,
    dateLocal: matchRow.date_local,
    timeLocal: matchRow.time_local,
    venue: matchRow.venue,
    team1Players: [toPlayerInfo(team1.player_1_id), toPlayerInfo(team1.player_2_id)],
    team2Players: [toPlayerInfo(team2.player_1_id), toPlayerInfo(team2.player_2_id)],
    sets: (setsRows ?? []).map((s) => ({
      team_1_games: s.team_1_games as number,
      team_2_games: s.team_2_games as number,
    })),
    ratings,
    winnerTeam: matchRow.winner_team as 1 | 2,
  }).catch((err) => {
    console.error("[email] resend-emails notifyMatchCompleted failed:", err);
    return null;
  });

  if (!emailResult) {
    return NextResponse.json(
      { error: "Email send failed. Check server logs." },
      { status: 500 },
    );
  }

  return NextResponse.json({ matchId, emails: emailResult }, { status: 200 });
}
