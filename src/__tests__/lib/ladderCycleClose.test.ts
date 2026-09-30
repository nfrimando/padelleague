import { describe, expect, it } from "vitest";
import {
  computeCycleResults,
  LADDER_BADGE_MIN_MATCHES,
  type ComputeCycleResultsInput,
  type LadderCycleFinalStanding,
  type LadderCycleTally,
} from "../../lib/ladder/ladderCycleClose";
import type { TierBucketRow } from "../../lib/ladder/ladderPlacement";

const TIERS: TierBucketRow[] = [
  { id: 1, name: "Bronze", rank: 1, elo_floor: 0 },
  { id: 2, name: "Silver", rank: 2, elo_floor: 1.5 },
  { id: 3, name: "Gold", rank: 3, elo_floor: 3 },
];

type PlayerSpec = {
  playerId: number;
  name: string;
  tierId: number;
  stars: number;
  matchesPlayed?: number;
  wins?: number;
  losses?: number;
  rating?: number;
};

function buildInput(specs: PlayerSpec[]): ComputeCycleResultsInput {
  const standings: LadderCycleFinalStanding[] = [];
  const talliesByPlayer = new Map<string, LadderCycleTally>();
  const namesByPlayer = new Map<string, string>();
  const ratingsByPlayer = new Map<string, number>();

  for (const spec of specs) {
    const key = String(spec.playerId);
    standings.push({ playerId: spec.playerId, tierId: spec.tierId, stars: spec.stars });
    namesByPlayer.set(key, spec.name);
    if (spec.rating !== undefined) ratingsByPlayer.set(key, spec.rating);
    if (spec.matchesPlayed !== undefined) {
      talliesByPlayer.set(key, {
        matchesPlayed: spec.matchesPlayed,
        wins: spec.wins ?? 0,
        losses: spec.losses ?? 0,
      });
    }
  }

  return { standings, talliesByPlayer, namesByPlayer, ratingsByPlayer, tiers: TIERS };
}

function byId(results: ReturnType<typeof computeCycleResults>, playerId: number) {
  const found = results.find((r) => r.player_id === playerId);
  if (!found) throw new Error(`No result row for player ${playerId}`);
  return found;
}

describe("computeCycleResults — badge eligibility", () => {
  it("treats exactly the minimum match count as eligible", () => {
    const results = computeCycleResults(
      buildInput([
        { playerId: 1, name: "Ana Reyes", tierId: 2, stars: 1, matchesPlayed: LADDER_BADGE_MIN_MATCHES },
      ]),
    );

    expect(byId(results, 1).badge_eligible).toBe(true);
    expect(byId(results, 1).overall_rank).toBe(1);
  });

  it("marks a player one match short as ineligible with null ranks", () => {
    const results = computeCycleResults(
      buildInput([
        { playerId: 1, name: "Ana Reyes", tierId: 2, stars: 1, matchesPlayed: LADDER_BADGE_MIN_MATCHES - 1 },
      ]),
    );

    const row = byId(results, 1);
    expect(row.badge_eligible).toBe(false);
    expect(row.overall_rank).toBeNull();
    expect(row.tier_position).toBeNull();
  });

  it("still records a seeded player who never played, with a zeroed match record", () => {
    const results = computeCycleResults(
      buildInput([{ playerId: 9, name: "Never Played", tierId: 1, stars: 0 }]),
    );

    const row = byId(results, 9);
    expect(row.badge_eligible).toBe(false);
    expect(row.matches_played).toBe(0);
    expect(row.wins).toBe(0);
    expect(row.losses).toBe(0);
    expect(row.overall_rank).toBeNull();
  });

  // The ladder backfill placed every rated player into the cycle, so an idle player sitting in a
  // high tier must not outrank someone who actually played in a lower one.
  it("excludes ineligible players from the ranked pool entirely", () => {
    const results = computeCycleResults(
      buildInput([
        { playerId: 1, name: "Idle Topseed", tierId: 3, stars: 2, matchesPlayed: 0 },
        { playerId: 2, name: "Active Grinder", tierId: 1, stars: 1, matchesPlayed: 5, wins: 3, losses: 2 },
      ]),
    );

    expect(byId(results, 2).overall_rank).toBe(1);
    expect(byId(results, 1).overall_rank).toBeNull();
    expect(results.filter((r) => r.overall_rank !== null)).toHaveLength(1);
  });
});

describe("computeCycleResults — ordering", () => {
  it("ranks a higher tier above more stars in a lower tier", () => {
    const results = computeCycleResults(
      buildInput([
        { playerId: 1, name: "Low Tier Maxed", tierId: 2, stars: 2, matchesPlayed: 4 },
        { playerId: 2, name: "High Tier Fresh", tierId: 3, stars: 0, matchesPlayed: 4 },
      ]),
    );

    expect(byId(results, 2).overall_rank).toBe(1);
    expect(byId(results, 1).overall_rank).toBe(2);
  });

  it("breaks a same-tier tie by stars, then wins, then surname", () => {
    const results = computeCycleResults(
      buildInput([
        { playerId: 1, name: "Zoe Alvarez", tierId: 2, stars: 1, matchesPlayed: 3, wins: 1 },
        { playerId: 2, name: "Amy Zamora", tierId: 2, stars: 1, matchesPlayed: 3, wins: 1 },
        { playerId: 3, name: "Bea Cruz", tierId: 2, stars: 1, matchesPlayed: 5, wins: 3 },
        { playerId: 4, name: "Cid Diaz", tierId: 2, stars: 2, matchesPlayed: 3, wins: 2 },
      ]),
    );

    // 2 stars first; then among 1-star players, more wins; then surname (Alvarez before Zamora).
    expect(byId(results, 4).overall_rank).toBe(1);
    expect(byId(results, 3).overall_rank).toBe(2);
    expect(byId(results, 1).overall_rank).toBe(3);
    expect(byId(results, 2).overall_rank).toBe(4);
  });

  it("assigns unique consecutive overall ranks", () => {
    const results = computeCycleResults(
      buildInput([
        { playerId: 1, name: "A One", tierId: 2, stars: 1, matchesPlayed: 3 },
        { playerId: 2, name: "B Two", tierId: 2, stars: 1, matchesPlayed: 3 },
        { playerId: 3, name: "C Three", tierId: 2, stars: 1, matchesPlayed: 3 },
      ]),
    );

    expect(
      results.map((r) => r.overall_rank).sort((a, b) => (a ?? 0) - (b ?? 0)),
    ).toEqual([1, 2, 3]);
  });
});

describe("computeCycleResults — tier positions", () => {
  it("restarts tier_position at 1 within each tier", () => {
    const results = computeCycleResults(
      buildInput([
        { playerId: 1, name: "Gold Best", tierId: 3, stars: 2, matchesPlayed: 4 },
        { playerId: 2, name: "Gold Second", tierId: 3, stars: 1, matchesPlayed: 4 },
        { playerId: 3, name: "Silver Best", tierId: 2, stars: 2, matchesPlayed: 4 },
        { playerId: 4, name: "Silver Second", tierId: 2, stars: 0, matchesPlayed: 4 },
      ]),
    );

    expect(byId(results, 1)).toMatchObject({ overall_rank: 1, tier_position: 1 });
    expect(byId(results, 2)).toMatchObject({ overall_rank: 2, tier_position: 2 });
    expect(byId(results, 3)).toMatchObject({ overall_rank: 3, tier_position: 1 });
    expect(byId(results, 4)).toMatchObject({ overall_rank: 4, tier_position: 2 });
  });
});

describe("computeCycleResults — recorded facts", () => {
  it("denormalizes the tier name and rank so a later tier reseed can't rewrite history", () => {
    const results = computeCycleResults(
      buildInput([{ playerId: 1, name: "Ana Reyes", tierId: 3, stars: 2, matchesPlayed: 3 }]),
    );

    expect(byId(results, 1)).toMatchObject({
      tier_id: 3,
      tier_name: "Gold",
      tier_rank: 3,
      stars: 2,
    });
  });

  it("carries the match record and final rating through", () => {
    const results = computeCycleResults(
      buildInput([
        {
          playerId: 1,
          name: "Ana Reyes",
          tierId: 2,
          stars: 1,
          matchesPlayed: 7,
          wins: 4,
          losses: 3,
          rating: 2.4,
        },
      ]),
    );

    expect(byId(results, 1)).toMatchObject({
      matches_played: 7,
      wins: 4,
      losses: 3,
      final_rating: 2.4,
    });
  });

  it("records a null final_rating when the player has no resolvable rating", () => {
    const results = computeCycleResults(
      buildInput([{ playerId: 1, name: "Ana Reyes", tierId: 2, stars: 1, matchesPlayed: 3 }]),
    );

    expect(byId(results, 1).final_rating).toBeNull();
  });

  it("skips a standing whose tier is no longer defined", () => {
    const input = buildInput([
      { playerId: 1, name: "Ana Reyes", tierId: 2, stars: 1, matchesPlayed: 3 },
    ]);
    input.standings.push({ playerId: 2, tierId: 999, stars: 1 });

    const results = computeCycleResults(input);

    expect(results).toHaveLength(1);
    expect(results[0].player_id).toBe(1);
  });
});
