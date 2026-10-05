import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchLatestRatingsByPlayerIds } from "@/lib/ratingLedger";
import { getLastNameKey } from "@/lib/utils";
import type { TierBucketRow } from "@/lib/ladder/ladderPlacement";
import { placeDuoByRatings, averageDuoRating } from "@/lib/ladder/ladderDuoPlacement";
import {
  assignCycleRanks,
  LADDER_BADGE_MIN_MATCHES,
  type LadderCycleTally,
} from "@/lib/ladder/ladderCycleClose";
import { duoDisplayName } from "@/lib/ladder/ladderDuoShared";

// Duo ladder side of the cycle lifecycle. startLadderCycle / closeLadderCycle call these alongside
// their solo work so one cycle covers both ladders. Mirrors the solo allocation and snapshot logic.

type DuoRow = {
  id: number;
  name: string | null;
  status: string;
  player_low_id: number;
  player_high_id: number;
};

type PlayerNameRow = { player_id: number; name: string | null; nickname: string | null };

async function loadDuoLabels(
  supabase: SupabaseClient,
  duos: DuoRow[],
): Promise<{ labels: Map<number, string>; nameKeys: Map<number, string> }> {
  const playerIds = Array.from(new Set(duos.flatMap((d) => [d.player_low_id, d.player_high_id])));
  const players = new Map<number, PlayerNameRow>();
  if (playerIds.length > 0) {
    const { data } = await supabase.from("players").select("player_id, name, nickname").in("player_id", playerIds);
    for (const p of (data ?? []) as PlayerNameRow[]) players.set(Number(p.player_id), p);
  }

  const labels = new Map<number, string>();
  const nameKeys = new Map<number, string>();
  for (const duo of duos) {
    const low = players.get(duo.player_low_id);
    const high = players.get(duo.player_high_id);
    labels.set(duo.id, duoDisplayName(duo.name, [low, high]));
    // Tiebreak: the duo name if it has one, else the two surnames in order.
    nameKeys.set(
      duo.id,
      duo.name?.trim().toLowerCase() ??
        [getLastNameKey(low?.name ?? ""), getLastNameKey(high?.name ?? "")].sort().join("/"),
    );
  }
  return { labels, nameKeys };
}

// ---- Cycle start -----------------------------------------------------------------------------

export type DuoPlacementDraft = {
  duo_id: number;
  player_low_id: number;
  player_high_id: number;
  rating: number;
  tier_id: number;
  tier_name: string;
  tier_rank: number;
  stars: number;
  previous_tier_id: number | null;
  previous_tier_name: string | null;
  previous_stars: number | null;
};

// Allocates every ACTIVE duo whose two players both have a rating, by the average of those ratings
// against the cycle's duo floors. Like solo, last cycle's standing is loaded for the preview only.
export async function computeDuoCyclePlacements(
  supabase: SupabaseClient,
  tiers: TierBucketRow[],
  previousCycleId: number | null,
): Promise<
  | { ok: true; placements: DuoPlacementDraft[]; labels: Record<string, string>; warnings: string[] }
  | { ok: false; error: string }
> {
  const warnings: string[] = [];

  const { data: duosData, error: duosError } = await supabase
    .from("ladder_duos")
    .select("id, name, status, player_low_id, player_high_id")
    .eq("status", "active");
  if (duosError) return { ok: false, error: `Failed to load duos: ${duosError.message}` };
  const duos = (duosData ?? []) as DuoRow[];
  if (duos.length === 0) return { ok: true, placements: [], labels: {}, warnings };

  const previous = new Map<string, { tierId: number; stars: number }>();
  if (previousCycleId) {
    const { data, error } = await supabase
      .from("ladder_duo_standing_events")
      .select("duo_id, tier_after_id, stars_after")
      .eq("cycle_id", previousCycleId)
      .order("occurred_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) return { ok: false, error: `Failed to load the previous cycle's duo standings: ${error.message}` };
    for (const row of data ?? []) {
      const key = String(row.duo_id);
      if (!previous.has(key)) {
        previous.set(key, { tierId: row.tier_after_id as number, stars: row.stars_after as number });
      }
    }
  }

  const ratings = await fetchLatestRatingsByPlayerIds(
    supabase,
    duos.flatMap((d) => [d.player_low_id, d.player_high_id]),
  );
  const tierById = new Map(tiers.map((t) => [t.id, t]));

  const placements: DuoPlacementDraft[] = [];
  let unrated = 0;
  for (const duo of duos) {
    const placement = placeDuoByRatings(
      ratings.get(String(duo.player_low_id)),
      ratings.get(String(duo.player_high_id)),
      tiers,
    );
    if (!placement) {
      unrated += 1;
      continue;
    }
    const tier = tierById.get(placement.tierId);
    if (!tier) continue;
    const prev = previous.get(String(duo.id)) ?? null;
    placements.push({
      duo_id: duo.id,
      player_low_id: duo.player_low_id,
      player_high_id: duo.player_high_id,
      rating: placement.rating,
      tier_id: tier.id,
      tier_name: tier.name,
      tier_rank: tier.rank,
      stars: placement.stars,
      previous_tier_id: prev?.tierId ?? null,
      previous_tier_name: prev ? (tierById.get(prev.tierId)?.name ?? null) : null,
      previous_stars: prev?.stars ?? null,
    });
  }

  if (unrated > 0) {
    warnings.push(`${unrated} duo(s) include a player with no rating yet and were not placed; they'll be placed on their first duo match or queue join.`);
  }

  const { labels } = await loadDuoLabels(supabase, duos);
  return {
    ok: true,
    placements,
    labels: Object.fromEntries([...labels].map(([id, label]) => [String(id), label])),
    warnings,
  };
}

export async function writeDuoCyclePlacements(
  supabase: SupabaseClient,
  params: { cycleId: number; placements: DuoPlacementDraft[]; startsAt: string; previousCycleId: number | null },
): Promise<string | null> {
  const CHUNK_SIZE = 500;
  for (let i = 0; i < params.placements.length; i += CHUNK_SIZE) {
    const chunk = params.placements.slice(i, i + CHUNK_SIZE).map((p) => ({
      cycle_id: params.cycleId,
      duo_id: p.duo_id,
      event_type: "cycle_start",
      tier_before_id: null,
      tier_after_id: p.tier_id,
      stars_before: null,
      stars_after: p.stars,
      cushion_available: true,
      source_type: "cycle_reset",
      source_id: null,
      occurred_at: params.startsAt,
      metadata: {
        seed_rating: p.rating,
        previous_cycle_id: params.previousCycleId,
        previous_tier_id: p.previous_tier_id,
        previous_stars: p.previous_stars,
      },
    }));
    const { error } = await supabase.from("ladder_duo_standing_events").insert(chunk);
    if (error) return error.message;
  }
  return null;
}

// ---- Cycle close -----------------------------------------------------------------------------

export type DuoCycleResultDraft = {
  duo_id: number;
  player_low_id: number;
  player_high_id: number;
  duo_name: string | null;
  tier_id: number;
  tier_name: string;
  tier_rank: number;
  stars: number;
  start_tier_id: number | null;
  start_tier_name: string | null;
  start_tier_rank: number | null;
  start_stars: number | null;
  matches_played: number;
  wins: number;
  losses: number;
  overall_rank: number | null;
  tier_position: number | null;
  badge_eligible: boolean;
  final_rating: number | null;
};

export type DuoFinalStanding = {
  duoId: number;
  tierId: number;
  stars: number;
  startTierId: number | null;
  startStars: number | null;
};

// Pure: drafts + ranks for every duo that held a standing in the cycle (dissolved ones included —
// they played). Same eligibility threshold and ordering as the solo ladder.
export function buildDuoCycleResults(input: {
  standings: DuoFinalStanding[];
  tallies: Map<number, LadderCycleTally>;
  duos: Map<number, { player_low_id: number; player_high_id: number; name: string | null }>;
  nameKeys: Map<number, string>;
  ratings: Map<number, number | null>;
  tiers: Array<{ id: number; name: string; rank: number }>;
}): DuoCycleResultDraft[] {
  const tierById = new Map(input.tiers.map((t) => [t.id, t]));
  const drafts: DuoCycleResultDraft[] = [];

  for (const s of input.standings) {
    const tier = tierById.get(s.tierId);
    const duo = input.duos.get(s.duoId);
    if (!tier || !duo) continue;
    const tally = input.tallies.get(s.duoId);
    const played = tally?.matchesPlayed ?? 0;
    const startTier = s.startTierId == null ? undefined : tierById.get(s.startTierId);
    drafts.push({
      duo_id: s.duoId,
      player_low_id: duo.player_low_id,
      player_high_id: duo.player_high_id,
      duo_name: duo.name,
      tier_id: tier.id,
      tier_name: tier.name,
      tier_rank: tier.rank,
      stars: s.stars,
      start_tier_id: startTier?.id ?? null,
      start_tier_name: startTier?.name ?? null,
      start_tier_rank: startTier?.rank ?? null,
      start_stars: startTier ? s.startStars : null,
      matches_played: played,
      wins: tally?.wins ?? 0,
      losses: tally?.losses ?? 0,
      overall_rank: null,
      tier_position: null,
      badge_eligible: played >= LADDER_BADGE_MIN_MATCHES,
      final_rating: input.ratings.get(s.duoId) ?? null,
    });
  }

  assignCycleRanks(drafts, (d) => input.nameKeys.get(d.duo_id) ?? "");
  return drafts;
}

export async function computeDuoCycleResults(
  supabase: SupabaseClient,
  cycle: { id: number; status: string },
  tiers: Array<{ id: number; name: string; rank: number }>,
): Promise<
  | { ok: true; results: DuoCycleResultDraft[]; labels: Record<string, string> }
  | { ok: false; error: string }
> {
  const { data: rows, error } = await supabase
    .from("ladder_duo_standing_events")
    .select("duo_id, event_type, tier_after_id, stars_after, source_type")
    .eq("cycle_id", cycle.id)
    .order("occurred_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: `Failed to load duo standing events: ${error.message}` };
  if (!rows || rows.length === 0) return { ok: true, results: [], labels: {} };

  const standings: DuoFinalStanding[] = [];
  const seen = new Set<number>();
  const tallies = new Map<number, LadderCycleTally>();
  const starts = new Map<number, { tierId: number; stars: number }>();

  for (const row of rows) {
    const duoId = Number(row.duo_id);
    if (row.event_type === "cycle_start") {
      starts.set(duoId, { tierId: row.tier_after_id as number, stars: row.stars_after as number });
    }
    if (row.source_type === "match") {
      const t = tallies.get(duoId) ?? { matchesPlayed: 0, wins: 0, losses: 0 };
      t.matchesPlayed += 1;
      if (row.event_type === "match_win" || row.event_type === "promotion") t.wins += 1;
      else if (row.event_type === "match_loss" || row.event_type === "demotion") t.losses += 1;
      tallies.set(duoId, t);
    }
    if (seen.has(duoId)) continue;
    seen.add(duoId);
    standings.push({
      duoId,
      tierId: row.tier_after_id as number,
      stars: row.stars_after as number,
      startTierId: null,
      startStars: null,
    });
  }
  for (const s of standings) {
    const start = starts.get(s.duoId);
    s.startTierId = start?.tierId ?? null;
    s.startStars = start?.stars ?? null;
  }

  const { data: duosData, error: duosError } = await supabase
    .from("ladder_duos")
    .select("id, name, status, player_low_id, player_high_id")
    .in("id", standings.map((s) => s.duoId));
  if (duosError) return { ok: false, error: `Failed to load duos: ${duosError.message}` };
  const duoRows = (duosData ?? []) as DuoRow[];
  const duos = new Map(duoRows.map((d) => [d.id, d]));
  const { labels, nameKeys } = await loadDuoLabels(supabase, duoRows);

  const playerRatings = await fetchLatestRatingsByPlayerIds(
    supabase,
    duoRows.flatMap((d) => [d.player_low_id, d.player_high_id]),
  );
  const ratings = new Map<number, number | null>();
  for (const d of duoRows) {
    ratings.set(
      d.id,
      averageDuoRating(playerRatings.get(String(d.player_low_id)), playerRatings.get(String(d.player_high_id))),
    );
  }

  // On a recompute keep the rating recorded at the original close (the ledger has moved on).
  if (cycle.status === "completed") {
    const { data: prior } = await supabase
      .from("ladder_duo_cycle_results")
      .select("duo_id, final_rating")
      .eq("cycle_id", cycle.id);
    for (const row of prior ?? []) {
      if (row.final_rating == null) continue;
      const rating = Number(row.final_rating);
      if (Number.isFinite(rating)) ratings.set(Number(row.duo_id), rating);
    }
  }

  const results = buildDuoCycleResults({ standings, tallies, duos, nameKeys, ratings, tiers });
  return {
    ok: true,
    results,
    labels: Object.fromEntries([...labels].map(([id, label]) => [String(id), label])),
  };
}

export async function writeDuoCycleResults(
  supabase: SupabaseClient,
  cycleId: number,
  results: DuoCycleResultDraft[],
): Promise<string | null> {
  const { error: deleteError } = await supabase.from("ladder_duo_cycle_results").delete().eq("cycle_id", cycleId);
  if (deleteError) return `Failed to clear prior duo results: ${deleteError.message}`;

  const CHUNK_SIZE = 500;
  for (let i = 0; i < results.length; i += CHUNK_SIZE) {
    const chunk = results.slice(i, i + CHUNK_SIZE).map((r) => ({ ...r, cycle_id: cycleId }));
    const { error } = await supabase.from("ladder_duo_cycle_results").insert(chunk);
    if (error) return `Failed to write duo cycle results: ${error.message}`;
  }
  return null;
}
