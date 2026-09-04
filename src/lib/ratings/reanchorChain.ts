import type { AdminSupabaseClient } from "@/app/api/admin/_lib/auth";

// Re-anchors a player's rating chain after a match mutation lands BEHIND the tail of the ledger.
//
// The ledger is a chain: every event's rating_before must equal the previous event's rating_after.
// Completing a match always appends to the tail (occurred_at = matches.result_recorded_at, see
// 20260904000000), so the chain stays intact on its own. Two admin actions can still break it:
//
//   * deleting a completed match — the ledger row cascades away, but every LATER event for those
//     players is still anchored to the deleted match's rating_post;
//   * revising a match, or re-completing one that was un-completed — the match keeps its original
//     (sticky) anchor, so its new rating_post no longer matches what came after it.
//
// In both cases exactly one link is broken: the one spanning the mutated match's position. This
// shifts that link's successor, and every event after it, by the size of the break — deltas are
// preserved, so opponents are untouched and there is no cascade fan-out. Pre-existing breaks
// elsewhere in the chain are deliberately left alone (see the plan's "no historical rewrite" rule):
// shifting by a single constant offset carries them along unchanged.
//
// Writes go to match_player_ratings (the mirror source), so the sync trigger propagates them into
// player_rating_events and per-match displays stay consistent.
//
// Non-fatal by contract: callers should catch and surface `warnings` rather than failing the
// request, same as the ladderWarning pattern in the admin match routes.

const DEFAULT_TOLERANCE = 1e-6;

const FORMULA_PRIORITY: Record<string, number> = { v3: 2, v2: 1 };

function formulaPriority(formulaName: string | null): number {
  if (!formulaName) return 0;
  return FORMULA_PRIORITY[formulaName.toLowerCase()] ?? 0;
}

function toFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

type LedgerRow = {
  player_id: number | string | null;
  rating_before: number | string | null;
  rating_after: number | string | null;
  source_type: string | null;
  source_id: string | null;
  occurred_at: string | null;
  created_at: string | null;
};

export type ReanchorAdjustment = {
  playerId: number;
  matchId: number;
  ratingPreFrom: number;
  ratingPreTo: number;
  ratingPostFrom: number;
  ratingPostTo: number;
};

export type ReanchorReport = {
  adjustments: ReanchorAdjustment[];
  warnings: string[];
};

type ReanchorOptions = {
  // Anchor of the mutated match (matches.result_recorded_at). Events at or before it are treated as
  // settled; the first event after it is where a break can appear.
  pivotAt: string | null;
  playerIds: number[];
  dryRun?: boolean;
  tolerance?: number;
};

export async function reanchorPlayerChainsAfter(
  supabase: AdminSupabaseClient,
  { pivotAt, playerIds, dryRun = false, tolerance = DEFAULT_TOLERANCE }: ReanchorOptions,
): Promise<ReanchorReport> {
  const report: ReanchorReport = { adjustments: [], warnings: [] };

  const uniquePlayerIds = Array.from(
    new Set(playerIds.filter((id) => Number.isInteger(id) && id > 0)),
  );
  if (uniquePlayerIds.length === 0 || !pivotAt) {
    return report;
  }

  const { data, error } = await supabase
    .from("player_rating_events")
    .select("player_id, rating_before, rating_after, source_type, source_id, occurred_at, created_at")
    .in("player_id", uniquePlayerIds)
    .order("occurred_at", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true });

  if (error) {
    report.warnings.push(`Failed to load rating ledger: ${error.message}`);
    return report;
  }

  const byPlayer = new Map<number, LedgerRow[]>();
  for (const row of (data ?? []) as LedgerRow[]) {
    const playerId = toFiniteNumber(row.player_id);
    if (playerId === null) continue;
    const list = byPlayer.get(playerId);
    if (list) list.push(row);
    else byPlayer.set(playerId, [row]);
  }

  for (const playerId of uniquePlayerIds) {
    const events = byPlayer.get(playerId) ?? [];

    // Split at the pivot: the last settled event, then everything the mutation could have orphaned.
    // occurred_at IS NULL is the initial_rating genesis event — always settled.
    const pivotIndex = events.reduce(
      (last, event, index) =>
        event.occurred_at === null || event.occurred_at <= pivotAt ? index : last,
      -1,
    );
    if (pivotIndex < 0 || pivotIndex === events.length - 1) {
      continue; // nothing settled before the pivot, or nothing after it — no link to repair
    }

    const previousRating = toFiniteNumber(events[pivotIndex].rating_after);
    const successor = events[pivotIndex + 1];
    const successorBefore = toFiniteNumber(successor.rating_before);
    if (previousRating === null || successorBefore === null) continue;

    const offset = previousRating - successorBefore;
    if (Math.abs(offset) <= tolerance) continue;

    for (const event of events.slice(pivotIndex + 1)) {
      if (event.source_type !== "match") {
        // A non-match event (recalibration, admin adjustment) sets a rating absolutely, so it
        // anchors the chain again — stop shifting there.
        break;
      }
      const matchId = toFiniteNumber(event.source_id);
      const ratingBefore = toFiniteNumber(event.rating_before);
      const ratingAfter = toFiniteNumber(event.rating_after);
      if (matchId === null || ratingBefore === null || ratingAfter === null) continue;

      report.adjustments.push({
        playerId,
        matchId,
        ratingPreFrom: ratingBefore,
        ratingPreTo: ratingBefore + offset,
        ratingPostFrom: ratingAfter,
        ratingPostTo: ratingAfter + offset,
      });
    }
  }

  if (dryRun || report.adjustments.length === 0) {
    return report;
  }

  for (const adjustment of report.adjustments) {
    // Only the highest-priority formula row feeds the ledger (v3 > v2), so that is the one to move.
    const { data: ratingRows, error: ratingRowsError } = await supabase
      .from("match_player_ratings")
      .select("rating_id, formula_name")
      .eq("player_id", adjustment.playerId)
      .eq("match_id", adjustment.matchId);

    if (ratingRowsError || !ratingRows || ratingRows.length === 0) {
      report.warnings.push(
        `Could not load ratings for player ${adjustment.playerId} on match ${adjustment.matchId}: ${
          ratingRowsError?.message ?? "no rows"
        }`,
      );
      continue;
    }

    const target = [...ratingRows].sort(
      (a, b) =>
        formulaPriority(b.formula_name as string | null) -
        formulaPriority(a.formula_name as string | null),
    )[0];

    const { error: updateError } = await supabase
      .from("match_player_ratings")
      .update({
        rating_pre: adjustment.ratingPreTo,
        rating_post: adjustment.ratingPostTo,
      })
      .eq("rating_id", target.rating_id);

    if (updateError) {
      report.warnings.push(
        `Failed to re-anchor player ${adjustment.playerId} on match ${adjustment.matchId}: ${updateError.message}`,
      );
    }
  }

  return report;
}
