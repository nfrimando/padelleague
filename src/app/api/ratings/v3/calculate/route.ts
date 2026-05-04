import { NextResponse } from "next/server";
import {
  calculateV3Ratings,
  type PlayerRatingInput,
  type PlayerRatingResult,
  type RatingCalculationInput,
  type RatingCalculationResult,
  type SetScore,
} from "@/lib/ratings/v3/calculate";

type RatingCalculationRequest = RatingCalculationInput<string>;
type RoutePlayerRatingInput = PlayerRatingInput<string>;
type RoutePlayerRatingResult = PlayerRatingResult<string>;

type RatingCalculationResponse = {
  winnerTeam: 1 | 2 | null;
  team1: {
    player1: RoutePlayerRatingResult;
    player2: RoutePlayerRatingResult;
  };
  team2: {
    player1: RoutePlayerRatingResult;
    player2: RoutePlayerRatingResult;
  };
  note?: string;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validatePayload(payload: unknown): {
  valid: boolean;
  errors: string[];
  value?: RatingCalculationRequest;
} {
  const errors: string[] = [];

  if (!payload || typeof payload !== "object") {
    return {
      valid: false,
      errors: ["Body must be a JSON object."],
    };
  }

  const data = payload as Partial<RatingCalculationRequest>;

  if (!Array.isArray(data.sets) || data.sets.length === 0) {
    errors.push("sets must be a non-empty array.");
  } else {
    data.sets.forEach((set, index) => {
      if (
        !set ||
        !isFiniteNumber(set.team1Games) ||
        !isFiniteNumber(set.team2Games)
      ) {
        errors.push(
          `sets[${index}] must include numeric team1Games and team2Games.`,
        );
      }
    });
  }

  const players: Array<{
    label: string;
    value: RoutePlayerRatingInput | undefined;
  }> = [
    { label: "team1.player1", value: data.team1?.player1 },
    { label: "team1.player2", value: data.team1?.player2 },
    { label: "team2.player1", value: data.team2?.player1 },
    { label: "team2.player2", value: data.team2?.player2 },
  ];

  for (const player of players) {
    if (!player.value) {
      errors.push(`${player.label} is required.`);
      continue;
    }

    if (!player.value.playerId || typeof player.value.playerId !== "string") {
      errors.push(`${player.label}.playerId must be a non-empty string.`);
    }

    if (!isFiniteNumber(player.value.preMatchRating)) {
      errors.push(`${player.label}.preMatchRating must be a number.`);
    }
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
    };
  }

  return {
    valid: true,
    errors: [],
    value: data as RatingCalculationRequest,
  };
}

function toRouteResponse(
  result: RatingCalculationResult<string>,
): RatingCalculationResponse {
  return {
    winnerTeam: result.winnerTeam,
    team1: {
      player1: result.team1.player1,
      player2: result.team1.player2,
    },
    team2: {
      player1: result.team2.player1,
      player2: result.team2.player2,
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
  if (!validation.valid || !validation.value) {
    return NextResponse.json(
      {
        error: "Invalid request payload.",
        details: validation.errors,
      },
      { status: 400 },
    );
  }

  const result = calculateV3Ratings(validation.value);
  return NextResponse.json(toRouteResponse(result), { status: 200 });
}
