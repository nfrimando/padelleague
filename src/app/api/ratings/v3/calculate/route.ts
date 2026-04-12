import { NextResponse } from "next/server";

type SetScore = {
  team1Games: number;
  team2Games: number;
};

type PlayerRatingInput = {
  playerId: string;
  preMatchRating: number;
};

type RatingCalculationRequest = {
  sets: SetScore[];
  team1: {
    player1: PlayerRatingInput;
    player2: PlayerRatingInput;
  };
  team2: {
    player1: PlayerRatingInput;
    player2: PlayerRatingInput;
  };
};

type PlayerRatingResult = {
  playerId: string;
  preMatchRating: number;
  postMatchRating: number;
  ratingDelta: number;
};

type RatingCalculationResponse = {
  winnerTeam: 1 | 2 | null;
  team1: {
    player1: PlayerRatingResult;
    player2: PlayerRatingResult;
  };
  team2: {
    player1: PlayerRatingResult;
    player2: PlayerRatingResult;
  };
  note?: string;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function determineWinnerTeam(sets: SetScore[]): 1 | 2 | null {
  let team1SetsWon = 0;
  let team2SetsWon = 0;

  for (const set of sets) {
    if (set.team1Games > set.team2Games) {
      team1SetsWon += 1;
    } else if (set.team2Games > set.team1Games) {
      team2SetsWon += 1;
    }
  }

  if (team1SetsWon > team2SetsWon) {
    return 1;
  }

  if (team2SetsWon > team1SetsWon) {
    return 2;
  }

  return null;
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
    value: PlayerRatingInput | undefined;
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

function calculatePostMatchRatings(
  input: RatingCalculationRequest,
): RatingCalculationResponse {
  // --- ELO parameters ---
  const ELO_VAR_1 = 2.67; // scaling factor 1
  // const ELO_VAR_2 = 0.4; // scaling factor 2 (reserved for future use)

  // --- UTR parameters ---
  const UTR_VAR_1 = 0.15; // min reward
  const UTR_VAR_2 = 1.5; // max reward
  const UTR_VAR_3 = 0.5; // reward cap
  const UTR_VAR_4 = 0.08; // win bonus (floor applied to winner reward)
  const UTR_VAR_5 = 2; // curve exponent

  // Normalization constant used in the reward curve denominator
  const GAMES_NORMALIZATION = 1 - 14 / 32;

  const winnerTeam = determineWinnerTeam(input.sets);

  // --- Step 1: Average team ratings ---
  const avgRating1 =
    (input.team1.player1.preMatchRating +
      input.team1.player2.preMatchRating) /
    2;
  const avgRating2 =
    (input.team2.player1.preMatchRating +
      input.team2.player2.preMatchRating) /
    2;

  // --- Step 2: Expected Win Probability (EWP) via ELO formula ---
  const elo1 = Math.pow(10, avgRating1 / ELO_VAR_1);
  const elo2 = Math.pow(10, avgRating2 / ELO_VAR_1);
  const ewp1 = elo1 / (elo1 + elo2);
  const ewp2 = elo2 / (elo1 + elo2);

  // --- Step 3: Actual performance — % of total games won across all sets ---
  const totalGames1 = input.sets.reduce((sum, s) => sum + s.team1Games, 0);
  const totalGames2 = input.sets.reduce((sum, s) => sum + s.team2Games, 0);
  const totalGames = totalGames1 + totalGames2;
  const actualPerf1 = totalGames > 0 ? totalGames1 / totalGames : 0;
  const actualPerf2 = totalGames > 0 ? totalGames2 / totalGames : 0;

  // --- Step 4: Reward curve ---
  // reward = 0                                                       if actualPerf <= ewp
  // reward = ((actualPerf - ewp) / GAMES_NORMALIZATION)^UTR_VAR_5
  //          * (UTR_VAR_2 - UTR_VAR_1) + UTR_VAR_1                  if actualPerf > ewp
  const calcReward = (actualPerf: number, ewp: number): number => {
    if (actualPerf <= ewp) return 0;
    const ratio = (actualPerf - ewp) / GAMES_NORMALIZATION;
    const raw =
      Math.pow(ratio, UTR_VAR_5) * (UTR_VAR_2 - UTR_VAR_1) + UTR_VAR_1;
    return Math.min(raw, UTR_VAR_3);
  };

  // --- Step 5: Apply win bonus floor; losing team mirrors the winner's increment ---
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
  // If winnerTeam is null (tied sets), deltas remain 0.

  const applyDelta = (
    player: PlayerRatingInput,
    delta: number,
  ): PlayerRatingResult => ({
    playerId: player.playerId,
    preMatchRating: player.preMatchRating,
    postMatchRating: player.preMatchRating + delta,
    ratingDelta: delta,
  });

  return {
    winnerTeam,
    team1: {
      player1: applyDelta(input.team1.player1, delta1),
      player2: applyDelta(input.team1.player2, delta1),
    },
    team2: {
      player1: applyDelta(input.team2.player1, delta2),
      player2: applyDelta(input.team2.player2, delta2),
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

  const result = calculatePostMatchRatings(validation.value);
  return NextResponse.json(result, { status: 200 });
}
