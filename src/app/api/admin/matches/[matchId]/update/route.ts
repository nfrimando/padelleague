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

type MatchSnapshot = {
  status: MatchStatus;
  season_id: number | null;
  date_local: string | null;
  time_local: string | null;
  venue: string | null;
  type: string | null;
  winner_team: number | null;
};

type SetSnapshot = {
  set_number: number;
  team_1_games: number;
  team_2_games: number;
};

type RatingSnapshot = {
  player_id: number;
  match_id: number;
  rating_pre: number;
  rating_post: number;
  result: "win" | "loss";
  formula_name: string;
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
const ALLOWED_MATCH_TYPES = ["duel", "kotc", "group", "finals"] as const;
const ALLOWED_MATCH_VENUES = [
  "ACC",
  "Manila Polo Club",
  "MPC Arcovia",
  "MPC BGC",
  "Padel 300",
  "Palm Beach",
  "Play Padel",
  "Play Padel Pavilion",
  "Unilab",
  "Warehouse 71",
] as const;

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
  const venue = normalizeOptionalString(payload.venue);
  const type = normalizeOptionalString(payload.type);
  if (
    payload.seasonId !== undefined &&
    payload.seasonId !== null &&
    payload.seasonId !== "" &&
    seasonId === null
  ) {
    errors.push("seasonId must be a positive integer or null.");
  }

  if (type && !(ALLOWED_MATCH_TYPES as readonly string[]).includes(type)) {
    errors.push("type must be one of duel, kotc, group, finals.");
  }

  if (venue && !(ALLOWED_MATCH_VENUES as readonly string[]).includes(venue)) {
    errors.push(
      "venue must be one of MPC Arcovia, MPC BGC, Unilab, Padel 300, Warehouse 71, Palm Beach, ACC, Play Padel Pavilion, Manila Polo Club, or Play Padel.",
    );
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
      venue,
      type,
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
  const { data: latestRows, error: latestRowsError } = await supabase
    .from("match_player_ratings")
    .select("match_id,rating_post,formula_name")
    .eq("player_id", playerId)
    .neq("match_id", matchId);

  if (!latestRowsError && (latestRows?.length ?? 0) > 0) {
    const preferredByMatch = new Map<
      number,
      { ratingPost: number; priority: number }
    >();

    for (const row of latestRows ?? []) {
      const matchIdForRow = Number(row.match_id);
      const ratingPost = Number(row.rating_post);
      if (!Number.isFinite(matchIdForRow) || !Number.isFinite(ratingPost)) {
        continue;
      }

      const formula = String(row.formula_name || "").toLowerCase();
      const priority = formula === "v3" ? 2 : formula === "v2" ? 1 : 0;
      const existing = preferredByMatch.get(matchIdForRow);

      if (!existing || priority >= existing.priority) {
        preferredByMatch.set(matchIdForRow, { ratingPost, priority });
      }
    }

    if (preferredByMatch.size > 0) {
      const { data: matchesForRatings, error: matchesForRatingsError } =
        await supabase
          .from("matches")
          .select("match_id,date_local,time_local")
          .in("match_id", Array.from(preferredByMatch.keys()))
          .order("date_local", { ascending: false, nullsFirst: false })
          .order("time_local", { ascending: false, nullsFirst: false })
          .order("match_id", { ascending: false });

      if (!matchesForRatingsError) {
        for (const row of matchesForRatings ?? []) {
          const candidate = preferredByMatch.get(Number(row.match_id));
          if (candidate) {
            return candidate.ratingPost;
          }
        }
      }
    }
  }

  const { data: existingForMatch, error: existingForMatchError } = await supabase
    .from("match_player_ratings")
    .select("rating_pre")
    .eq("match_id", matchId)
    .eq("player_id", playerId)
    .maybeSingle();

  if (
    !existingForMatchError &&
    existingForMatch &&
    typeof existingForMatch.rating_pre === "number"
  ) {
    return existingForMatch.rating_pre;
  }

  const { data: playerRow, error: playerError } = await supabase
    .from("players")
    .select("initial_rating")
    .eq("player_id", playerId)
    .maybeSingle();

  if (!playerError && typeof playerRow?.initial_rating === "number") {
    return playerRow.initial_rating;
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
    .select("uuid,team_number,player_1_id,player_2_id,sets_won")
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
    const { data: currentMatchRow, error: currentMatchError } = await supabase
      .from("matches")
      .select("status,season_id,date_local,time_local,venue,type,winner_team")
      .eq("match_id", matchId)
      .maybeSingle();

    if (currentMatchError || !currentMatchRow) {
      return NextResponse.json(
        {
          error:
            currentMatchError?.message ||
            "Failed to snapshot current match before update.",
        },
        { status: 500 },
      );
    }

    const { data: existingSetsRows, error: existingSetsError } = await supabase
      .from("match_sets")
      .select("set_number,team_1_games,team_2_games")
      .eq("match_id", matchId)
      .order("set_number", { ascending: true });

    if (existingSetsError) {
      return NextResponse.json(
        { error: existingSetsError.message || "Failed to snapshot existing sets." },
        { status: 500 },
      );
    }

    const { data: existingV3RatingsRows, error: existingV3RatingsError } =
      await supabase
        .from("match_player_ratings")
        .select("player_id,match_id,rating_pre,rating_post,result,formula_name")
        .eq("match_id", matchId)
        .eq("formula_name", "v3");

    if (existingV3RatingsError) {
      return NextResponse.json(
        {
          error:
            existingV3RatingsError.message ||
            "Failed to snapshot existing v3 ratings.",
        },
        { status: 500 },
      );
    }

    const matchSnapshot = currentMatchRow as MatchSnapshot;
    const setsSnapshot = (existingSetsRows ?? []) as SetSnapshot[];
    const ratingsSnapshot = (existingV3RatingsRows ?? []) as RatingSnapshot[];
    const team1SetsWonSnapshot = team1.sets_won ?? null;
    const team2SetsWonSnapshot = team2.sets_won ?? null;

    const rollbackCompletedFlow = async (reason: string) => {
      const rollbackErrors: string[] = [];

      const { error: rollbackMatchError } = await supabase
        .from("matches")
        .update({
          status: matchSnapshot.status,
          season_id: matchSnapshot.season_id,
          date_local: matchSnapshot.date_local,
          time_local: matchSnapshot.time_local,
          venue: matchSnapshot.venue,
          type: matchSnapshot.type,
          winner_team: matchSnapshot.winner_team,
        })
        .eq("match_id", matchId);
      if (rollbackMatchError) {
        rollbackErrors.push(rollbackMatchError.message);
      }

      const { error: rollbackDeleteSetsError } = await supabase
        .from("match_sets")
        .delete()
        .eq("match_id", matchId);
      if (rollbackDeleteSetsError) {
        rollbackErrors.push(rollbackDeleteSetsError.message);
      }

      if (setsSnapshot.length > 0) {
        const { error: rollbackInsertSetsError } = await supabase
          .from("match_sets")
          .insert(
            setsSnapshot.map((set) => ({
              match_id: matchId,
              set_number: set.set_number,
              team_1_games: set.team_1_games,
              team_2_games: set.team_2_games,
            })),
          );
        if (rollbackInsertSetsError) {
          rollbackErrors.push(rollbackInsertSetsError.message);
        }
      }

      const { error: rollbackTeam1Error } = await supabase
        .from("match_teams")
        .update({ sets_won: team1SetsWonSnapshot })
        .eq("uuid", team1.uuid);
      if (rollbackTeam1Error) {
        rollbackErrors.push(rollbackTeam1Error.message);
      }

      const { error: rollbackTeam2Error } = await supabase
        .from("match_teams")
        .update({ sets_won: team2SetsWonSnapshot })
        .eq("uuid", team2.uuid);
      if (rollbackTeam2Error) {
        rollbackErrors.push(rollbackTeam2Error.message);
      }

      const { error: rollbackDeleteRatingsError } = await supabase
        .from("match_player_ratings")
        .delete()
        .eq("match_id", matchId)
        .eq("formula_name", "v3");
      if (rollbackDeleteRatingsError) {
        rollbackErrors.push(rollbackDeleteRatingsError.message);
      }

      if (ratingsSnapshot.length > 0) {
        const { error: rollbackInsertRatingsError } = await supabase
          .from("match_player_ratings")
          .insert(ratingsSnapshot);
        if (rollbackInsertRatingsError) {
          rollbackErrors.push(rollbackInsertRatingsError.message);
        }
      }

      return NextResponse.json(
        {
          error: reason,
          rollbackErrors,
        },
        { status: 500 },
      );
    };

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
            "Missing prior ratings for one or more players. Seed ratings before completing this match.",
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
      return rollbackCompletedFlow(
        deleteSetsError.message || "Failed to clear existing sets.",
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
      return rollbackCompletedFlow(
        insertSetsError.message || "Failed to insert match sets.",
      );
    }

    const { error: team1UpdateError } = await supabase
      .from("match_teams")
      .update({ sets_won: calculation.team1SetsWon })
      .eq("uuid", team1.uuid);
    if (team1UpdateError) {
      return rollbackCompletedFlow(
        team1UpdateError.message || "Failed to update team 1 sets won.",
      );
    }

    const { error: team2UpdateError } = await supabase
      .from("match_teams")
      .update({ sets_won: calculation.team2SetsWon })
      .eq("uuid", team2.uuid);
    if (team2UpdateError) {
      return rollbackCompletedFlow(
        team2UpdateError.message || "Failed to update team 2 sets won.",
      );
    }

    const { error: deleteRatingsError } = await supabase
      .from("match_player_ratings")
      .delete()
      .eq("match_id", matchId)
      .eq("formula_name", "v3");
    if (deleteRatingsError) {
      return rollbackCompletedFlow(
        deleteRatingsError.message || "Failed to clear existing v3 ratings.",
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
      return rollbackCompletedFlow(
        insertRatingsError.message || "Failed to insert match player ratings.",
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