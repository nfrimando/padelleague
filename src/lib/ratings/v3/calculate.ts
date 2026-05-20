export type SetScore = {
  team1Games: number;
  team2Games: number;
};

export type PlayerId = number | string;

export type PlayerRatingInput<TPlayerId extends PlayerId = number> = {
  playerId: TPlayerId;
  preMatchRating: number;
};

export type RatingCalculationInput<TPlayerId extends PlayerId = number> = {
  sets: SetScore[];
  team1: {
    player1: PlayerRatingInput<TPlayerId>;
    player2: PlayerRatingInput<TPlayerId>;
  };
  team2: {
    player1: PlayerRatingInput<TPlayerId>;
    player2: PlayerRatingInput<TPlayerId>;
  };
};

export type PlayerRatingResult<TPlayerId extends PlayerId = number> = {
  playerId: TPlayerId;
  preMatchRating: number;
  postMatchRating: number;
  ratingDelta: number;
};

export type RatingCalculationResult<TPlayerId extends PlayerId = number> = {
  winnerTeam: 1 | 2 | null;
  team1SetsWon: number;
  team2SetsWon: number;
  team1: {
    player1: PlayerRatingResult<TPlayerId>;
    player2: PlayerRatingResult<TPlayerId>;
  };
  team2: {
    player1: PlayerRatingResult<TPlayerId>;
    player2: PlayerRatingResult<TPlayerId>;
  };
};

const ELO_VAR_1 = 2.67;

export function computeV3ExpectedWinProbability(
  avgRating1: number,
  avgRating2: number,
): [ewp1: number, ewp2: number] {
  const elo1 = Math.pow(10, avgRating1 / ELO_VAR_1);
  const elo2 = Math.pow(10, avgRating2 / ELO_VAR_1);
  const ewp1 = elo1 / (elo1 + elo2);
  return [ewp1, 1 - ewp1];
}

export function calculateV3Ratings<TPlayerId extends PlayerId>(
  input: RatingCalculationInput<TPlayerId>,
): RatingCalculationResult<TPlayerId> {
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

  const winnerTeam =
    team1SetsWon > team2SetsWon ? 1 : team2SetsWon > team1SetsWon ? 2 : null;

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

  const totalGames1 = input.sets.reduce((sum, set) => sum + set.team1Games, 0);
  const totalGames2 = input.sets.reduce((sum, set) => sum + set.team2Games, 0);
  const totalGames = totalGames1 + totalGames2;
  const actualPerf1 = totalGames > 0 ? totalGames1 / totalGames : 0;
  const actualPerf2 = totalGames > 0 ? totalGames2 / totalGames : 0;

  const calcReward = (actualPerf: number, ewp: number): number => {
    if (actualPerf <= ewp) {
      return 0;
    }

    const ratio = (actualPerf - ewp) / GAMES_NORMALIZATION;
    const raw =
      Math.pow(ratio, UTR_VAR_5) * (UTR_VAR_2 - UTR_VAR_1) + UTR_VAR_1;
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

  const applyDelta = (
    player: PlayerRatingInput<TPlayerId>,
    delta: number,
  ): PlayerRatingResult<TPlayerId> => {
    return {
      playerId: player.playerId,
      preMatchRating: player.preMatchRating,
      postMatchRating: Math.max(player.preMatchRating + delta, 0),
      ratingDelta: delta,
    };
  };

  return {
    winnerTeam,
    team1SetsWon,
    team2SetsWon,
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