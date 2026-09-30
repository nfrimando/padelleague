import { describe, expect, it } from "vitest";
import { placeByRating, type TierBucketRow } from "../../lib/ladder/ladderPlacement";

// The floors the ladder has run on since 20260718000005_fix_ladder_tier_thresholds.sql.
const LIVE_TIERS: TierBucketRow[] = [
  { id: 1, name: "Bronze", rank: 1, elo_floor: 0 },
  { id: 2, name: "Silver", rank: 2, elo_floor: 1.5 },
  { id: 3, name: "Gold", rank: 3, elo_floor: 3 },
  { id: 4, name: "Platinum", rank: 4, elo_floor: 4.5 },
  { id: 5, name: "Diamond", rank: 5, elo_floor: 6 },
];

// The formula the seed and backfill migrations used, before star bands were derived from tier
// width. Every 1.5-wide tier must still agree with it.
function legacyPlace(rating: number, tiers: TierBucketRow[]) {
  const sorted = [...tiers].sort((a, b) => a.rank - b.rank);
  let chosen: TierBucketRow | null = null;
  for (const tier of sorted) if (rating >= tier.elo_floor) chosen = tier;
  if (!chosen) return null;
  return {
    tierId: chosen.id,
    stars: Math.min(2, Math.max(0, Math.floor((rating - chosen.elo_floor) / 0.5))),
  };
}

describe("placeByRating", () => {
  it("matches the legacy 0.5-band formula across the live 1.5-wide tiers", () => {
    for (let rating = 0; rating <= 8; rating += 0.1) {
      const r = Number(rating.toFixed(2));
      expect(placeByRating(r, LIVE_TIERS), `rating ${r}`).toEqual(legacyPlace(r, LIVE_TIERS));
    }
  });

  it("places into the highest tier whose floor the rating clears", () => {
    expect(placeByRating(0, LIVE_TIERS)?.tierId).toBe(1);
    expect(placeByRating(1.49, LIVE_TIERS)?.tierId).toBe(1);
    expect(placeByRating(1.5, LIVE_TIERS)?.tierId).toBe(2);
    expect(placeByRating(4.5, LIVE_TIERS)?.tierId).toBe(4);
    expect(placeByRating(6, LIVE_TIERS)?.tierId).toBe(5);
  });

  it("splits each tier into equal thirds when tiers have uneven widths", () => {
    // Bronze 0-3 (1.0 bands), Silver 3-3.6 (0.2 bands), Gold 3.6+ (borrows Silver's 0.6 width).
    const uneven: TierBucketRow[] = [
      { id: 1, name: "Bronze", rank: 1, elo_floor: 0 },
      { id: 2, name: "Silver", rank: 2, elo_floor: 3 },
      { id: 3, name: "Gold", rank: 3, elo_floor: 3.6 },
    ];

    expect(placeByRating(0, uneven)).toEqual({ tierId: 1, stars: 0 });
    expect(placeByRating(0.99, uneven)).toEqual({ tierId: 1, stars: 0 });
    expect(placeByRating(1, uneven)).toEqual({ tierId: 1, stars: 1 });
    expect(placeByRating(2, uneven)).toEqual({ tierId: 1, stars: 2 });
    expect(placeByRating(2.99, uneven)).toEqual({ tierId: 1, stars: 2 });

    expect(placeByRating(3, uneven)).toEqual({ tierId: 2, stars: 0 });
    expect(placeByRating(3.2, uneven)).toEqual({ tierId: 2, stars: 1 });
    expect(placeByRating(3.4, uneven)).toEqual({ tierId: 2, stars: 2 });

    // Top tier borrows the 0.6 width below it.
    expect(placeByRating(3.6, uneven)).toEqual({ tierId: 3, stars: 0 });
    expect(placeByRating(3.8, uneven)).toEqual({ tierId: 3, stars: 1 });
    expect(placeByRating(4.0, uneven)).toEqual({ tierId: 3, stars: 2 });
  });

  it("caps the open-ended top tier at 2 stars however far above the floor the rating is", () => {
    expect(placeByRating(6.9, LIVE_TIERS)).toEqual({ tierId: 5, stars: 1 });
    expect(placeByRating(7, LIVE_TIERS)).toEqual({ tierId: 5, stars: 2 });
    expect(placeByRating(50, LIVE_TIERS)).toEqual({ tierId: 5, stars: 2 });
  });

  it("returns null when the rating falls below every tier floor", () => {
    const aboveZero: TierBucketRow[] = [{ id: 1, name: "Bronze", rank: 1, elo_floor: 1 }];
    expect(placeByRating(0.5, aboveZero)).toBeNull();
    expect(placeByRating(-1, LIVE_TIERS)).toBeNull();
    expect(placeByRating(1, LIVE_TIERS)?.tierId).toBe(1);
  });

  it("falls back to 0.5 bands for a lone tier and ignores tier array order", () => {
    const lone: TierBucketRow[] = [{ id: 7, name: "Only", rank: 1, elo_floor: 0 }];
    expect(placeByRating(0.4, lone)).toEqual({ tierId: 7, stars: 0 });
    expect(placeByRating(0.5, lone)).toEqual({ tierId: 7, stars: 1 });
    expect(placeByRating(1.2, lone)).toEqual({ tierId: 7, stars: 2 });

    const shuffled = [...LIVE_TIERS].reverse();
    expect(placeByRating(3.7, shuffled)).toEqual(placeByRating(3.7, LIVE_TIERS));
  });

  it("returns null for an empty tier set", () => {
    expect(placeByRating(3, [])).toBeNull();
  });
});
