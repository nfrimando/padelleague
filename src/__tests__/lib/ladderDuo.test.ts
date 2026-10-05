import { describe, expect, it } from "vitest";
import type { TierBucketRow } from "../../lib/ladder/ladderPlacement";
import { averageDuoRating, placeDuoByRatings } from "../../lib/ladder/ladderDuoPlacement";
import { pickDuoOpponent, type WaitingDuoTicket } from "../../lib/ladder/ladderDuoQueue";
import { buildDuoCycleResults } from "../../lib/ladder/ladderDuoCycle";
import {
  canonicalPair,
  duoDisplayName,
  inviteExpiresAt,
  isInviteExpired,
  normalizeDuoName,
  teamMatchesDuo,
} from "../../lib/ladder/ladderDuoShared";

const TIERS: TierBucketRow[] = [
  { id: 1, name: "Bronze", rank: 1, elo_floor: 0 },
  { id: 2, name: "Silver", rank: 2, elo_floor: 1.5 },
  { id: 3, name: "Gold", rank: 3, elo_floor: 3 },
  { id: 4, name: "Platinum", rank: 4, elo_floor: 4.5 },
  { id: 5, name: "Diamond", rank: 5, elo_floor: 6 },
];

describe("duo placement", () => {
  it("places by the average of the two ratings", () => {
    // avg 3.25 → Gold, (3.25 - 3) / 0.5 = 0.5 → 0★
    expect(placeDuoByRatings(2.5, 4.0, TIERS)).toEqual({ tierId: 3, stars: 0, rating: 3.25 });
    // avg 4.0 → Gold, (4.0 - 3) / 0.5 = 2 → 2★
    expect(placeDuoByRatings(3.5, 4.5, TIERS)).toEqual({ tierId: 3, stars: 2, rating: 4 });
  });

  it("an average exactly on a band edge reaches that star", () => {
    // avg 3.5 → Gold 1★
    expect(placeDuoByRatings(3.0, 4.0, TIERS)?.stars).toBe(1);
  });

  it("won't place a duo with an unrated player", () => {
    expect(placeDuoByRatings(null, 4.0, TIERS)).toBeNull();
    expect(placeDuoByRatings(3.0, undefined, TIERS)).toBeNull();
    expect(averageDuoRating(Number.NaN, 2)).toBeNull();
  });
});

describe("pickDuoOpponent", () => {
  const t = (id: string, duoId: number, playerIds: [number, number]): WaitingDuoTicket => ({
    id,
    duoId,
    playerIds,
  });

  it("pairs the two oldest tickets", () => {
    const pair = pickDuoOpponent([t("a", 1, [1, 2]), t("b", 2, [3, 4]), t("c", 3, [5, 6])], new Map());
    expect(pair?.map((x) => x.duoId)).toEqual([1, 2]);
  });

  it("skips the anchor's last opponent when someone else is waiting", () => {
    const pair = pickDuoOpponent(
      [t("a", 1, [1, 2]), t("b", 2, [3, 4]), t("c", 3, [5, 6])],
      new Map([
        [1, 2],
        [2, 1],
      ]),
    );
    expect(pair?.map((x) => x.duoId)).toEqual([1, 3]);
  });

  it("allows the rematch when it's the only option", () => {
    const pair = pickDuoOpponent(
      [t("a", 1, [1, 2]), t("b", 2, [3, 4])],
      new Map([
        [1, 2],
        [2, 1],
      ]),
    );
    expect(pair?.map((x) => x.duoId)).toEqual([1, 2]);
  });

  it("never pairs duos that share a player", () => {
    expect(pickDuoOpponent([t("a", 1, [1, 2]), t("b", 2, [2, 3])], new Map())).toBeNull();
    const pair = pickDuoOpponent([t("a", 1, [1, 2]), t("b", 2, [2, 3]), t("c", 3, [4, 5])], new Map());
    expect(pair?.map((x) => x.duoId)).toEqual([1, 3]);
  });

  it("returns null with fewer than two tickets", () => {
    expect(pickDuoOpponent([t("a", 1, [1, 2])], new Map())).toBeNull();
  });
});

describe("buildDuoCycleResults", () => {
  const duos = new Map([
    [10, { player_low_id: 1, player_high_id: 2, name: "Alpha" }],
    [11, { player_low_id: 3, player_high_id: 4, name: "Bravo" }],
    [12, { player_low_id: 5, player_high_id: 6, name: null }],
  ]);

  it("ranks eligible duos by tier, stars, wins then name, and leaves the rest unranked", () => {
    const results = buildDuoCycleResults({
      standings: [
        { duoId: 10, tierId: 3, stars: 1, startTierId: 2, startStars: 2 },
        { duoId: 11, tierId: 3, stars: 1, startTierId: 3, startStars: 0 },
        { duoId: 12, tierId: 4, stars: 0, startTierId: 4, startStars: 0 },
      ],
      tallies: new Map([
        [10, { matchesPlayed: 4, wins: 3, losses: 1 }],
        [11, { matchesPlayed: 3, wins: 3, losses: 0 }],
        [12, { matchesPlayed: 2, wins: 1, losses: 1 }],
      ]),
      duos,
      nameKeys: new Map([
        [10, "alpha"],
        [11, "bravo"],
        [12, "x"],
      ]),
      ratings: new Map([[10, 3.4]]),
      tiers: TIERS,
    });

    const byId = new Map(results.map((r) => [r.duo_id, r]));
    // Same tier/stars/wins → name tiebreak: Alpha before Bravo.
    expect(byId.get(10)?.overall_rank).toBe(1);
    expect(byId.get(11)?.overall_rank).toBe(2);
    expect(byId.get(10)?.tier_position).toBe(1);
    expect(byId.get(11)?.tier_position).toBe(2);
    // Under 3 matches: recorded, not ranked — even though it finished in a higher tier.
    expect(byId.get(12)?.badge_eligible).toBe(false);
    expect(byId.get(12)?.overall_rank).toBeNull();
    expect(byId.get(10)?.start_tier_name).toBe("Silver");
    expect(byId.get(10)?.final_rating).toBe(3.4);
    expect(byId.get(11)?.final_rating).toBeNull();
  });
});

describe("duo helpers", () => {
  it("canonicalPair orders low id first", () => {
    expect(canonicalPair(9, 3)).toEqual([3, 9]);
    expect(canonicalPair(3, 9)).toEqual([3, 9]);
  });

  it("teamMatchesDuo ignores seat order", () => {
    const duo = { player_low_id: 3, player_high_id: 9 };
    expect(teamMatchesDuo({ player_1_id: 9, player_2_id: 3 }, duo)).toBe(true);
    expect(teamMatchesDuo({ player_1_id: 3, player_2_id: 8 }, duo)).toBe(false);
  });

  it("duoDisplayName prefers the duo name, else nicknames", () => {
    expect(duoDisplayName("Net Ninjas", [])).toBe("Net Ninjas");
    expect(
      duoDisplayName(null, [
        { name: "Ana Cruz", nickname: "Ana" },
        { name: "Ben Reyes", nickname: null },
      ]),
    ).toBe("Ana & Ben");
  });

  it("normalizeDuoName trims, collapses whitespace and enforces length", () => {
    expect(normalizeDuoName("  Net   Ninjas ")).toEqual({ ok: true, name: "Net Ninjas" });
    expect(normalizeDuoName("   ")).toEqual({ ok: true, name: null });
    expect(normalizeDuoName("x".repeat(41)).ok).toBe(false);
    expect(normalizeDuoName(5).ok).toBe(false);
  });
});

describe("invite expiry", () => {
  it("expires exactly 7 days after the invite", () => {
    expect(inviteExpiresAt("2026-10-01T00:00:00.000Z")?.toISOString()).toBe("2026-10-08T00:00:00.000Z");
  });

  it("is live until the cutoff and expired from it", () => {
    const sent = "2026-10-01T00:00:00.000Z";
    expect(isInviteExpired(sent, new Date("2026-10-07T23:59:59.000Z"))).toBe(false);
    expect(isInviteExpired(sent, new Date("2026-10-08T00:00:00.000Z"))).toBe(true);
  });

  it("treats a missing or bad timestamp as never expiring", () => {
    expect(inviteExpiresAt(null)).toBeNull();
    expect(isInviteExpired("not a date")).toBe(false);
  });
});
