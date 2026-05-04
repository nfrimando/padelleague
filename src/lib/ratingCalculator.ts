import {
  calculateV3Ratings,
  type PlayerId,
  type RatingCalculationInput,
} from "@/lib/ratings/v3/calculate";

export type RatingFormulaVersion = "v3";

export type RatingCalculatorInput<TPlayerId extends PlayerId = number> =
  RatingCalculationInput<TPlayerId>;

export type RatingCalculatorResult<TPlayerId extends PlayerId = number> = {
  winnerTeam: 1 | 2 | null;
  team1SetsWon: number;
  team2SetsWon: number;
  ratings: Array<{
    playerId: TPlayerId;
    team: 1 | 2;
    ratingPre: number;
    ratingPost: number;
    ratingDelta: number;
  }>;
};

export function calculateRatings<TPlayerId extends PlayerId>(
  input: RatingCalculatorInput<TPlayerId>,
  version: RatingFormulaVersion = "v3",
): RatingCalculatorResult<TPlayerId> {
  switch (version) {
    case "v3": {
      const result = calculateV3Ratings(input);
      return {
        winnerTeam: result.winnerTeam,
        team1SetsWon: result.team1SetsWon,
        team2SetsWon: result.team2SetsWon,
        ratings: [
          {
            playerId: result.team1.player1.playerId,
            team: 1,
            ratingPre: result.team1.player1.preMatchRating,
            ratingPost: result.team1.player1.postMatchRating,
            ratingDelta: result.team1.player1.ratingDelta,
          },
          {
            playerId: result.team1.player2.playerId,
            team: 1,
            ratingPre: result.team1.player2.preMatchRating,
            ratingPost: result.team1.player2.postMatchRating,
            ratingDelta: result.team1.player2.ratingDelta,
          },
          {
            playerId: result.team2.player1.playerId,
            team: 2,
            ratingPre: result.team2.player1.preMatchRating,
            ratingPost: result.team2.player1.postMatchRating,
            ratingDelta: result.team2.player1.ratingDelta,
          },
          {
            playerId: result.team2.player2.playerId,
            team: 2,
            ratingPre: result.team2.player2.preMatchRating,
            ratingPost: result.team2.player2.postMatchRating,
            ratingDelta: result.team2.player2.ratingDelta,
          },
        ],
      };
    }
  }
}