import { NextResponse } from "next/server";
import {
  type AdminSupabaseClient,
  getAuthorizedAdminClient,
  isRecord,
  normalizeOptionalPositiveInteger,
  normalizeOptionalString,
  normalizeRequiredPositiveInteger,
} from "@/app/api/admin/_lib/auth";
import { calculateRatings } from "@/lib/ratingCalculator";
import { resolvePreMatchRatings } from "@/lib/resolvePreMatchRatings";
import { notifyMatchCompleted } from "@/lib/email/notifications/matchCompleted";
import { notifyMatchUpdated } from "@/lib/email/notifications/matchUpdated";
import { resolveMatchPredictions } from "@/lib/predictions/resolveMatchPredictions";

type MatchStatus = "scheduled" | "completed" | "forfeit" | "cancelled";

type SetScoreInput = {
  team1Games: number;
  team2Games: number;
};

type UpdateMatchRequest = {
  status: MatchStatus;
  eventId?: number | null;
  dateLocal?: string | null;
  timeLocal?: string | null;
  venue?: string | null;
  type?: string | null;
  youtubeLink?: string | null;
  sets?: SetScoreInput[];
  forfeitWinnerTeam?: 1 | 2;
};

type MatchSnapshot = {
  status: MatchStatus;
  event_id: number | null;
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

  const eventId = normalizeOptionalPositiveInteger(payload.eventId);
  const venue = normalizeOptionalString(payload.venue);
  const type = normalizeOptionalString(payload.type);
  if (
    payload.eventId !== undefined &&
    payload.eventId !== null &&
    payload.eventId !== "" &&
    eventId === null
  ) {
    errors.push("eventId must be a positive integer or null.");
  }

  if (type && !(ALLOWED_MATCH_TYPES as readonly string[]).includes(type)) {
    errors.push("type must be one of duel, kotc, group, finals.");
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

  if (status === "forfeit") {
    if (payload.forfeitWinnerTeam !== 1 && payload.forfeitWinnerTeam !== 2) {
      errors.push("forfeitWinnerTeam must be 1 or 2 when status is forfeit.");
    }
  }

  if (errors.length > 0 || !status) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    value: {
      status,
      eventId:
        payload.eventId === undefined
          ? undefined
          : normalizeOptionalPositiveInteger(payload.eventId),
      dateLocal:
        payload.dateLocal === undefined
          ? undefined
          : normalizeOptionalString(payload.dateLocal),
      timeLocal:
        payload.timeLocal === undefined
          ? undefined
          : normalizeOptionalString(payload.timeLocal),
      venue:
        payload.venue === undefined
          ? undefined
          : normalizeOptionalString(payload.venue),
      type:
        payload.type === undefined
          ? undefined
          : normalizeOptionalString(payload.type),
      sets: parsedSets,
      youtubeLink:
        payload.youtubeLink === undefined
          ? undefined
          : payload.youtubeLink === null || payload.youtubeLink === ""
            ? null
            : typeof payload.youtubeLink === "string"
              ? payload.youtubeLink.trim()
              : undefined,
      forfeitWinnerTeam: status === "forfeit" ? (payload.forfeitWinnerTeam as 1 | 2) : undefined,
    },
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
    .select("match_id,date_local,time_local,venue,type,event_id")
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

  if (validation.value.eventId !== undefined) {
    matchUpdates.event_id = validation.value.eventId;
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
  if (validation.value.youtubeLink !== undefined) {
    matchUpdates.youtube_link = validation.value.youtubeLink;
  }

  if (validation.value.status === "completed") {
    const { data: currentMatchRow, error: currentMatchError } = await supabase
      .from("matches")
        .select("status,event_id,date_local,time_local,venue,type,winner_team")
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
          event_id: matchSnapshot.event_id,
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

    const preRatingsMap = await resolvePreMatchRatings(
      supabase,
      matchId,
      playerIds,
    );
    const preRatings = playerIds.map(
      (playerId) => preRatingsMap.get(playerId) ?? null,
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

    const calculation = calculateRatings({
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
    }, "v3");

    const { data: updatedMatchRow, error: matchUpdateError } = await supabase
      .from("matches")
      .update({
        ...matchUpdates,
        winner_team: calculation.winnerTeam,
      })
      .eq("match_id", matchId)
      .select("match_id")
      .maybeSingle();

    if (matchUpdateError || !updatedMatchRow) {
      return NextResponse.json(
        {
          error:
            matchUpdateError?.message ||
            "Failed to update match. Ensure admin write permissions are configured.",
        },
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

    const { data: updatedTeam1Row, error: team1UpdateError } = await supabase
      .from("match_teams")
      .update({ sets_won: calculation.team1SetsWon })
      .eq("uuid", team1.uuid)
      .select("uuid")
      .maybeSingle();
    if (team1UpdateError || !updatedTeam1Row) {
      return rollbackCompletedFlow(
        team1UpdateError?.message ||
          "Failed to update team 1 sets won. Ensure admin write permissions are configured.",
      );
    }

    const { data: updatedTeam2Row, error: team2UpdateError } = await supabase
      .from("match_teams")
      .update({ sets_won: calculation.team2SetsWon })
      .eq("uuid", team2.uuid)
      .select("uuid")
      .maybeSingle();
    if (team2UpdateError || !updatedTeam2Row) {
      return rollbackCompletedFlow(
        team2UpdateError?.message ||
          "Failed to update team 2 sets won. Ensure admin write permissions are configured.",
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
      result: rating.team === calculation.winnerTeam ? "win" : "loss",
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

    const { data: playerRows } = await supabase
      .from("players")
      .select("player_id,name,nickname,email,is_notifications_subscribed")
      .in("player_id", playerIds);

    let completedEmailResult = null;
    if (playerRows && playerRows.length === 4) {
      const byId = new Map(playerRows.map((p) => [p.player_id as number, p]));
      const toPlayerInfo = (id: number) => ({
        player_id: id,
        name: (byId.get(id)?.name as string | null) ?? null,
        nickname: (byId.get(id)?.nickname as string | null) ?? null,
        email: (byId.get(id)?.email as string | null) ?? null,
        is_notifications_subscribed: (byId.get(id)?.is_notifications_subscribed as boolean | null) ?? null,
      });

      const finalDateLocal =
        validation.value.dateLocal !== undefined
          ? validation.value.dateLocal
          : matchSnapshot.date_local;
      const finalTimeLocal =
        validation.value.timeLocal !== undefined
          ? validation.value.timeLocal
          : matchSnapshot.time_local;
      const finalVenue =
        validation.value.venue !== undefined
          ? validation.value.venue
          : matchSnapshot.venue;

      completedEmailResult = await notifyMatchCompleted({
        matchId,
        dateLocal: finalDateLocal,
        timeLocal: finalTimeLocal,
        venue: finalVenue,
        team1Players: [toPlayerInfo(team1.player_1_id), toPlayerInfo(team1.player_2_id)],
        team2Players: [toPlayerInfo(team2.player_1_id), toPlayerInfo(team2.player_2_id)],
        sets: setRows.map((s) => ({ team_1_games: s.team_1_games, team_2_games: s.team_2_games })),
        ratings: (insertedRatings ?? []).map((r) => ({
          player_id: r.player_id as number,
          rating_pre: r.rating_pre as number,
          rating_post: r.rating_post as number,
          result: r.result as "win" | "loss",
        })),
        winnerTeam: calculation.winnerTeam as 1 | 2,
      }).catch((err) => {
        console.error("[email] notifyMatchCompleted failed:", err);
        return null;
      });
    }

    await resolveMatchPredictions(supabase, matchId, { force: false })
      .catch((err) => console.error("[predictions] auto-resolve failed:", err));

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
        emails: completedEmailResult,
      },
      { status: 200 },
    );
  }

  const { data: updatedMatchRow, error: updateError } = await supabase
    .from("matches")
    .update({
      ...matchUpdates,
      winner_team: validation.value.forfeitWinnerTeam ?? null,
    })
    .eq("match_id", matchId)
    .select("match_id")
    .maybeSingle();

  if (updateError || !updatedMatchRow) {
    return NextResponse.json(
      {
        error:
          updateError?.message ||
          "Failed to update match. Ensure admin write permissions are configured.",
      },
      { status: 500 },
    );
  }

  if (validation.value.status === "forfeit") {
    const forfeitWinnerTeam = validation.value.forfeitWinnerTeam as 1 | 2;

    const { error: deleteSetsError } = await supabase
      .from("match_sets")
      .delete()
      .eq("match_id", matchId);

    if (deleteSetsError) {
      return NextResponse.json(
        { error: deleteSetsError.message || "Failed to clear existing sets for forfeit." },
        { status: 500 },
      );
    }

    const forfeitSetRows = [1, 2].map((set_number) => ({
      match_id: matchId,
      set_number,
      team_1_games: forfeitWinnerTeam === 1 ? 6 : 0,
      team_2_games: forfeitWinnerTeam === 2 ? 6 : 0,
    }));

    const { error: insertSetsError } = await supabase
      .from("match_sets")
      .insert(forfeitSetRows);

    if (insertSetsError) {
      return NextResponse.json(
        { error: insertSetsError.message || "Failed to insert forfeit sets." },
        { status: 500 },
      );
    }

    const winnerTeamRow = forfeitWinnerTeam === 1 ? team1 : team2;
    const loserTeamRow = forfeitWinnerTeam === 1 ? team2 : team1;

    const { error: winnerSetsError } = await supabase
      .from("match_teams")
      .update({ sets_won: 2 })
      .eq("uuid", winnerTeamRow.uuid);

    if (winnerSetsError) {
      return NextResponse.json(
        { error: winnerSetsError.message || "Failed to update winner sets_won." },
        { status: 500 },
      );
    }

    const { error: loserSetsError } = await supabase
      .from("match_teams")
      .update({ sets_won: 0 })
      .eq("uuid", loserTeamRow.uuid);

    if (loserSetsError) {
      return NextResponse.json(
        { error: loserSetsError.message || "Failed to update loser sets_won." },
        { status: 500 },
      );
    }

    const forfeitEmailResult = await buildAndSendUpdatedEmail(supabase, matchId, matchRow, team1, team2, validation.value);

    return NextResponse.json(
      {
        matchId,
        winnerTeam: forfeitWinnerTeam,
        setsWon: {
          team1: forfeitWinnerTeam === 1 ? 2 : 0,
          team2: forfeitWinnerTeam === 2 ? 2 : 0,
        },
        message: "Match recorded as forfeit with 6-0 6-0 sets.",
        emails: forfeitEmailResult,
      },
      { status: 200 },
    );
  }

  const genericEmailResult = await buildAndSendUpdatedEmail(supabase, matchId, matchRow, team1, team2, validation.value);

  return NextResponse.json(
    {
      matchId,
      message: "Match updated successfully.",
      emails: genericEmailResult,
    },
    { status: 200 },
  );
}

async function buildAndSendUpdatedEmail(
  supabase: AdminSupabaseClient,
  matchId: number,
  matchRow: { date_local: string | null; time_local: string | null; venue: string | null; type: string | null; event_id: number | null },
  team1: { player_1_id: number; player_2_id: number },
  team2: { player_1_id: number; player_2_id: number },
  update: UpdateMatchRequest,
) {
  const playerIds = [team1.player_1_id, team1.player_2_id, team2.player_1_id, team2.player_2_id];
  const { data: playerRows } = await supabase
    .from("players")
    .select("player_id,name,nickname,email,is_notifications_subscribed")
    .in("player_id", playerIds);

  if (!playerRows || playerRows.length < 4) return null;

  const byId = new Map(playerRows.map((p) => [p.player_id as number, p]));
  const toPlayerInfo = (id: number) => ({
    player_id: id,
    name: (byId.get(id)?.name as string | null) ?? null,
    nickname: (byId.get(id)?.nickname as string | null) ?? null,
    email: (byId.get(id)?.email as string | null) ?? null,
    is_notifications_subscribed: (byId.get(id)?.is_notifications_subscribed as boolean | null) ?? null,
  });

  const finalDateLocal = update.dateLocal !== undefined ? update.dateLocal : matchRow.date_local;
  const finalTimeLocal = update.timeLocal !== undefined ? update.timeLocal : matchRow.time_local;
  const finalVenue = update.venue !== undefined ? update.venue : matchRow.venue;
  const finalType = update.type !== undefined ? update.type : matchRow.type;

  let eventName: string | null = null;
  const finalEventId = update.eventId !== undefined ? update.eventId : matchRow.event_id;
  if (finalEventId) {
    const { data: ev } = await supabase
      .from("events")
      .select("name")
      .eq("event_id", finalEventId)
      .maybeSingle();
    eventName = ev?.name ?? null;
  }

  return notifyMatchUpdated({
    matchId,
    dateLocal: finalDateLocal,
    timeLocal: finalTimeLocal,
    venue: finalVenue,
    matchType: finalType,
    eventName,
    team1Players: [toPlayerInfo(team1.player_1_id), toPlayerInfo(team1.player_2_id)],
    team2Players: [toPlayerInfo(team2.player_1_id), toPlayerInfo(team2.player_2_id)],
  }).catch((err) => {
    console.error("[email] notifyMatchUpdated failed:", err);
    return null;
  });
}