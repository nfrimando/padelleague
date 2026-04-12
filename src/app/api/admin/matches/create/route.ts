import { NextResponse } from "next/server";
import {
  getAuthorizedAdminClient,
  isRecord,
  normalizeOptionalPositiveInteger,
  normalizeOptionalString,
  normalizeRequiredPositiveInteger,
} from "@/app/api/admin/_lib/auth";

type TeamInput = {
  player1Id: number;
  player2Id: number;
};

type CreateMatchRequest = {
  seasonId?: number | null;
  dateLocal?: string | null;
  timeLocal?: string | null;
  venue?: string | null;
  type?: string | null;
  team1: TeamInput;
  team2: TeamInput;
};

type ValidationResult =
  | { valid: true; value: CreateMatchRequest }
  | { valid: false; errors: string[] };

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

function validatePayload(payload: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isRecord(payload)) {
    return {
      valid: false,
      errors: ["Body must be a JSON object."],
    };
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

  if (!type) {
    errors.push("type is required.");
  } else if (!(ALLOWED_MATCH_TYPES as readonly string[]).includes(type)) {
    errors.push("type must be one of duel, kotc, group, finals.");
  }

  if (venue && !(ALLOWED_MATCH_VENUES as readonly string[]).includes(venue)) {
    errors.push(
      "venue must be one of MPC Arcovia, MPC BGC, Unilab, Padel 300, Warehouse 71, Palm Beach, ACC, Play Padel Pavilion, Manila Polo Club, or Play Padel.",
    );
  }

  const validateTeam = (label: string, value: unknown): TeamInput | null => {
    if (!isRecord(value)) {
      errors.push(`${label} is required.`);
      return null;
    }

    const player1Id = normalizeRequiredPositiveInteger(value.player1Id);
    const player2Id = normalizeRequiredPositiveInteger(value.player2Id);

    if (player1Id === null) {
      errors.push(`${label}.player1Id must be a positive integer.`);
    }

    if (player2Id === null) {
      errors.push(`${label}.player2Id must be a positive integer.`);
    }

    if (player1Id !== null && player2Id !== null && player1Id === player2Id) {
      errors.push(`${label} must contain two different players.`);
    }

    if (player1Id === null || player2Id === null) {
      return null;
    }

    return { player1Id, player2Id };
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
    return { valid: false, errors };
  }

  return {
    valid: true,
    value: {
      seasonId,
      dateLocal: normalizeOptionalString(payload.dateLocal),
      timeLocal: normalizeOptionalString(payload.timeLocal),
      venue,
      type,
      team1,
      team2,
    },
  };
}
export async function POST(request: Request) {
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

  const { data: createdMatch, error: createMatchError } = await supabase
    .from("matches")
    .insert({
      season_id: validation.value.seasonId,
      date_local: validation.value.dateLocal,
      time_local: validation.value.timeLocal,
      venue: validation.value.venue,
      type: validation.value.type,
      status: "scheduled",
      winner_team: null,
    })
    .select("match_id,status,season_id,date_local,time_local,venue,type")
    .maybeSingle();

  if (createMatchError || !createdMatch) {
    return NextResponse.json(
      { error: createMatchError?.message || "Failed to create match." },
      { status: 500 },
    );
  }

  const { error: createTeamsError } = await supabase.from("match_teams").insert([
    {
      match_id: createdMatch.match_id,
      team_number: 1,
      player_1_id: validation.value.team1.player1Id,
      player_2_id: validation.value.team1.player2Id,
      sets_won: null,
    },
    {
      match_id: createdMatch.match_id,
      team_number: 2,
      player_1_id: validation.value.team2.player1Id,
      player_2_id: validation.value.team2.player2Id,
      sets_won: null,
    },
  ]);

  if (createTeamsError) {
    const { error: rollbackError } = await supabase
      .from("matches")
      .delete()
      .eq("match_id", createdMatch.match_id);

    return NextResponse.json(
      {
        error: createTeamsError.message || "Failed to create match teams.",
        rollbackError: rollbackError?.message ?? null,
      },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      match: createdMatch,
      teams: {
        team1: validation.value.team1,
        team2: validation.value.team2,
      },
      message: "Scheduled match created successfully.",
    },
    { status: 201 },
  );
}