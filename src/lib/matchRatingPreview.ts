import {
  LoadedMatchDetails,
  MatchPlayerSummary,
  MatchRatingPreview,
} from "@/lib/types";
import { calculateRatings } from "@/lib/ratingCalculator";

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

  const pre1 = loadedMatchDetails.preRatingsV3[t1p1.player_id] as number;
  const pre2 = loadedMatchDetails.preRatingsV3[t1p2.player_id] as number;
  const pre3 = loadedMatchDetails.preRatingsV3[t2p1.player_id] as number;
  const pre4 = loadedMatchDetails.preRatingsV3[t2p2.player_id] as number;

  const result = calculateRatings(
    {
      sets,
      team1: {
        player1: { playerId: t1p1.player_id, preMatchRating: pre1 },
        player2: { playerId: t1p2.player_id, preMatchRating: pre2 },
      },
      team2: {
        player1: { playerId: t2p1.player_id, preMatchRating: pre3 },
        player2: { playerId: t2p2.player_id, preMatchRating: pre4 },
      },
    },
    "v3",
  );

  if (!result.winnerTeam) {
    return {
      error: "Set scores must produce a clear winner to preview ratings.",
    };
  }

  const playerById = new Map<number, MatchPlayerSummary>([
    [t1p1.player_id, t1p1],
    [t1p2.player_id, t1p2],
    [t2p1.player_id, t2p1],
    [t2p2.player_id, t2p2],
  ]);

  return {
    winnerTeam: result.winnerTeam,
    rows: result.ratings.map((rating) => ({
      player: playerById.get(rating.playerId) as MatchPlayerSummary,
      team: rating.team,
      before: rating.ratingPre,
      after: rating.ratingPost,
      delta: rating.ratingDelta,
    })),
  };
}
