import type { AdminSupabaseClient } from "@/app/api/admin/_lib/auth";
import { getLastNameKey } from "@/lib/utils";
import { fetchLatestRatingsByPlayerIds } from "@/lib/ratingLedger";
import type { TierBucketRow } from "@/lib/ladder/ladderPlacement";

// A player needs this many completed ladder matches in the cycle to earn a badge and a rank.
// Players below it are still recorded (with null ranks) so the threshold stays revisitable.
export const LADDER_BADGE_MIN_MATCHES = 3;

export type LadderCycleTally = {
  matchesPlayed: number;
  wins: number;
  losses: number;
};

export type LadderCycleFinalStanding = {
  playerId: number;
  tierId: number;
  stars: number;
};

export type LadderCycleResultDraft = {
  player_id: number;
  tier_id: number;
  tier_name: string;
  tier_rank: number;
  stars: number;
  matches_played: number;
  wins: number;
  losses: number;
  overall_rank: number | null;
  tier_position: number | null;
  badge_eligible: boolean;
  final_rating: number | null;
};

export type ComputeCycleResultsInput = {
  standings: LadderCycleFinalStanding[];
  talliesByPlayer: Map<string, LadderCycleTally>;
  namesByPlayer: Map<string, string>;
  ratingsByPlayer: Map<string, number | null>;
  tiers: TierBucketRow[];
};

// Pure ranking pass — the piece worth unit-testing.
//
// Ranks cover badge-eligible players only. The ladder was backfilled so that EVERY rated player
// holds a cycle_start row (20260808000000_backfill_ladder_placement_all_players.sql), so ranking
// everyone would let people who never played outrank people who did.
//
// Sort order deliberately matches what /ladder displayed all cycle (src/lib/ladderData.ts): stars
// desc, then wins desc, then last name — extended with tier rank desc to span tiers. The name
// tiebreak makes ranks unique 1..N and keeps them in step with the order players actually saw.
export function computeCycleResults(
  input: ComputeCycleResultsInput,
): LadderCycleResultDraft[] {
  const { standings, talliesByPlayer, namesByPlayer, ratingsByPlayer, tiers } = input;

  const tierById = new Map<number, TierBucketRow>();
  for (const tier of tiers) tierById.set(tier.id, tier);

  const drafts: LadderCycleResultDraft[] = [];

  for (const standing of standings) {
    const tier = tierById.get(standing.tierId);
    if (!tier) continue; // tier_after_id is a FK, so this only trips on a mid-flight tier delete

    const key = String(standing.playerId);
    const tally = talliesByPlayer.get(key);
    const matchesPlayed = tally?.matchesPlayed ?? 0;
    const rating = ratingsByPlayer.get(key);

    drafts.push({
      player_id: standing.playerId,
      tier_id: tier.id,
      tier_name: tier.name,
      tier_rank: tier.rank,
      stars: standing.stars,
      matches_played: matchesPlayed,
      wins: tally?.wins ?? 0,
      losses: tally?.losses ?? 0,
      overall_rank: null,
      tier_position: null,
      badge_eligible: matchesPlayed >= LADDER_BADGE_MIN_MATCHES,
      final_rating: rating === undefined || rating === null ? null : rating,
    });
  }

  const eligible = drafts
    .filter((d) => d.badge_eligible)
    .sort((a, b) => {
      if (b.tier_rank !== a.tier_rank) return b.tier_rank - a.tier_rank;
      if (b.stars !== a.stars) return b.stars - a.stars;
      if (b.wins !== a.wins) return b.wins - a.wins;
      return getLastNameKey(namesByPlayer.get(String(a.player_id)) ?? "").localeCompare(
        getLastNameKey(namesByPlayer.get(String(b.player_id)) ?? ""),
      );
    });

  // One walk assigns both placings: eligible is already in final order, so each tier's players are
  // contiguous within it and a per-tier counter yields tier_position.
  const positionByTier = new Map<number, number>();
  eligible.forEach((draft, index) => {
    draft.overall_rank = index + 1;
    const nextPosition = (positionByTier.get(draft.tier_id) ?? 0) + 1;
    positionByTier.set(draft.tier_id, nextPosition);
    draft.tier_position = nextPosition;
  });

  return drafts;
}

type StandingRow = {
  player_id: number | string;
  event_type: string;
  tier_after_id: number;
  stars_after: number;
  source_type: string | null;
  occurred_at: string | null;
  created_at: string;
};

export type CloseLadderCycleOptions = {
  cycleId: number;
  dryRun?: boolean;
  recompute?: boolean;
};

export type CloseLadderCycleResult =
  | {
      ok: true;
      cycle: { id: number; label: string; status: string };
      results: LadderCycleResultDraft[];
      namesByPlayer: Record<string, string>;
      written: boolean;
      warnings: string[];
    }
  | { ok: false; error: string };

// Closes a ladder cycle: snapshots every placed player's final tier/stars/match record into
// ladder_cycle_results, then marks the cycle completed. This is the only writer of
// ladder_cycles.status anywhere — the cycle lifecycle .claude/ladder.md deferred.
//
// Deliberately does NOT create the next cycle or run the "everyone drops a tier, floored by ELO"
// reset; that is a separate admin trigger. Closing therefore leaves no active cycle, which makes
// the roulette and ladder-match creation error until the next cycle exists (both hard-require
// status='active') — intended, and surfaced in the admin UI's confirm step.
//
// `dryRun` computes and returns the snapshot without writing anything, so an admin can check the
// eligibility list before committing. `recompute` re-runs against an already-completed cycle,
// needed because a post-close score revision re-syncs ladder_standing_events.
export async function closeLadderCycle(
  supabase: AdminSupabaseClient,
  options: CloseLadderCycleOptions,
): Promise<CloseLadderCycleResult> {
  const { cycleId, dryRun = false, recompute = false } = options;
  const warnings: string[] = [];

  const { data: cycleData, error: cycleError } = await supabase
    .from("ladder_cycles")
    .select("id, label, status")
    .eq("id", cycleId)
    .maybeSingle();

  if (cycleError) return { ok: false, error: `Failed to load cycle: ${cycleError.message}` };
  if (!cycleData) return { ok: false, error: `Ladder cycle ${cycleId} not found.` };

  const cycle = {
    id: cycleData.id as number,
    label: (cycleData.label as string) ?? `Cycle ${cycleId}`,
    status: (cycleData.status as string) ?? "unknown",
  };

  if (cycle.status !== "active" && !recompute) {
    return {
      ok: false,
      error: `Cycle "${cycle.label}" is ${cycle.status}, not active. Use recompute to rebuild a completed cycle's snapshot.`,
    };
  }
  if (recompute && cycle.status !== "active" && cycle.status !== "completed") {
    return {
      ok: false,
      error: `Cycle "${cycle.label}" is ${cycle.status}; only an active or completed cycle can be recomputed.`,
    };
  }

  const { data: tiersData, error: tiersError } = await supabase
    .from("ladder_tiers")
    .select("id, name, rank, elo_floor");

  if (tiersError) return { ok: false, error: `Failed to load tiers: ${tiersError.message}` };
  if (!tiersData || tiersData.length === 0) {
    return { ok: false, error: "No ladder tiers configured." };
  }
  const tiers = (tiersData as TierBucketRow[]).map((t) => ({
    id: t.id,
    name: t.name,
    rank: t.rank,
    elo_floor: Number(t.elo_floor),
  }));

  // Same single-query-then-reduce shape as fetchLadderPageDataUncached: the first row seen per
  // player is their final standing, and every row is scanned for the match tallies.
  const { data: standingsData, error: standingsError } = await supabase
    .from("ladder_standing_events")
    .select("player_id, event_type, tier_after_id, stars_after, source_type, occurred_at, created_at")
    .eq("cycle_id", cycleId)
    .order("occurred_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (standingsError) {
    return { ok: false, error: `Failed to load standing events: ${standingsError.message}` };
  }

  const standingRows = (standingsData ?? []) as StandingRow[];
  if (standingRows.length === 0) {
    return { ok: false, error: `No ladder standings recorded for cycle "${cycle.label}".` };
  }

  const standings: LadderCycleFinalStanding[] = [];
  const seen = new Set<string>();
  const talliesByPlayer = new Map<string, LadderCycleTally>();

  for (const row of standingRows) {
    const key = String(row.player_id);

    // Only completed/revised matches ever write source_type='match' rows, and uniq_lse_match
    // guarantees one per player per match — so these counts are exact.
    if (row.source_type === "match") {
      const tally = talliesByPlayer.get(key) ?? { matchesPlayed: 0, wins: 0, losses: 0 };
      tally.matchesPlayed += 1;
      if (row.event_type === "match_win" || row.event_type === "promotion") tally.wins += 1;
      else if (row.event_type === "match_loss" || row.event_type === "demotion") tally.losses += 1;
      talliesByPlayer.set(key, tally);
    }

    if (seen.has(key)) continue;
    seen.add(key);
    standings.push({
      playerId: Number(row.player_id),
      tierId: row.tier_after_id,
      stars: row.stars_after,
    });
  }

  const playerIds = standings.map((s) => s.playerId);

  const { data: playersData, error: playersError } = await supabase
    .from("players")
    .select("player_id, name")
    .in("player_id", playerIds);

  if (playersError) return { ok: false, error: `Failed to load players: ${playersError.message}` };

  const namesByPlayer = new Map<string, string>();
  for (const p of (playersData ?? []) as Array<{ player_id: number | string; name: string | null }>) {
    namesByPlayer.set(String(p.player_id), p.name ?? "");
  }

  const ratingsByPlayer = await fetchLatestRatingsByPlayerIds(supabase, playerIds);

  const results = computeCycleResults({
    standings,
    talliesByPlayer,
    namesByPlayer,
    ratingsByPlayer,
    tiers,
  });

  if (results.length < standings.length) {
    warnings.push(
      `${standings.length - results.length} player(s) held a standing in an unknown tier and were skipped.`,
    );
  }

  if (dryRun) {
    return {
      ok: true,
      cycle,
      results,
      namesByPlayer: Object.fromEntries(namesByPlayer),
      written: false,
      warnings,
    };
  }

  // Delete-then-insert keeps recompute idempotent against the UNIQUE (cycle_id, player_id) guard.
  const { error: deleteError } = await supabase
    .from("ladder_cycle_results")
    .delete()
    .eq("cycle_id", cycleId);

  if (deleteError) {
    return { ok: false, error: `Failed to clear prior results: ${deleteError.message}` };
  }

  const CHUNK_SIZE = 500;
  for (let i = 0; i < results.length; i += CHUNK_SIZE) {
    const chunk = results.slice(i, i + CHUNK_SIZE).map((r) => ({ ...r, cycle_id: cycleId }));
    const { error: insertError } = await supabase.from("ladder_cycle_results").insert(chunk);
    if (insertError) {
      return { ok: false, error: `Failed to write cycle results: ${insertError.message}` };
    }
  }

  const { error: updateError } = await supabase
    .from("ladder_cycles")
    .update({
      status: "completed",
      ends_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", cycleId);

  if (updateError) {
    // The snapshot landed; only the status flip failed. Say so rather than implying a clean close.
    return {
      ok: false,
      error: `Results were written, but marking the cycle completed failed: ${updateError.message}`,
    };
  }

  return {
    ok: true,
    cycle: { ...cycle, status: "completed" },
    results,
    namesByPlayer: Object.fromEntries(namesByPlayer),
    written: true,
    warnings,
  };
}
