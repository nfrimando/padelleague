import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureDuoPlacement } from "@/lib/ladder/ladderDuoPlacement";
import { syncWaitingDuoEntriesToStanding } from "@/lib/ladder/ladderDuoQueue";
import { isMissingTableError } from "@/lib/ladder/ladderSchema";
import { canonicalPair } from "@/lib/ladder/ladderDuoShared";
import {
  computeNextLadderStanding,
  type LadderTierRow,
} from "@/lib/ladder/ladderStandingTransition";
import type {
  LadderMatchProgressionEvent,
  SyncLadderStandingsResult,
} from "@/lib/ladder/ladderStandingSync";

// The duo-ladder counterpart of syncLadderStandingsForMatch: writes one ladder_duo_standing_events
// row per duo (2 per match) from a completed duo ladder match. Called from that function when the
// match has no solo ladder_matches row, so the admin update/revise routes need no changes.
//
// Same delete-and-recompute safety argument as the solo sync: revise/route.ts only allows revising a
// match that is still the latest ladder event for each duo involved.
//
// Non-fatal by contract: returns { synced: false } with no warning when the match isn't a duo match
// (or the duo tables don't exist yet).
export async function syncDuoLadderStandingsForMatch(
  supabase: SupabaseClient,
  params: {
    matchId: number;
    teamByPlayerId: Map<number, 1 | 2>;
    winnerTeam: 1 | 2;
    occurredAt: string | null;
  },
): Promise<SyncLadderStandingsResult> {
  const empty = (warning: string | null): SyncLadderStandingsResult => ({
    synced: false,
    warning,
    tiers: [],
    events: [],
  });
  const { matchId, teamByPlayerId, winnerTeam } = params;

  const { data: duoMatch, error: duoMatchError } = await supabase
    .from("ladder_duo_matches")
    .select("cycle_id, team1_duo_id, team2_duo_id")
    .eq("match_id", matchId)
    .maybeSingle();

  if (duoMatchError) {
    return isMissingTableError(duoMatchError)
      ? empty(null)
      : empty(`Failed to look up duo ladder match: ${duoMatchError.message}`);
  }
  if (!duoMatch) return empty(null);

  const cycleId = duoMatch.cycle_id as number;
  const duoIdByTeam: Record<1 | 2, number> = {
    1: Number(duoMatch.team1_duo_id),
    2: Number(duoMatch.team2_duo_id),
  };

  const { data: duosData, error: duosError } = await supabase
    .from("ladder_duos")
    .select("id, player_low_id, player_high_id")
    .in("id", [duoIdByTeam[1], duoIdByTeam[2]]);
  if (duosError) return empty(`Failed to load duos: ${duosError.message}`);
  const duos = (duosData ?? []) as Array<{ id: number; player_low_id: number; player_high_id: number }>;

  // Team N of the match must seat exactly duo N. A teams edit after creation (blocked by the teams
  // route, but belt and braces) would otherwise credit the wrong pair.
  for (const team of [1, 2] as const) {
    const duo = duos.find((d) => d.id === duoIdByTeam[team]);
    const seated = [...teamByPlayerId.entries()].filter(([, t]) => t === team).map(([pid]) => pid);
    if (!duo || seated.length !== 2) {
      return empty(`Duo ladder match ${matchId}: team ${team} doesn't line up with its duo; standings not synced.`);
    }
    const [low, high] = canonicalPair(seated[0], seated[1]);
    if (low !== duo.player_low_id || high !== duo.player_high_id) {
      return empty(
        `Duo ladder match ${matchId}: team ${team}'s players aren't duo ${duo.id}; standings not synced.`,
      );
    }
  }

  const matchOccurredAt = params.occurredAt ?? new Date().toISOString();

  const { error: deleteError } = await supabase
    .from("ladder_duo_standing_events")
    .delete()
    .eq("source_type", "match")
    .eq("source_id", String(matchId));
  if (deleteError) return empty(`Failed to clear prior duo ladder events: ${deleteError.message}`);

  const { data: tiersData, error: tiersError } = await supabase
    .from("ladder_tiers")
    .select("id, name, rank");
  if (tiersError || !tiersData || tiersData.length === 0) {
    return empty(tiersError?.message || "No ladder tiers configured.");
  }
  const tiers = tiersData as Array<{ id: number; name: string; rank: number }>;
  const tierRows: LadderTierRow[] = tiers.map((t) => ({ id: t.id, rank: t.rank }));

  const { standingsByDuo, warnings } = await ensureDuoPlacement(
    supabase,
    cycleId,
    [duoIdByTeam[1], duoIdByTeam[2]],
    matchOccurredAt,
  );

  const events: LadderMatchProgressionEvent[] = [];
  const movedDuoIds: number[] = [];

  for (const team of [1, 2] as const) {
    const duoId = duoIdByTeam[team];
    const current = standingsByDuo.get(String(duoId));
    if (!current) continue; // warned by ensureDuoPlacement

    const next = computeNextLadderStanding(current, team === winnerTeam ? "win" : "loss", tierRows);

    const { error: insertError } = await supabase.from("ladder_duo_standing_events").insert({
      cycle_id: cycleId,
      duo_id: duoId,
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
      warnings.push(`Failed to record duo ladder standing for duo ${duoId}: ${insertError.message}`);
      continue;
    }

    if (next.tierBeforeId !== next.tierAfterId) movedDuoIds.push(duoId);

    // Expanded per player so the completed-match email can look each recipient up by playerId.
    const duo = duos.find((d) => d.id === duoId);
    for (const playerId of duo ? [duo.player_low_id, duo.player_high_id] : []) {
      events.push({
        playerId,
        eventType: next.eventType,
        tierBeforeId: next.tierBeforeId,
        tierAfterId: next.tierAfterId,
        starsBefore: next.starsBefore,
        starsAfter: next.starsAfter,
        duoId,
      });
    }
  }

  await syncWaitingDuoEntriesToStanding(supabase, cycleId, movedDuoIds);

  return {
    synced: true,
    mode: "duo",
    warning: warnings.length > 0 ? warnings.join(" ") : null,
    tiers: tiers.map((t) => ({ id: t.id, name: t.name })),
    events,
  };
}
