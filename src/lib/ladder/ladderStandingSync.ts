import type { AdminSupabaseClient } from "@/app/api/admin/_lib/auth";
import { fetchLatestLadderStandings } from "@/lib/ladder/ladderStandingLedger";
import { fetchLatestRatingsByPlayerIds } from "@/lib/ratingLedger";
import {
  computeNextLadderStanding,
  type LadderStanding,
  type LadderTierRow,
} from "@/lib/ladder/ladderStandingTransition";

type SyncParams = {
  matchId: number;
  playerIds: number[];
  teamByPlayerId: Map<number, 1 | 2>;
  winnerTeam: 1 | 2;
  occurredAt: string | null;
};

export type LadderMatchProgressionEvent = {
  playerId: number;
  eventType: "match_win" | "match_loss" | "promotion" | "demotion";
  tierBeforeId: number | null;
  tierAfterId: number;
  starsBefore: number | null;
  starsAfter: number;
};

export type SyncLadderStandingsResult = {
  synced: boolean;
  warning: string | null;
  tiers: Array<{ id: number; name: string }>;
  events: LadderMatchProgressionEvent[];
};

type TierBucketRow = { id: number; name: string; rank: number; elo_floor: number };

// Same bucketing as supabase/migrations/20260718000006_seed_ladder_cycle_1.sql:
// LEAST(2, FLOOR((rating - elo_floor) / 0.5)), placed into the highest tier whose floor the
// rating clears.
function placeByRating(
  rating: number,
  tiers: TierBucketRow[],
): { tierId: number; stars: number } | null {
  const sorted = [...tiers].sort((a, b) => a.rank - b.rank);
  let chosen: TierBucketRow | null = null;
  for (const tier of sorted) {
    if (rating >= tier.elo_floor) chosen = tier;
  }
  if (!chosen) return null;

  const stars = Math.min(2, Math.max(0, Math.floor((rating - chosen.elo_floor) / 0.5)));
  return { tierId: chosen.id, stars };
}

// Writes the ladder_standing_events rows produced by a match's outcome, for a match that has
// already been flagged as ladder-relevant via a ladder_matches row (see create/route.ts). This is
// the sync .claude/ladder.md deferred — see the plan doc for why it's safe to delete-and-recompute
// per match rather than resequence a player's whole history: revise/route.ts only allows revising
// a player's chronologically latest match, so the match-linked ladder event being replaced is
// always each player's latest ladder event too.
//
// Non-fatal by contract: callers should catch and surface `warning` without failing the request,
// same as the ladderWarning pattern in create/route.ts. Only real I/O errors throw.
export async function syncLadderStandingsForMatch(
  supabase: AdminSupabaseClient,
  params: SyncParams,
): Promise<SyncLadderStandingsResult> {
  const { matchId, playerIds, teamByPlayerId, winnerTeam, occurredAt } = params;

  const { data: ladderMatch, error: ladderMatchError } = await supabase
    .from("ladder_matches")
    .select("cycle_id, match_kind")
    .eq("match_id", matchId)
    .maybeSingle();

  if (ladderMatchError) {
    return {
      synced: false,
      warning: `Failed to look up ladder match: ${ladderMatchError.message}`,
      tiers: [],
      events: [],
    };
  }
  if (!ladderMatch) {
    return { synced: false, warning: null, tiers: [], events: [] };
  }
  if (ladderMatch.match_kind !== "own_tier") {
    return {
      synced: false,
      warning: `Ladder match_kind "${ladderMatch.match_kind}" is not yet supported by the standings sync.`,
      tiers: [],
      events: [],
    };
  }

  const cycleId = ladderMatch.cycle_id as number;
  const matchOccurredAt = occurredAt ?? new Date().toISOString();

  const { error: deleteError } = await supabase
    .from("ladder_standing_events")
    .delete()
    .eq("source_type", "match")
    .eq("source_id", String(matchId));

  if (deleteError) {
    return {
      synced: false,
      warning: `Failed to clear prior ladder events: ${deleteError.message}`,
      tiers: [],
      events: [],
    };
  }

  const { data: tiersData, error: tiersError } = await supabase
    .from("ladder_tiers")
    .select("id, name, rank, elo_floor");

  if (tiersError || !tiersData || tiersData.length === 0) {
    return {
      synced: false,
      warning: tiersError?.message || "No ladder tiers configured.",
      tiers: [],
      events: [],
    };
  }

  const tiers = tiersData as TierBucketRow[];
  const tierRows: LadderTierRow[] = tiers.map((t) => ({ id: t.id, rank: t.rank }));

  const standingsByPlayer = await fetchLatestLadderStandings(supabase, cycleId, playerIds);

  const warnings: string[] = [];
  const uniquePlayerIds = Array.from(new Set(playerIds));
  const missingPlayerIds = uniquePlayerIds.filter(
    (id) => !standingsByPlayer.has(String(id)),
  );

  if (missingPlayerIds.length > 0) {
    const ratingsByPlayer = await fetchLatestRatingsByPlayerIds(supabase, missingPlayerIds);

    for (const playerId of missingPlayerIds) {
      const rating = ratingsByPlayer.get(String(playerId));
      if (rating === undefined || rating === null) {
        warnings.push(`Player ${playerId} has no resolvable rating; skipped for this cycle.`);
        continue;
      }

      const placement = placeByRating(rating, tiers);
      if (!placement) {
        warnings.push(`Player ${playerId} could not be placed into a tier; skipped.`);
        continue;
      }

      const { error: seedError } = await supabase.from("ladder_standing_events").insert({
        cycle_id: cycleId,
        player_id: playerId,
        event_type: "cycle_start",
        tier_before_id: null,
        tier_after_id: placement.tierId,
        stars_before: null,
        stars_after: placement.stars,
        cushion_available: true,
        source_type: "cycle_seed",
        source_id: null,
        occurred_at: matchOccurredAt,
        metadata: { seed_rating: rating },
      });

      if (seedError) {
        warnings.push(`Failed to place player ${playerId} into the ladder: ${seedError.message}`);
        continue;
      }

      standingsByPlayer.set(String(playerId), {
        tierId: placement.tierId,
        stars: placement.stars,
        cushionAvailable: true,
      });
    }
  }

  const events: LadderMatchProgressionEvent[] = [];

  for (const playerId of uniquePlayerIds) {
    const current = standingsByPlayer.get(String(playerId));
    if (!current) continue; // already warned above

    const team = teamByPlayerId.get(playerId);
    if (!team) {
      warnings.push(`Player ${playerId} is not seated on either team; skipped.`);
      continue;
    }

    const outcome: "win" | "loss" = team === winnerTeam ? "win" : "loss";
    const next = computeNextLadderStanding(current as LadderStanding, outcome, tierRows);

    const { error: insertError } = await supabase.from("ladder_standing_events").insert({
      cycle_id: cycleId,
      player_id: playerId,
      event_type: next.eventType,
      tier_before_id: next.tierBeforeId,
      tier_after_id: next.tierAfterId,
      stars_before: next.starsBefore,
      stars_after: next.starsAfter,
      cushion_available: next.cushionAvailable,
      source_type: "match",
      source_id: String(matchId),
      occurred_at: matchOccurredAt,
      metadata: next.metadata,
    });

    if (insertError) {
      warnings.push(`Failed to record ladder standing for player ${playerId}: ${insertError.message}`);
      continue;
    }

    events.push({
      playerId,
      eventType: next.eventType,
      tierBeforeId: next.tierBeforeId,
      tierAfterId: next.tierAfterId,
      starsBefore: next.starsBefore,
      starsAfter: next.starsAfter,
    });
  }

  return {
    synced: true,
    warning: warnings.length > 0 ? warnings.join(" ") : null,
    tiers: tiers.map((t) => ({ id: t.id, name: t.name })),
    events,
  };
}
