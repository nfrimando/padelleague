import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/ratings/v3/calculate/route";

describe("POST /api/ratings/v3/calculate", () => {
  it("returns the nested response shape with string player ids preserved", async () => {
    const request = new Request("http://localhost:3000/api/ratings/v3/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sets: [
          { team1Games: 7, team2Games: 6 },
          { team1Games: 0, team2Games: 6 },
          { team1Games: 7, team2Games: 6 },
        ],
        team1: {
          player1: { playerId: "1", preMatchRating: 5 },
          player2: { playerId: "2", preMatchRating: 5 },
        },
        team2: {
          player1: { playerId: "3", preMatchRating: 5 },
          player2: { playerId: "4", preMatchRating: 5 },
        },
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      winnerTeam: 1,
      team1: {
        player1: {
          playerId: "1",
          preMatchRating: 5,
          postMatchRating: 5.08,
          ratingDelta: 0.08,
        },
        player2: {
          playerId: "2",
          preMatchRating: 5,
          postMatchRating: 5.08,
          ratingDelta: 0.08,
        },
      },
      team2: {
        player1: {
          playerId: "3",
          preMatchRating: 5,
          postMatchRating: 4.92,
          ratingDelta: -0.08,
        },
        player2: {
          playerId: "4",
          preMatchRating: 5,
          postMatchRating: 4.92,
          ratingDelta: -0.08,
        },
      },
    });
  });

  it("returns 400 for an invalid payload", async () => {
    const request = new Request("http://localhost:3000/api/ratings/v3/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sets: [],
        team1: {
          player1: { playerId: "1", preMatchRating: 5 },
          player2: { playerId: "2", preMatchRating: 5 },
        },
        team2: {
          player1: { playerId: "3", preMatchRating: 5 },
          player2: { playerId: "4", preMatchRating: 5 },
        },
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid request payload.",
      details: ["sets must be a non-empty array."],
    });
  });
});