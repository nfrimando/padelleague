import { describe, expect, it } from "vitest";
import type { AdminSupabaseClient } from "../../app/api/admin/_lib/auth";
import { reanchorPlayerChainsAfter } from "../../lib/ratings/reanchorChain";

type LedgerSeed = {
  player_id: number;
  rating_before: number | null;
  rating_after: number;
  source_type: string | null;
  source_id: string | null;
  occurred_at: string | null;
  created_at: string;
};

type RatingSeed = {
  rating_id: number;
  player_id: number;
  match_id: number;
  formula_name: string;
};

type Update = { ratingId: number; rating_pre: number; rating_post: number };

// Minimal stand-in for the PostgREST builder surface reanchorPlayerChainsAfter uses.
function makeSupabase(ledger: LedgerSeed[], ratings: RatingSeed[]) {
  const updates: Update[] = [];

  const client = {
    from(table: string) {
      if (table === "player_rating_events") {
        const sorted = [...ledger].sort((a, b) => {
          const aOccurred = a.occurred_at ?? "";
          const bOccurred = b.occurred_at ?? "";
          if (aOccurred !== bOccurred) return aOccurred < bOccurred ? -1 : 1;
          return a.created_at < b.created_at ? -1 : 1;
        });
        const builder = {
          select: () => builder,
          in: (_column: string, playerIds: number[]) => {
            builder.rows = sorted.filter((row) => playerIds.includes(row.player_id));
            return builder;
          },
          order: () => builder,
          rows: [] as LedgerSeed[],
          then: (resolve: (value: { data: LedgerSeed[]; error: null }) => unknown) =>
            resolve({ data: builder.rows, error: null }),
        };
        return builder;
      }

      if (table === "match_player_ratings") {
        let matchId: number | null = null;
        let playerId: number | null = null;
        let pendingUpdate: { rating_pre: number; rating_post: number } | null = null;
        let ratingId: number | null = null;

        const builder = {
          select: () => builder,
          update: (values: { rating_pre: number; rating_post: number }) => {
            pendingUpdate = values;
            return builder;
          },
          eq: (column: string, value: number) => {
            if (column === "match_id") matchId = value;
            if (column === "player_id") playerId = value;
            if (column === "rating_id") ratingId = value;
            return builder;
          },
          then: (resolve: (value: { data: unknown; error: null }) => unknown) => {
            if (pendingUpdate && ratingId !== null) {
              updates.push({ ratingId, ...pendingUpdate });
              return resolve({ data: null, error: null });
            }
            const rows = ratings.filter(
              (row) => row.match_id === matchId && row.player_id === playerId,
            );
            return resolve({ data: rows, error: null });
          },
        };
        return builder;
      }

      throw new Error(`unexpected table ${table}`);
    },
  };

  return { client: client as unknown as AdminSupabaseClient, updates };
}

const PIVOT = "2026-08-27T14:06:42Z";

// A player whose chain is intact: genesis, the pivot match, then two later matches.
function intactLedger(): LedgerSeed[] {
  return [
    {
      player_id: 139,
      rating_before: null,
      rating_after: 0.6,
      source_type: null,
      source_id: null,
      occurred_at: null,
      created_at: "2026-06-17T05:41:26Z",
    },
    {
      player_id: 139,
      rating_before: 0.6,
      rating_after: 0.68,
      source_type: "match",
      source_id: "839",
      occurred_at: PIVOT,
      created_at: PIVOT,
    },
    {
      player_id: 139,
      rating_before: 0.68,
      rating_after: 1.09,
      source_type: "match",
      source_id: "865",
      occurred_at: "2026-08-31T04:12:05Z",
      created_at: "2026-08-31T04:12:05Z",
    },
    {
      player_id: 139,
      rating_before: 1.09,
      rating_after: 1.17,
      source_type: "match",
      source_id: "900",
      occurred_at: "2026-09-04T08:00:00Z",
      created_at: "2026-09-04T08:00:00Z",
    },
  ];
}

const RATINGS: RatingSeed[] = [
  { rating_id: 1, player_id: 139, match_id: 839, formula_name: "v3" },
  { rating_id: 2, player_id: 139, match_id: 865, formula_name: "v3" },
  { rating_id: 3, player_id: 139, match_id: 900, formula_name: "v3" },
];

describe("reanchorPlayerChainsAfter", () => {
  it("does nothing when the chain is already continuous", async () => {
    const { client, updates } = makeSupabase(intactLedger(), RATINGS);

    const report = await reanchorPlayerChainsAfter(client, {
      pivotAt: PIVOT,
      playerIds: [139],
    });

    expect(report.adjustments).toEqual([]);
    expect(updates).toEqual([]);
  });

  it("shifts every later match by the break a revision opened", async () => {
    // Match 839 was revised from 0.68 to 0.72; everything after it still starts from 0.68.
    const ledger = intactLedger();
    ledger[1].rating_after = 0.72;

    const { client, updates } = makeSupabase(ledger, RATINGS);
    const report = await reanchorPlayerChainsAfter(client, {
      pivotAt: PIVOT,
      playerIds: [139],
    });

    expect(report.adjustments.map((a) => a.matchId)).toEqual([865, 900]);
    expect(report.warnings).toEqual([]);
    // Deltas survive: 865 still gains 0.41, 900 still gains 0.08.
    expect(updates).toEqual([
      { ratingId: 2, rating_pre: 0.72, rating_post: 1.13 },
      { ratingId: 3, rating_pre: 1.13, rating_post: 1.21 },
    ]);
  });

  it("closes the hole a deleted match leaves behind", async () => {
    // Match 839 was deleted, so 865 onwards still start from its rating_post.
    const ledger = intactLedger().filter((row) => row.source_id !== "839");

    const { client, updates } = makeSupabase(ledger, RATINGS);
    const report = await reanchorPlayerChainsAfter(client, {
      pivotAt: PIVOT,
      playerIds: [139],
    });

    expect(report.adjustments.map((a) => a.matchId)).toEqual([865, 900]);
    expect(updates.map((u) => u.ratingId)).toEqual([2, 3]);
    expect(updates[0].rating_pre).toBeCloseTo(0.6, 10);
    expect(updates[0].rating_post).toBeCloseTo(1.01, 10);
    expect(updates[1].rating_pre).toBeCloseTo(1.01, 10);
    expect(updates[1].rating_post).toBeCloseTo(1.09, 10);
  });

  it("leaves pre-existing breaks earlier in the chain alone", async () => {
    // An old, unrelated gap before the pivot (0.5 -> 0.6) must not be touched, and the events
    // after the pivot are already continuous, so nothing is written at all.
    const ledger = intactLedger();
    ledger[0].rating_after = 0.5;

    const { client, updates } = makeSupabase(ledger, RATINGS);
    const report = await reanchorPlayerChainsAfter(client, {
      pivotAt: PIVOT,
      playerIds: [139],
    });

    expect(report.adjustments).toEqual([]);
    expect(updates).toEqual([]);
  });

  it("reports without writing in dry-run mode", async () => {
    const ledger = intactLedger();
    ledger[1].rating_after = 0.72;

    const { client, updates } = makeSupabase(ledger, RATINGS);
    const report = await reanchorPlayerChainsAfter(client, {
      pivotAt: PIVOT,
      playerIds: [139],
      dryRun: true,
    });

    expect(report.adjustments).toHaveLength(2);
    expect(updates).toEqual([]);
  });

  it("stops shifting at a non-match event, which sets a rating absolutely", async () => {
    const ledger = intactLedger();
    ledger[1].rating_after = 0.72;
    ledger[2] = {
      player_id: 139,
      rating_before: 0.68,
      rating_after: 2.0,
      source_type: "recalibration",
      source_id: "abc",
      occurred_at: "2026-08-31T04:12:05Z",
      created_at: "2026-08-31T04:12:05Z",
    };

    const { client, updates } = makeSupabase(ledger, RATINGS);
    const report = await reanchorPlayerChainsAfter(client, {
      pivotAt: PIVOT,
      playerIds: [139],
    });

    expect(report.adjustments).toEqual([]);
    expect(updates).toEqual([]);
  });
});
