import { NextResponse } from "next/server";
import {
  getAuthorizedAdminClient,
  isRecord,
  normalizeOptionalPositiveInteger,
  normalizeRequiredPositiveInteger,
} from "@/app/api/admin/_lib/auth";

type TeamUpdate = {
  player1Id: number;
  player2Id: number;
  setsWon: number | null;
};

type UpdateMatchTeamsRequest = {
  team1: TeamUpdate;
  team2: TeamUpdate;
};

type ValidationResult =
  | { valid: true; value: UpdateMatchTeamsRequest }
  | { valid: false; errors: string[] };

function validatePayload(payload: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isRecord(payload)) {
    return {
      valid: false,
      errors: ["Body must be a JSON object."],
    };
  }

  const validateTeam = (label: string, value: unknown): TeamUpdate | null => {
    if (!isRecord(value)) {
      errors.push(`${label} is required.`);
      return null;
    }

    const player1Id = normalizeRequiredPositiveInteger(value.player1Id);
    const player2Id = normalizeRequiredPositiveInteger(value.player2Id);
    const setsWon = normalizeOptionalPositiveInteger(value.setsWon);

    if (player1Id === null) {
      errors.push(`${label}.player1Id must be a positive integer.`);
    }

    if (player2Id === null) {
      errors.push(`${label}.player2Id must be a positive integer.`);
    }

    if (
      value.setsWon !== undefined &&
      value.setsWon !== null &&
      value.setsWon !== "" &&
      setsWon === null
    ) {
      errors.push(`${label}.setsWon must be a positive integer or null.`);
    }

    if (player1Id !== null && player2Id !== null && player1Id === player2Id) {
      errors.push(`${label} must contain two different players.`);
    }

    if (player1Id === null || player2Id === null) {
      return null;
    }

    return {
      player1Id,
      player2Id,
      setsWon,
    };
  };

  const team1 = validateTeam("team1", payload.team1);
  const team2 = validateTeam("team2", payload.team2);

  if (team1 && team2) {
    const uniquePlayers = new Set([
      team1.player1Id,
      team1.player2Id,
      team2.player1Id,
      team2.player2Id,
    ]);

    if (uniquePlayers.size !== 4) {
      errors.push("All four players must be unique.");
    }
  }

  if (errors.length > 0 || !team1 || !team2) {
    return {
      valid: false,
      errors,
    };
  }

  return {
    valid: true,
    value: {
      team1,
      team2,
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

  const playerIds = [
    validation.value.team1.player1Id,
    validation.value.team1.player2Id,
    validation.value.team2.player1Id,
    validation.value.team2.player2Id,
  ];

  const { data: players, error: playersError } = await supabase
    .from("players")
    .select("player_id")
    .in("player_id", playerIds);

  if (playersError) {
    return NextResponse.json(
      { error: playersError.message || "Failed to validate players." },
      { status: 500 },
    );
  }

  if ((players ?? []).length !== 4) {
    return NextResponse.json(
      { error: "One or more selected players do not exist." },
      { status: 400 },
    );
  }

  const { data: existingTeams, error: existingTeamsError } = await supabase
    .from("match_teams")
    .select("uuid,team_number")
    .eq("match_id", matchId);

  if (existingTeamsError) {
    return NextResponse.json(
      { error: existingTeamsError.message || "Failed to load existing teams." },
      { status: 500 },
    );
  }

  const existingTeam1Rows = (existingTeams ?? []).filter(
    (row) => row.team_number === 1,
  );
  const existingTeam2Rows = (existingTeams ?? []).filter(
    (row) => row.team_number === 2,
  );

  if (existingTeam1Rows.length > 1 || existingTeam2Rows.length > 1) {
    return NextResponse.json(
      { error: "Expected at most one match_teams row per team number." },
      { status: 500 },
    );
  }

  const persistTeam = async (teamNumber: 1 | 2, team: TeamUpdate) => {
    const existingRow = teamNumber === 1 ? existingTeam1Rows[0] : existingTeam2Rows[0];

    if (existingRow) {
      const { data, error } = await supabase
        .from("match_teams")
        .update({
          player_1_id: team.player1Id,
          player_2_id: team.player2Id,
          sets_won: team.setsWon,
        })
        .eq("uuid", existingRow.uuid)
        .select("uuid,match_id,team_number,player_1_id,player_2_id,sets_won")
        .maybeSingle();

      return { data, error };
    }

    const { data, error } = await supabase
      .from("match_teams")
      .insert({
        match_id: matchId,
        team_number: teamNumber,
        player_1_id: team.player1Id,
        player_2_id: team.player2Id,
        sets_won: team.setsWon,
      })
      .select("uuid,match_id,team_number,player_1_id,player_2_id,sets_won")
      .maybeSingle();

    return { data, error };
  };

  const team1Result = await persistTeam(1, validation.value.team1);
  if (team1Result.error || !team1Result.data) {
    return NextResponse.json(
      { error: team1Result.error?.message || "Failed to update team 1." },
      { status: 500 },
    );
  }

  const team2Result = await persistTeam(2, validation.value.team2);
  if (team2Result.error || !team2Result.data) {
    return NextResponse.json(
      { error: team2Result.error?.message || "Failed to update team 2." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      matchId,
      teams: {
        team1: team1Result.data,
        team2: team2Result.data,
      },
      message: "Match teams updated successfully.",
    },
    { status: 200 },
  );
}