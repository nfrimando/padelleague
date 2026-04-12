import { NextResponse } from "next/server";
import {
  type AdminSupabaseClient,
  getAuthorizedAdminClient,
  isRecord,
  normalizeOptionalPositiveInteger,
  normalizeOptionalString,
  normalizeRequiredPositiveInteger,
} from "@/app/api/admin/_lib/auth";

type MatchStatus = "scheduled" | "completed" | "forfeit" | "cancelled";

type SetScoreInput = {
  team1Games: number;
  team2Games: number;
};

type UpdateMatchRequest = {
  status: MatchStatus;
  seasonId?: number | null;
  dateLocal?: string | null;
  timeLocal?: string | null;
  venue?: string | null;
  type?: string | null;
  sets?: SetScoreInput[];
};

type ValidationResult =
  | { valid: true; value: UpdateMatchRequest }
  | { valid: false; errors: string[] };

const MATCH_STATUSES: MatchStatus[] = [
  "scheduled",
  "completed",
  "forfeit",
  "cancelled",
];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeStatus(value: unknown): MatchStatus | null {
  return MATCH_STATUSES.includes(value as MatchStatus)
    ? (value as MatchStatus)
    : null;
}

function parseSetScore(value: unknown, index: number, errors: string[]) {
  if (!isRecord(value)) {
    errors.push(`sets[${index}] must be an object.`);
    return null;
  }

  if (!isFiniteNumber(value.team1Games) || !isFiniteNumber(value.team2Games)) {
    errors.push(`sets[${index}] must include numeric team1Games and team2Games.`);
    return null;
  }

  if (value.team1Games < 0 || value.team2Games < 0) {
    errors.push(`sets[${index}] game scores cannot be negative.`);
    return null;
  }

  if (value.team1Games === value.team2Games) {
    errors.push(`sets[${index}] cannot be tied.`);
    return null;
  }

  return {
    team1Games: value.team1Games,
    team2Games: value.team2Games,
  };
}

function validatePayload(payload: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isRecord(payload)) {
    return { valid: false, errors: ["Body must be a JSON object."] };
  }

  const status = normalizeStatus(payload.status ?? "completed");
  if (!status) {
    errors.push("status must be one of scheduled, completed, forfeit, cancelled.");
  }

  const seasonId = normalizeOptionalPositiveInteger(payload.seasonId);
  if (
    payload.seasonId !== undefined &&
    payload.seasonId !== null &&
    payload.seasonId !== "" &&
    seasonId === null
  ) {
    errors.push("seasonId must be a positive integer or null.");
  }

  let parsedSets: SetScoreInput[] | undefined;
  if (payload.sets !== undefined) {
    if (!Array.isArray(payload.sets)) {
      errors.push("sets must be an array when provided.");
    } else {
      parsedSets = [];
      payload.sets.forEach((set, index) => {
        const parsed = parseSetScore(set, index, errors);
        if (parsed) {
          parsedSets?.push(parsed);
        }
      });
    }
  }

  if (status === "completed") {
    if (!parsedSets || parsedSets.length === 0) {
      errors.push("sets must be provided for completed matches.");
    }
  }

  if (errors.length > 0 || !status) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    value: {
      status,
      seasonId,
      dateLocal: normalizeOptionalString(payload.dateLocal),
      timeLocal: normalizeOptionalString(payload.timeLocal),
      venue: normalizeOptionalString(payload.venue),
      type: normalizeOptionalString(payload.type),
      sets: parsedSets,
    },
  };
}

function calculateV3Ratings(input: {
  sets: SetScoreInput[];
  team1: { player1: { playerId: number; preMatchRating: number }; player2: { playerId: number; preMatchRating: number } };
  team2: { player1: { playerId: number; preMatchRating: number }; player2: { playerId: number; preMatchRating: number } };
}) {
  const ELO_VAR_1 = 2.67;
  const UTR_VAR_1 = 0.15;
  const UTR_VAR_2 = 1.5;
  const UTR_VAR_3 = 0.5;
  const UTR_VAR_4 = 0.08;
  const UTR_VAR_5 = 2;
  const GAMES_NORMALIZATION = 1 - 14 / 32;

  let team1SetsWon = 0;
  let team2SetsWon = 0;
  for (const set of input.sets) {
    if (set.team1Games > set.team2Games) {
      team1SetsWon += 1;
    } else if (set.team2Games > set.team1Games) {
      team2SetsWon += 1;
    }
  }

  const winnerTeam = team1SetsWon > team2SetsWon ? 1 : team2SetsWon > team1SetsWon ? 2 : null;

  const avgRating1 =
    (input.team1.player1.preMatchRating + input.team1.player2.preMatchRating) /
    2;
  const avgRating2 =
    (input.team2.player1.preMatchRating + input.team2.player2.preMatchRating) /
    2;

  const elo1 = Math.pow(10, avgRating1 / ELO_VAR_1);
  const elo2 = Math.pow(10, avgRating2 / ELO_VAR_1);
  const ewp1 = elo1 / (elo1 + elo2);
  const ewp2 = elo2 / (elo1 + elo2);

  const totalGames1 = input.sets.reduce((sum, s) => sum + s.team1Games, 0);
  const totalGames2 = input.sets.reduce((sum, s) => sum + s.team2Games, 0);
  const totalGames = totalGames1 + totalGames2;
  const actualPerf1 = totalGames > 0 ? totalGames1 / totalGames : 0;
  const actualPerf2 = totalGames > 0 ? totalGames2 / totalGames : 0;

  const calcReward = (actualPerf: number, ewp: number): number => {
    if (actualPerf <= ewp) return 0;
    const ratio = (actualPerf - ewp) / GAMES_NORMALIZATION;
    const raw = Math.pow(ratio, UTR_VAR_5) * (UTR_VAR_2 - UTR_VAR_1) + UTR_VAR_1;
    return Math.min(raw, UTR_VAR_3);
  };

  let delta1 = 0;
  let delta2 = 0;
  if (winnerTeam === 1) {
    const reward = Math.max(UTR_VAR_4, calcReward(actualPerf1, ewp1));
    delta1 = reward;
    delta2 = -reward;
  } else if (winnerTeam === 2) {
    const reward = Math.max(UTR_VAR_4, calcReward(actualPerf2, ewp2));
    delta2 = reward;
    delta1 = -reward;
  }

  return {
    winnerTeam,
    team1SetsWon,
    team2SetsWon,
    ratings: [
      {
        playerId: input.team1.player1.playerId,
        ratingPre: input.team1.player1.preMatchRating,
        ratingPost: input.team1.player1.preMatchRating + delta1,
        result: winnerTeam === 1 ? "win" : "loss",
      },
      {
        playerId: input.team1.player2.playerId,
        ratingPre: input.team1.player2.preMatchRating,
        ratingPost: input.team1.player2.preMatchRating + delta1,
        result: winnerTeam === 1 ? "win" : "loss",
      },
      {
        playerId: input.team2.player1.playerId,
        ratingPre: input.team2.player1.preMatchRating,
        ratingPost: input.team2.player1.preMatchRating + delta2,
        result: winnerTeam === 2 ? "win" : "loss",
      },
      {
        playerId: input.team2.player2.playerId,
        ratingPre: input.team2.player2.preMatchRating,
        ratingPost: input.team2.player2.preMatchRating + delta2,
        result: winnerTeam === 2 ? "win" : "loss",
      },
    ],
  };
}

async function getPreMatchRating(
  supabase: AdminSupabaseClient,
  matchId: number,
  playerId: number,
): Promise<number | null> {
  const { data: latest, error: latestError } = await supabase
    .from("match_player_ratings")
    .select("rating_post,created_at")
    .eq("player_id", playerId)
    .eq("formula_name", "v3")
    .neq("match_id", matchId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latestError && latest && typeof latest.rating_post === "number") {
    return latest.rating_post;
  }

  const { data: existingForMatch, error: existingForMatchError } = await supabase
    .from("match_player_ratings")
    .select("rating_pre")
    .eq("match_id", matchId)
    .eq("player_id", playerId)
    .eq("formula_name", "v3")
    .maybeSingle();

  if (
    !existingForMatchError &&
    existingForMatch &&
    typeof existingForMatch.rating_pre === "number"
  ) {
    return existingForMatch.rating_pre;
  }

  return null;
}

export async function PATCH(
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

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const validation = validatePayload(payload);
  if (!validation.valid) {
    return NextResponse.json(
      {
        error: "Invalid request payload.",
        details: validation.errors,
      },
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
    .select("match_id")
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

  const { data: teams, error: teamsError } = await supabase
    .from("match_teams")
    .select("uuid,team_number,player_1_id,player_2_id")
    .eq("match_id", matchId);

  if (teamsError) {
    return NextResponse.json(
      { error: teamsError.message || "Failed to load match teams." },
      { status: 500 },
    );
  }

  const team1 = (teams ?? []).find((team) => team.team_number === 1);
  const team2 = (teams ?? []).find((team) => team.team_number === 2);

  if (
    !team1 ||
    !team2 ||
    typeof team1.player_1_id !== "number" ||
    typeof team1.player_2_id !== "number" ||
    typeof team2.player_1_id !== "number" ||
    typeof team2.player_2_id !== "number"
  ) {
    return NextResponse.json(
      {
        error:
          "Match must have exactly two teams with four valid player IDs before updating.",
      },
      { status: 400 },
    );
  }

  const matchUpdates: Record<string, unknown> = {
    status: validation.value.status,
  };

  if (validation.value.seasonId !== undefined) {
    matchUpdates.season_id = validation.value.seasonId;
  }
  if (validation.value.dateLocal !== undefined) {
    matchUpdates.date_local = validation.value.dateLocal;
  }
  if (validation.value.timeLocal !== undefined) {
    matchUpdates.time_local = validation.value.timeLocal;
  }
  if (validation.value.venue !== undefined) {
    matchUpdates.venue = validation.value.venue;
  }
  if (validation.value.type !== undefined) {
    matchUpdates.type = validation.value.type;
  }

  if (validation.value.status === "completed") {
    const sets = validation.value.sets ?? [];
    let team1SetsWon = 0;
    let team2SetsWon = 0;
    for (const set of sets) {
      if (set.team1Games > set.team2Games) {
        team1SetsWon += 1;
      } else {
        team2SetsWon += 1;
      }
    }

    const winnerTeam = team1SetsWon > team2SetsWon ? 1 : team2SetsWon > team1SetsWon ? 2 : null;
    if (!winnerTeam) {
      return NextResponse.json(
        { error: "Completed matches must have a clear winner." },
        { status: 400 },
      );
    }

    const playerIds = [
      team1.player_1_id,
      team1.player_2_id,
      team2.player_1_id,
      team2.player_2_id,
    ];

    const preRatings = await Promise.all(
      playerIds.map((playerId) => getPreMatchRating(supabase, matchId, playerId)),
    );

    const missingPreRatingPlayers = playerIds.filter(
      (_playerId, index) => preRatings[index] === null,
    );
    if (missingPreRatingPlayers.length > 0) {
      return NextResponse.json(
        {
          error:
            "Missing prior v3 ratings for one or more players. Seed ratings before completing this match.",
          missingPlayerIds: missingPreRatingPlayers,
        },
        { status: 400 },
      );
    }

    const calculation = calculateV3Ratings({
      sets,
      team1: {
        player1: {
          playerId: team1.player_1_id,
          preMatchRating: preRatings[0] as number,
        },
        player2: {
          playerId: team1.player_2_id,
          preMatchRating: preRatings[1] as number,
        },
      },
      team2: {
        player1: {
          playerId: team2.player_1_id,
          preMatchRating: preRatings[2] as number,
        },
        player2: {
          playerId: team2.player_2_id,
          preMatchRating: preRatings[3] as number,
        },
      },
    });

    const { error: matchUpdateError } = await supabase
      .from("matches")
      .update({
        ...matchUpdates,
        winner_team: calculation.winnerTeam,
      })
      .eq("match_id", matchId);

    if (matchUpdateError) {
      return NextResponse.json(
        { error: matchUpdateError.message || "Failed to update match." },
        { status: 500 },
      );
    }

    const { error: deleteSetsError } = await supabase
      .from("match_sets")
      .delete()
      .eq("match_id", matchId);

    if (deleteSetsError) {
      return NextResponse.json(
        { error: deleteSetsError.message || "Failed to clear existing sets." },
        { status: 500 },
      );
    }

    const setRows = sets.map((set, index) => ({
      match_id: matchId,
      set_number: index + 1,
      team_1_games: set.team1Games,
      team_2_games: set.team2Games,
    }));

    const { error: insertSetsError } = await supabase
      .from("match_sets")
      .insert(setRows);

    if (insertSetsError) {
      return NextResponse.json(
        { error: insertSetsError.message || "Failed to insert match sets." },
        { status: 500 },
      );
    }

    const { error: team1UpdateError } = await supabase
      .from("match_teams")
      .update({ sets_won: calculation.team1SetsWon })
      .eq("uuid", team1.uuid);
    if (team1UpdateError) {
      return NextResponse.json(
        { error: team1UpdateError.message || "Failed to update team 1 sets won." },
        { status: 500 },
      );
    }

    const { error: team2UpdateError } = await supabase
      .from("match_teams")
      .update({ sets_won: calculation.team2SetsWon })
      .eq("uuid", team2.uuid);
    if (team2UpdateError) {
      return NextResponse.json(
        { error: team2UpdateError.message || "Failed to update team 2 sets won." },
        { status: 500 },
      );
    }

    const { error: deleteRatingsError } = await supabase
      .from("match_player_ratings")
      .delete()
      .eq("match_id", matchId)
      .eq("formula_name", "v3");
    if (deleteRatingsError) {
      return NextResponse.json(
        { error: deleteRatingsError.message || "Failed to clear existing v3 ratings." },
        { status: 500 },
      );
    }

    const ratingRows = calculation.ratings.map((rating) => ({
      player_id: rating.playerId,
      match_id: matchId,
      rating_pre: rating.ratingPre,
      rating_post: rating.ratingPost,
      result: rating.result,
      formula_name: "v3",
    }));

    const { data: insertedRatings, error: insertRatingsError } = await supabase
      .from("match_player_ratings")
      .insert(ratingRows)
      .select(
        "rating_id,player_id,match_id,rating_pre,rating_post,result,formula_name,created_at",
      );

    if (insertRatingsError) {
      return NextResponse.json(
        {
          error:
            insertRatingsError.message ||
            "Failed to insert match player ratings.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        matchId,
        winnerTeam: calculation.winnerTeam,
        setsWon: {
          team1: calculation.team1SetsWon,
          team2: calculation.team2SetsWon,
        },
        ratings: insertedRatings ?? [],
        message: "Match updated as completed with sets and v3 ratings.",
      },
      { status: 200 },
    );
  }

  const { error: updateError } = await supabase
    .from("matches")
    .update({
      ...matchUpdates,
      winner_team: null,
    })
    .eq("match_id", matchId);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message || "Failed to update match." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      matchId,
      message: "Match updated successfully.",
    },
    { status: 200 },
  );
}