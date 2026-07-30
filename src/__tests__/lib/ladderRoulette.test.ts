import { describe, expect, it } from "vitest";
import { buildRouletteGroups, type GroupSplit } from "../../lib/ladder/ladderRoulette";

// buildRouletteGroups is randomized (shuffle + restarts), so behavioural assertions are
// repeated to make sure they hold for every arrangement it can produce, not just a lucky one.
const RUNS = 50;

const noRatings = new Map<string, number | null>();

function partners(groups: GroupSplit[]): Array<[number, number]> {
  return groups.flatMap(({ split }) => [split[0], split[1]]);
}

function isPartnered(groups: GroupSplit[], a: number, b: number): boolean {
  return partners(groups).some(
    ([p1, p2]) => (p1 === a && p2 === b) || (p1 === b && p2 === a),
  );
}

describe("buildRouletteGroups", () => {
  it("never re-pairs players who partnered in their last ladder match", () => {
    const eligible = [1, 2, 3, 4, 5, 6, 7, 8];
    const lastPartner = new Map([
      [1, 2],
      [3, 4],
    ]);

    for (let i = 0; i < RUNS; i++) {
      const { groups } = buildRouletteGroups(eligible, lastPartner, noRatings);
      expect(groups).toHaveLength(2);
      expect(isPartnered(groups, 1, 2)).toBe(false);
      expect(isPartnered(groups, 3, 4)).toBe(false);
      expect(groups.every((g) => g.forcedRepeat === null)).toBe(true);
    }
  });

  it("reshuffles across foursomes when a naive slice would force a repeat", () => {
    // 2, 3 and 4 all last partnered with 1, so any foursome containing all four of
    // them has no clean 2-2 split. A clean arrangement exists only if one of them is
    // moved into the other foursome.
    const eligible = [1, 2, 3, 4, 5, 6, 7, 8];
    const lastPartner = new Map([
      [2, 1],
      [3, 1],
      [4, 1],
    ]);

    for (let i = 0; i < RUNS; i++) {
      const { groups } = buildRouletteGroups(eligible, lastPartner, noRatings);
      expect(groups).toHaveLength(2);
      expect(groups.every((g) => g.forcedRepeat === null)).toBe(true);
      expect(isPartnered(groups, 1, 2)).toBe(false);
      expect(isPartnered(groups, 1, 3)).toBe(false);
      expect(isPartnered(groups, 1, 4)).toBe(false);
    }
  });

  it("still produces a match when a repeat is unavoidable, and reports it", () => {
    // Only one possible foursome, and every 2-2 split of it repeats a partnership.
    const eligible = [1, 2, 3, 4];
    const lastPartner = new Map([
      [2, 1],
      [3, 1],
      [4, 1],
    ]);

    for (let i = 0; i < RUNS; i++) {
      const { groups, leftoverIds } = buildRouletteGroups(eligible, lastPartner, noRatings);
      expect(groups).toHaveLength(1);
      expect(leftoverIds).toHaveLength(0);

      const { forcedRepeat } = groups[0];
      expect(forcedRepeat).not.toBeNull();
      // The reported pair is genuinely a repeat, and is genuinely in the split.
      const [a, b] = forcedRepeat as [number, number];
      expect(lastPartner.get(a) === b || lastPartner.get(b) === a).toBe(true);
      expect(isPartnered(groups, a, b)).toBe(true);
    }
  });

  it("leaves the remainder of a non-multiple-of-4 pool as leftovers", () => {
    const { groups, leftoverIds } = buildRouletteGroups([1, 2, 3, 4, 5, 6], new Map(), noRatings);
    expect(groups).toHaveLength(1);
    expect(leftoverIds).toHaveLength(2);

    const used = partners(groups).flat();
    expect(used).toHaveLength(4);
    expect([...used, ...leftoverIds].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("returns no groups when there are fewer than 4 eligible players", () => {
    const { groups, leftoverIds } = buildRouletteGroups([1, 2, 3], new Map(), noRatings);
    expect(groups).toHaveLength(0);
    expect(leftoverIds).toEqual([1, 2, 3]);
  });

  it("balances team ratings among the splits with no repeat", () => {
    // Two 1000s and two 1400s: only the splits that pair a 1000 with a 1400 are level.
    const ratings = new Map<string, number | null>([
      ["1", 1000],
      ["2", 1000],
      ["3", 1400],
      ["4", 1400],
    ]);

    for (let i = 0; i < RUNS; i++) {
      const { groups } = buildRouletteGroups([1, 2, 3, 4], new Map(), ratings);
      expect(isPartnered(groups, 1, 2)).toBe(false);
      expect(isPartnered(groups, 3, 4)).toBe(false);
    }
  });

  it("treats a missing rating as the average of the rest of the group", () => {
    // 4 has no rating, so it is treated as 1200 — the same as pairing it with 1 or 2
    // would be. The split must stay level rather than crashing or reading it as 0.
    const ratings = new Map<string, number | null>([
      ["1", 1200],
      ["2", 1200],
      ["3", 1200],
      ["4", null],
    ]);

    const { groups } = buildRouletteGroups([1, 2, 3, 4], new Map(), ratings);
    expect(groups).toHaveLength(1);
    expect(groups[0].forcedRepeat).toBeNull();
  });
});
