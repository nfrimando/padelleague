import {
  LoadedMatchDetails,
  MatchPlayerSummary,
  MatchRatingPreview,
} from "@/lib/types";

type MatchRatingPreviewInput = {
  loadedMatchDetails: LoadedMatchDetails | null;
  updateSet1Team1: string;
  updateSet1Team2: string;
  updateSet2Team1: string;
  updateSet2Team2: string;
  updateSet3Team1: string;
  updateSet3Team2: string;
};

export function calculateMatchRatingPreview({
  loadedMatchDetails,
  updateSet1Team1,
  updateSet1Team2,
  updateSet2Team1,
  updateSet2Team2,
  updateSet3Team1,
  updateSet3Team2,
}: MatchRatingPreviewInput): MatchRatingPreview | null {
  if (!loadedMatchDetails) {
    return null;
  }

  const setPairs = [
    { t1: updateSet1Team1.trim(), t2: updateSet1Team2.trim() },
    { t1: updateSet2Team1.trim(), t2: updateSet2Team2.trim() },
    { t1: updateSet3Team1.trim(), t2: updateSet3Team2.trim() },
  ];

  const sets: Array<{ team1Games: number; team2Games: number }> = [];
  for (const pair of setPairs) {
    if (!pair.t1 && !pair.t2) {
      continue;
    }

    if (!pair.t1 || !pair.t2) {
      return { error: "Fill both team scores for each set row." };
    }

    const t1Games = Number.parseInt(pair.t1, 10);
    const t2Games = Number.parseInt(pair.t2, 10);
    if (
      !Number.isInteger(t1Games) ||
      !Number.isInteger(t2Games) ||
      t1Games < 0 ||
      t2Games < 0 ||
      t1Games === t2Games
    ) {
      return { error: "Set scores must be valid and cannot be tied." };
    }

    sets.push({ team1Games: t1Games, team2Games: t2Games });
  }

  if (sets.length === 0) {
    return { error: "Enter at least one set to preview rating impact." };
  }

  const players = [
    loadedMatchDetails.team1.player1,
    loadedMatchDetails.team1.player2,
    loadedMatchDetails.team2.player1,
    loadedMatchDetails.team2.player2,
  ];

  if (players.some((p) => !p)) {
    return { error: "Match teams are incomplete. Cannot preview ratings." };
  }

  const missingPre = (players as MatchPlayerSummary[]).find(
    (player) => loadedMatchDetails.preRatingsV3[player.player_id] == null,
  );

  if (missingPre) {
    return {
      error:
        "Missing prior rating for one or more players. Rating preview unavailable.",
    };
  }

  const [t1p1, t1p2, t2p1, t2p2] = players as MatchPlayerSummary[];

  const ELO_VAR_1 = 2.67;
  const UTR_VAR_1 = 0.15;
  const UTR_VAR_2 = 1.5;
  const UTR_VAR_3 = 0.5;
  const UTR_VAR_4 = 0.08;
  const UTR_VAR_5 = 2;
  const GAMES_NORMALIZATION = 1 - 14 / 32;

  const pre1 = loadedMatchDetails.preRatingsV3[t1p1.player_id] as number;
  const pre2 = loadedMatchDetails.preRatingsV3[t1p2.player_id] as number;
  const pre3 = loadedMatchDetails.preRatingsV3[t2p1.player_id] as number;
  const pre4 = loadedMatchDetails.preRatingsV3[t2p2.player_id] as number;

  let team1SetsWon = 0;
  let team2SetsWon = 0;
  for (const set of sets) {
    if (set.team1Games > set.team2Games) {
      team1SetsWon += 1;
    } else {
      team2SetsWon += 1;
    }
  }

  const winnerTeam =
    team1SetsWon > team2SetsWon ? 1 : team2SetsWon > team1SetsWon ? 2 : null;
  if (!winnerTeam) {
    return {
      error: "Set scores must produce a clear winner to preview ratings.",
    };
  }

  const avg1 = (pre1 + pre2) / 2;
  const avg2 = (pre3 + pre4) / 2;

  const elo1 = Math.pow(10, avg1 / ELO_VAR_1);
  const elo2 = Math.pow(10, avg2 / ELO_VAR_1);
  const ewp1 = elo1 / (elo1 + elo2);
  const ewp2 = elo2 / (elo1 + elo2);

  const totalGames1 = sets.reduce((sum, s) => sum + s.team1Games, 0);
  const totalGames2 = sets.reduce((sum, s) => sum + s.team2Games, 0);
  const totalGames = totalGames1 + totalGames2;
  const actualPerf1 = totalGames > 0 ? totalGames1 / totalGames : 0;
  const actualPerf2 = totalGames > 0 ? totalGames2 / totalGames : 0;

  const calcReward = (actualPerf: number, ewp: number) => {
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

  return {
    winnerTeam,
    rows: [
      {
        player: t1p1,
        team: 1,
        before: pre1,
        after: pre1 + delta1,
        delta: delta1,
      },
      {
        player: t1p2,
        team: 1,
        before: pre2,
        after: pre2 + delta1,
        delta: delta1,
      },
      {
        player: t2p1,
        team: 2,
        before: pre3,
        after: pre3 + delta2,
        delta: delta2,
      },
      {
        player: t2p2,
        team: 2,
        before: pre4,
        after: pre4 + delta2,
        delta: delta2,
      },
    ],
  };
}
