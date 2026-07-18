import { describe, expect, it } from "vitest";
import {
  computeNextLadderStanding,
  type LadderStanding,
  type LadderTierRow,
} from "../../lib/ladder/ladderStandingTransition";

const TIERS: LadderTierRow[] = [
  { id: 1, rank: 1 }, // Bronze
  { id: 2, rank: 2 }, // Silver
  { id: 3, rank: 3 }, // Gold
];

describe("computeNextLadderStanding", () => {
  it("gains a star on a normal win", () => {
    const current: LadderStanding = { tierId: 2, stars: 0, cushionAvailable: false };
    const next = computeNextLadderStanding(current, "win", TIERS);

    expect(next.eventType).toBe("match_win");
    expect(next.tierBeforeId).toBe(2);
    expect(next.tierAfterId).toBe(2);
    expect(next.starsBefore).toBe(0);
    expect(next.starsAfter).toBe(1);
    expect(next.cushionAvailable).toBe(false);
    expect(next.metadata).toBeNull();
  });

  it("loses a star on a normal loss", () => {
    const current: LadderStanding = { tierId: 2, stars: 2, cushionAvailable: false };
    const next = computeNextLadderStanding(current, "loss", TIERS);

    expect(next.eventType).toBe("match_loss");
    expect(next.tierAfterId).toBe(2);
    expect(next.starsBefore).toBe(2);
    expect(next.starsAfter).toBe(1);
    expect(next.cushionAvailable).toBe(false);
  });

  it("promotes to the next tier on a win at 2 stars, landing at 0 stars with a fresh cushion", () => {
    const current: LadderStanding = { tierId: 2, stars: 2, cushionAvailable: false };
    const next = computeNextLadderStanding(current, "win", TIERS);

    expect(next.eventType).toBe("promotion");
    expect(next.tierBeforeId).toBe(2);
    expect(next.tierAfterId).toBe(3);
    expect(next.starsBefore).toBe(2);
    expect(next.starsAfter).toBe(0);
    expect(next.cushionAvailable).toBe(true);
  });

  it("caps at 2 stars on a win at the top tier (no tier above)", () => {
    const current: LadderStanding = { tierId: 3, stars: 2, cushionAvailable: false };
    const next = computeNextLadderStanding(current, "win", TIERS);

    expect(next.eventType).toBe("match_win");
    expect(next.tierBeforeId).toBe(3);
    expect(next.tierAfterId).toBe(3);
    expect(next.starsBefore).toBe(2);
    expect(next.starsAfter).toBe(2);
  });

  it("consumes the cushion on the first loss at 0 stars, staying in the same tier", () => {
    const current: LadderStanding = { tierId: 2, stars: 0, cushionAvailable: true };
    const next = computeNextLadderStanding(current, "loss", TIERS);

    expect(next.eventType).toBe("match_loss");
    expect(next.tierBeforeId).toBe(2);
    expect(next.tierAfterId).toBe(2);
    expect(next.starsBefore).toBe(0);
    expect(next.starsAfter).toBe(0);
    expect(next.cushionAvailable).toBe(false);
    expect(next.metadata).toEqual({ cushion_consumed: true });
  });

  it("demotes on a second loss at 0 stars with no cushion, landing at 2 stars with a fresh cushion", () => {
    const current: LadderStanding = { tierId: 2, stars: 0, cushionAvailable: false };
    const next = computeNextLadderStanding(current, "loss", TIERS);

    expect(next.eventType).toBe("demotion");
    expect(next.tierBeforeId).toBe(2);
    expect(next.tierAfterId).toBe(1);
    expect(next.starsBefore).toBe(0);
    expect(next.starsAfter).toBe(2);
    expect(next.cushionAvailable).toBe(true);
  });

  it("floors at 0 stars on a loss at the bottom tier with no cushion (no tier below)", () => {
    const current: LadderStanding = { tierId: 1, stars: 0, cushionAvailable: false };
    const next = computeNextLadderStanding(current, "loss", TIERS);

    expect(next.eventType).toBe("match_loss");
    expect(next.tierBeforeId).toBe(1);
    expect(next.tierAfterId).toBe(1);
    expect(next.starsBefore).toBe(0);
    expect(next.starsAfter).toBe(0);
    expect(next.cushionAvailable).toBe(false);
  });

  it("carries the cushion forward unchanged across wins", () => {
    const current: LadderStanding = { tierId: 2, stars: 0, cushionAvailable: true };
    const next = computeNextLadderStanding(current, "win", TIERS);

    expect(next.eventType).toBe("match_win");
    expect(next.cushionAvailable).toBe(true);
  });
});
