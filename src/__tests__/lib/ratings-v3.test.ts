import { describe, expect, it } from "vitest";
import { calculateV3Ratings } from "../../lib/ratings/v3/calculate";

describe("calculateV3Ratings", () => {
  it("applies the win floor when the match winner wins fewer total games", () => {
    const result = calculateV3Ratings({
      sets: [
        { team1Games: 7, team2Games: 6 },
        { team1Games: 0, team2Games: 6 },
        { team1Games: 7, team2Games: 6 },
      ],
      team1: {
        player1: { playerId: 1, preMatchRating: 5 },
        player2: { playerId: 2, preMatchRating: 5 },
      },
      team2: {
        player1: { playerId: 3, preMatchRating: 5 },
        player2: { playerId: 4, preMatchRating: 5 },
      },
    });

    expect(result.winnerTeam).toBe(1);
    expect(result.team1SetsWon).toBe(2);
    expect(result.team2SetsWon).toBe(1);
    expect(result.team1.player1.ratingDelta).toBeCloseTo(0.08);
    expect(result.team1.player2.ratingDelta).toBeCloseTo(0.08);
    expect(result.team2.player1.ratingDelta).toBeCloseTo(-0.08);
    expect(result.team2.player2.ratingDelta).toBeCloseTo(-0.08);
  });

  it("caps the upset reward at 0.5", () => {
    const result = calculateV3Ratings({
      sets: [
        { team1Games: 0, team2Games: 6 },
        { team1Games: 0, team2Games: 6 },
      ],
      team1: {
        player1: { playerId: 1, preMatchRating: 10 },
        player2: { playerId: 2, preMatchRating: 10 },
      },
      team2: {
        player1: { playerId: 3, preMatchRating: 1 },
        player2: { playerId: 4, preMatchRating: 1 },
      },
    });

    expect(result.winnerTeam).toBe(2);
    expect(result.team2.player1.ratingDelta).toBeCloseTo(0.5);
    expect(result.team2.player2.ratingDelta).toBeCloseTo(0.5);
    expect(result.team1.player1.ratingDelta).toBeCloseTo(-0.5);
    expect(result.team1.player2.ratingDelta).toBeCloseTo(-0.5);
  });

  it("returns zero deltas when sets do not produce a clear winner", () => {
    const result = calculateV3Ratings({
      sets: [
        { team1Games: 6, team2Games: 4 },
        { team1Games: 4, team2Games: 6 },
      ],
      team1: {
        player1: { playerId: 1, preMatchRating: 5 },
        player2: { playerId: 2, preMatchRating: 5 },
      },
      team2: {
        player1: { playerId: 3, preMatchRating: 5 },
        player2: { playerId: 4, preMatchRating: 5 },
      },
    });

    expect(result.winnerTeam).toBeNull();
    expect(result.team1SetsWon).toBe(1);
    expect(result.team2SetsWon).toBe(1);
    expect(result.team1.player1.ratingDelta).toBe(0);
    expect(result.team1.player2.ratingDelta).toBe(0);
    expect(result.team2.player1.ratingDelta).toBe(0);
    expect(result.team2.player2.ratingDelta).toBe(0);
  });
});