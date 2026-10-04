import { describe, expect, it } from "vitest";
import {
  computeNextLadderStanding,
  type LadderStanding,
  type LadderTierRow,
} from "../../lib/ladder/ladderStandingTransition";
import { computePlayByAt } from "../../lib/ladder/ladderQueueShared";

const TIERS: LadderTierRow[] = [
  { id: 1, rank: 1 },
  { id: 2, rank: 2 },
  { id: 3, rank: 3 },
];

// applyAdminStarAdjustment maps −1★ to a plain "loss" and +1★ to a plain "win" — penalties follow
// the normal match rules, cushion included.
describe("admin star adjustments follow normal match rules", () => {
  it("a −1★ penalty at 0★ spends an unused cushion instead of demoting", () => {
    const current: LadderStanding = { tierId: 2, stars: 0, cushionAvailable: true };
    const next = computeNextLadderStanding(current, "loss", TIERS);

    expect(next.eventType).toBe("match_loss");
    expect(next.tierAfterId).toBe(2);
    expect(next.starsAfter).toBe(0);
    expect(next.cushionAvailable).toBe(false);
    expect(next.metadata).toEqual({ cushion_consumed: true });
  });

  it("a −1★ penalty at 0★ with no cushion demotes", () => {
    const current: LadderStanding = { tierId: 2, stars: 0, cushionAvailable: false };
    const next = computeNextLadderStanding(current, "loss", TIERS);

    expect(next.eventType).toBe("demotion");
    expect(next.tierAfterId).toBe(1);
    expect(next.starsAfter).toBe(2);
  });

  it("a +1★ at 2★ promotes", () => {
    const current: LadderStanding = { tierId: 2, stars: 2, cushionAvailable: false };
    const next = computeNextLadderStanding(current, "win", TIERS);

    expect(next.eventType).toBe("promotion");
    expect(next.tierAfterId).toBe(3);
  });
});

describe("ladder queue deadlines", () => {
  it("sets the play-by 10 days out", () => {
    const from = new Date("2026-10-04T02:00:00Z");
    expect(computePlayByAt(from)).toBe("2026-10-14T02:00:00.000Z");
  });
});
