import { NextResponse } from "next/server";
import {
  getAuthorizedAdminClient,
  isRecord,
  normalizeRequiredPositiveInteger,
} from "@/app/api/admin/_lib/auth";
import {
  calculateRatings,
  type RatingFormulaVersion,
} from "@/lib/ratingCalculator";

type SetScoreInput = {
  team1Games: number;
  team2Games: number;
};

type RatingRow = {
  player_id: number;
  match_id: number;
  rating_pre: number;
  rating_post: number;
  result: "win" | "loss";
  formula_name: string;
};

// Mirrors toPriority from resolvePreMatchRatings.ts — keep in sync if formula priorities change
function toPriority(formulaName: unknown): number {
  const formula = String(formulaName || "").toLowerCase();
  return formula === "v3" ? 2 : formula === "v2" ? 1 : 0;
}

function compareNullableStringDesc(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b.localeCompare(a);
}

type MatchMeta = {
  priority: number;
  ratingPre: number;
  ratingPost: number;
  result: "win" | "loss";
  formulaName: string;
  dateLocal: string | null;
  timeLocal: string | null;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
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
  if ((value.team1Games as number) < 0 || (value.team2Games as number) < 0) {
    errors.push(`sets[${index}] game scores cannot be negative.`);
    return null;
  }
  if (value.team1Games === value.team2Games) {
    errors.push(`sets[${index}] cannot be tied.`);
    return null;
  }
  return {
    team1Games: value.team1Games as number,
    team2Games: value.team2Games as number,
  };
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

  if (!isRecord(payload) || !Array.isArray(payload.sets)) {
    return NextResponse.json(
      { error: "Body must be a JSON object with a sets array." },
      { status: 400 },
    );
  }

  const errors: string[] = [];
  const sets: SetScoreInput[] = [];
  (payload.sets as unknown[]).forEach((set, i) => {
    const parsed = parseSetScore(set, i, errors);
    if (parsed) sets.push(parsed);
  });
  if (errors.length > 0) {
    return NextResponse.json(
      { error: "Invalid sets payload.", details: errors },
      { status: 400 },
    );
  }
  if (sets.length === 0) {
    return NextResponse.json(
      { error: "At least one set is required." },
      { status: 400 },
    );
  }

  const authResult = await getAuthorizedAdminClient(request);
  if (!authResult.ok) {
    return authResult.response;
  }
  const { supabase } = authResult;

  // Verify match exists and is completed
  const { data: matchRow, error: matchError } = await supabase
    .from("matches")
    .select("match_id, status, winner_team")
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
      { error: "Only completed matches can have their score revised." },
      { status: 400 },
    );
  }

  // Load teams
  const { data: teams, error: teamsError } = await supabase
    .from("match_teams")
    .select("uuid, team_number, player_1_id, player_2_id, sets_won")
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
      { error: "Match must have two teams with four valid player IDs." },
      { status: 400 },
    );
  }

  const playerIds = [
    team1.player_1_id,
    team1.player_2_id,
    team2.player_1_id,
    team2.player_2_id,
  ];

  // Server-side eligibility check: this must be the latest completed match for all 4 players.
  // Uses same priority + date/time/id ordering as the client hook and resolvePreMatchRatings.ts.
  const { data: allRatings, error: allRatingsError } = await supabase
    .from("match_player_ratings")
    .select("player_id, match_id, formula_name, rating_pre, rating_post, result, matches(date_local, time_local)")
    .in("player_id", playerIds);

  if (allRatingsError) {
    return NextResponse.json(
      { error: allRatingsError.message || "Failed to load player ratings." },
      { status: 500 },
    );
  }

  // Build per-player, per-match preferred rating (highest-priority formula wins)
  type PlayerMatchMap = Map<number, MatchMeta>;
  const preferredByPlayerAndMatch = new Map<number, PlayerMatchMap>();

  for (const row of (allRatings ?? []) as Array<{
    player_id: number | null;
    match_id: number | null;
    formula_name: string | null;
    rating_pre: number | null;
    rating_post: number | null;
    result: string | null;
    matches:
      | { date_local?: string | null; time_local?: string | null }
      | Array<{ date_local?: string | null; time_local?: string | null }>
      | null;
  }>) {
    const pId = typeof row.player_id === "number" ? row.player_id : null;
    const mId = typeof row.match_id === "number" ? row.match_id : null;
    const rPre = typeof row.rating_pre === "number" ? row.rating_pre : null;
    const rPost = typeof row.rating_post === "number" ? row.rating_post : null;
    if (pId === null || mId === null || rPre === null || rPost === null) continue;
    if (row.result !== "win" && row.result !== "loss") continue;

    const matchMeta = Array.isArray(row.matches) ? row.matches[0] : row.matches;
    const dateLocal = matchMeta?.date_local ?? null;
    const timeLocal = matchMeta?.time_local ?? null;
    const priority = toPriority(row.formula_name);

    const playerMap = preferredByPlayerAndMatch.get(pId) ?? new Map<number, MatchMeta>();
    const existing = playerMap.get(mId);
    if (!existing || priority >= existing.priority) {
      playerMap.set(mId, {
        priority,
        ratingPre: rPre,
        ratingPost: rPost,
        result: row.result,
        formulaName: row.formula_name ?? "",
        dateLocal,
        timeLocal,
      });
    }
    preferredByPlayerAndMatch.set(pId, playerMap);
  }

  // For each player, find their latest match by date/time/id
  const findLatestMatchId = (perMatch: PlayerMatchMap): number | null => {
    const sorted = Array.from(perMatch.entries()).sort(([aId, aVal], [bId, bVal]) => {
      const byDate = compareNullableStringDesc(aVal.dateLocal, bVal.dateLocal);
      if (byDate !== 0) return byDate;
      const byTime = compareNullableStringDesc(aVal.timeLocal, bVal.timeLocal);
      if (byTime !== 0) return byTime;
      return bId - aId;
    });
    return sorted.length > 0 ? sorted[0][0] : null;
  };

  for (const playerId of playerIds) {
    const perMatch = preferredByPlayerAndMatch.get(playerId);
    if (!perMatch) {
      return NextResponse.json(
        {
          error: `Player ${playerId} has no rating history. Cannot revise this match.`,
        },
        { status: 409 },
      );
    }
    const latestMatchId = findLatestMatchId(perMatch);
    if (latestMatchId !== matchId) {
      return NextResponse.json(
        {
          error: `Player ${playerId} has played in a later match (match #${latestMatchId ?? "?"}). Score revision is only allowed when this is the latest match for all involved players.`,
        },
        { status: 409 },
      );
    }
  }

  // Fetch current ratings for this match to get rating_pre per player and determine formula
  const currentRatingsByPlayer = new Map<number, MatchMeta>();
  for (const playerId of playerIds) {
    const perMatch = preferredByPlayerAndMatch.get(playerId);
    const currentEntry = perMatch?.get(matchId);
    if (!currentEntry) {
      return NextResponse.json(
        {
          error: `No ratings found for player ${playerId} in this match. Cannot revise.`,
        },
        { status: 400 },
      );
    }
    currentRatingsByPlayer.set(playerId, currentEntry);
  }

  // Determine which formula to use for recalculation (highest priority across all 4 players)
  const formulaName = Array.from(currentRatingsByPlayer.values()).sort(
    (a, b) => b.priority - a.priority,
  )[0].formulaName;

  // Validate the formula is supported by ratingCalculator
  const SUPPORTED_FORMULAS: RatingFormulaVersion[] = ["v3"];
  if (!(SUPPORTED_FORMULAS as string[]).includes(formulaName)) {
    return NextResponse.json(
      {
        error: `Formula "${formulaName}" is not supported for recalculation. Supported: ${SUPPORTED_FORMULAS.join(", ")}.`,
      },
      { status: 422 },
    );
  }
  const formula = formulaName as RatingFormulaVersion;

  // Determine new winner
  let team1SetsWon = 0;
  let team2SetsWon = 0;
  for (const set of sets) {
    if (set.team1Games > set.team2Games) team1SetsWon++;
    else team2SetsWon++;
  }
  const winnerTeam =
    team1SetsWon > team2SetsWon ? 1 : team2SetsWon > team1SetsWon ? 2 : null;
  if (!winnerTeam) {
    return NextResponse.json(
      { error: "Sets must produce a clear winner." },
      { status: 400 },
    );
  }

  const get = (id: number) => currentRatingsByPlayer.get(id)!;

  const calculation = calculateRatings(
    {
      sets,
      team1: {
        player1: {
          playerId: team1.player_1_id,
          preMatchRating: get(team1.player_1_id).ratingPre,
        },
        player2: {
          playerId: team1.player_2_id,
          preMatchRating: get(team1.player_2_id).ratingPre,
        },
      },
      team2: {
        player1: {
          playerId: team2.player_1_id,
          preMatchRating: get(team2.player_1_id).ratingPre,
        },
        player2: {
          playerId: team2.player_2_id,
          preMatchRating: get(team2.player_2_id).ratingPre,
        },
      },
    },
    formula,
  );

  // Snapshot for rollback
  const { data: existingSetsRows } = await supabase
    .from("match_sets")
    .select("set_number, team_1_games, team_2_games")
    .eq("match_id", matchId)
    .order("set_number", { ascending: true });

  const { data: existingRatingsRows } = await supabase
    .from("match_player_ratings")
    .select("player_id, match_id, rating_pre, rating_post, result, formula_name")
    .eq("match_id", matchId);

  const setsSnapshot = existingSetsRows ?? [];
  const ratingsSnapshot = (existingRatingsRows ?? []) as RatingRow[];
  const team1SetsWonSnapshot = team1.sets_won ?? null;
  const team2SetsWonSnapshot = team2.sets_won ?? null;
  const winnerTeamSnapshot = matchRow.winner_team;

  const rollback = async (reason: string) => {
    const rollbackErrors: string[] = [];

    const { error: e1 } = await supabase
      .from("matches")
      .update({ winner_team: winnerTeamSnapshot })
      .eq("match_id", matchId);
    if (e1) rollbackErrors.push(e1.message);

    const { error: e2 } = await supabase
      .from("match_sets")
      .delete()
      .eq("match_id", matchId);
    if (e2) rollbackErrors.push(e2.message);

    if (setsSnapshot.length > 0) {
      const { error: e3 } = await supabase.from("match_sets").insert(
        setsSnapshot.map((s) => ({
          match_id: matchId,
          set_number: s.set_number,
          team_1_games: s.team_1_games,
          team_2_games: s.team_2_games,
        })),
      );
      if (e3) rollbackErrors.push(e3.message);
    }

    const { error: e4 } = await supabase
      .from("match_teams")
      .update({ sets_won: team1SetsWonSnapshot })
      .eq("uuid", team1.uuid);
    if (e4) rollbackErrors.push(e4.message);

    const { error: e5 } = await supabase
      .from("match_teams")
      .update({ sets_won: team2SetsWonSnapshot })
      .eq("uuid", team2.uuid);
    if (e5) rollbackErrors.push(e5.message);

    const { error: e6 } = await supabase
      .from("match_player_ratings")
      .delete()
      .eq("match_id", matchId);
    if (e6) rollbackErrors.push(e6.message);

    if (ratingsSnapshot.length > 0) {
      const { error: e7 } = await supabase
        .from("match_player_ratings")
        .insert(ratingsSnapshot);
      if (e7) rollbackErrors.push(e7.message);
    }

    return NextResponse.json({ error: reason, rollbackErrors }, { status: 500 });
  };

  // Apply updates
  const { error: matchUpdateError } = await supabase
    .from("matches")
    .update({ winner_team: calculation.winnerTeam })
    .eq("match_id", matchId);

  if (matchUpdateError) {
    return NextResponse.json(
      { error: matchUpdateError.message || "Failed to update match winner." },
      { status: 500 },
    );
  }

  const { error: deleteSetsError } = await supabase
    .from("match_sets")
    .delete()
    .eq("match_id", matchId);
  if (deleteSetsError) {
    return rollback(deleteSetsError.message || "Failed to clear existing sets.");
  }

  const { error: insertSetsError } = await supabase.from("match_sets").insert(
    sets.map((set, i) => ({
      match_id: matchId,
      set_number: i + 1,
      team_1_games: set.team1Games,
      team_2_games: set.team2Games,
    })),
  );
  if (insertSetsError) {
    return rollback(insertSetsError.message || "Failed to insert new sets.");
  }

  const { error: team1UpdateError } = await supabase
    .from("match_teams")
    .update({ sets_won: calculation.team1SetsWon })
    .eq("uuid", team1.uuid);
  if (team1UpdateError) {
    return rollback(team1UpdateError.message || "Failed to update team 1 sets won.");
  }

  const { error: team2UpdateError } = await supabase
    .from("match_teams")
    .update({ sets_won: calculation.team2SetsWon })
    .eq("uuid", team2.uuid);
  if (team2UpdateError) {
    return rollback(team2UpdateError.message || "Failed to update team 2 sets won.");
  }

  // Delete all existing ratings for this match (all formulas) and reinsert recalculated ones
  const { error: deleteRatingsError } = await supabase
    .from("match_player_ratings")
    .delete()
    .eq("match_id", matchId);
  if (deleteRatingsError) {
    return rollback(
      deleteRatingsError.message || "Failed to clear existing ratings.",
    );
  }

  const newRatingRows = calculation.ratings.map((r) => ({
    player_id: r.playerId,
    match_id: matchId,
    // Preserve each player's original rating_pre (pre-ratings don't change on revision)
    rating_pre: get(r.playerId as number).ratingPre,
    rating_post: r.ratingPost,
    result: r.team === calculation.winnerTeam ? "win" : "loss",
    // Preserve each player's original formula_name
    formula_name: get(r.playerId as number).formulaName,
  }));

  const { data: insertedRatings, error: insertRatingsError } = await supabase
    .from("match_player_ratings")
    .insert(newRatingRows)
    .select("rating_id, player_id, match_id, rating_pre, rating_post, result, formula_name");

  if (insertRatingsError) {
    return rollback(
      insertRatingsError.message || "Failed to insert revised ratings.",
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
      message: "Match score revised and ratings recalculated.",
    },
    { status: 200 },
  );
}
