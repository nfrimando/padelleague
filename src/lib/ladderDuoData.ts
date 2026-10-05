import { unstable_cache } from "next/cache";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fetchTiersForCycle } from "@/lib/ladder/ladderCycleTiers";
import { isMissingTableError } from "@/lib/ladder/ladderSchema";
import { duoDisplayName } from "@/lib/ladder/ladderDuoShared";
import {
  fetchActiveCycle,
  LADDER_PAGE_CACHE_TAG,
  type LadderStandingEvent,
  type LadderTier,
} from "@/lib/ladderData";

// Read path for /ladder?mode=duo. Same shape and conventions as fetchLadderPageData (latest ledger
// row per duo, reduced in JS; no SQL view) and cached under the same tag, so every write that busts
// the solo standings busts these too.

export type LadderDuoPlayer = {
  player_id: string;
  name: string;
  nickname: string;
  image_link: string | null;
};

export type LadderDuoEntry = {
  duoId: number;
  name: string | null;
  label: string;
  players: [LadderDuoPlayer, LadderDuoPlayer];
  stars: number;
  cushionAvailable: boolean;
  winsThisCycle: number;
  hasPlayedThisCycle: boolean;
  lastEvent: LadderStandingEvent | null;
};

export type LadderDuoPendingMatch = {
  matchId: number;
  status: "assigned" | "scheduled";
  team1: { label: string; players: [string, string] };
  team2: { label: string; players: [string, string] };
  dateLocal: string | null;
  timeLocal: string | null;
  venue: string | null;
};

export type LadderDuoCycleResult = {
  duoId: number;
  label: string;
  players: [LadderDuoPlayer, LadderDuoPlayer];
  tierName: string;
  tierRank: number;
  stars: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  overallRank: number | null;
  tierPosition: number | null;
  badgeEligible: boolean;
  startTierName: string | null;
  startTierRank: number | null;
};

export type LadderDuoPageData = {
  // False until the duo ladder migrations are applied — the UI hides the Duo toggle.
  available: boolean;
  tiers: LadderTier[];
  groupedDuos: Record<number, LadderDuoEntry[]>;
  pendingMatchesByTier: Record<number, LadderDuoPendingMatch[]>;
  resultsByCycle: Record<number, LadderDuoCycleResult[]>;
};

const UNAVAILABLE: LadderDuoPageData = {
  available: false,
  tiers: [],
  groupedDuos: {},
  pendingMatchesByTier: {},
  resultsByCycle: {},
};

type DuoRow = {
  id: number;
  name: string | null;
  status: string;
  player_low_id: number;
  player_high_id: number;
};

type PlayerRow = {
  player_id: number | string;
  name: string | null;
  nickname: string | null;
  image_link: string | null;
};

type StandingRow = {
  duo_id: number;
  event_type: string;
  tier_before_id: number | null;
  tier_after_id: number;
  stars_before: number | null;
  stars_after: number;
  cushion_available: boolean | null;
  source_type: string | null;
  source_id: string | null;
  occurred_at: string | null;
  metadata: Record<string, unknown> | null;
};

function makeServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

async function loadPlayers(db: SupabaseClient, ids: number[]): Promise<Map<number, LadderDuoPlayer>> {
  const map = new Map<number, LadderDuoPlayer>();
  const unique = Array.from(new Set(ids));
  if (unique.length === 0) return map;
  const { data } = await db.from("players").select("player_id, name, nickname, image_link").in("player_id", unique);
  for (const p of (data ?? []) as PlayerRow[]) {
    map.set(Number(p.player_id), {
      player_id: String(p.player_id),
      name: p.name ?? "Unknown",
      nickname: p.nickname ?? "",
      image_link: p.image_link ?? null,
    });
  }
  return map;
}

function playerOrUnknown(players: Map<number, LadderDuoPlayer>, id: number): LadderDuoPlayer {
  return players.get(id) ?? { player_id: String(id), name: "Unknown", nickname: "", image_link: null };
}

async function fetchLadderDuoPageDataUncached(): Promise<LadderDuoPageData> {
  const db = makeServerClient();

  const probe = await db.from("ladder_duos").select("id", { head: true, count: "exact" }).limit(1);
  if (probe.error && isMissingTableError(probe.error)) return UNAVAILABLE;

  const [activeCycle, resultsByCycle] = await Promise.all([fetchActiveCycle(db), fetchDuoCycleResults(db)]);
  if (!activeCycle) {
    const { data: tiersData } = await db.from("ladder_tiers").select("id, name, rank, elo_floor").order("rank");
    return {
      ...UNAVAILABLE,
      available: true,
      tiers: ((tiersData ?? []) as LadderTier[]).map((t) => ({ ...t, elo_floor: Number(t.elo_floor) })),
      resultsByCycle,
    };
  }

  const { tiers, error: tiersError } = await fetchTiersForCycle(db, activeCycle.id, "duo");
  if (tiersError) throw new Error(tiersError);

  const { data: standingsData, error: standingsError } = await db
    .from("ladder_duo_standing_events")
    .select(
      "duo_id, event_type, tier_before_id, tier_after_id, stars_before, stars_after, cushion_available, source_type, source_id, occurred_at, metadata",
    )
    .eq("cycle_id", activeCycle.id)
    .order("occurred_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (standingsError) throw new Error(standingsError.message);

  const latestByDuo = new Map<number, LadderStandingEvent>();
  const played = new Set<number>();
  const wins = new Map<number, number>();
  for (const row of (standingsData ?? []) as StandingRow[]) {
    const id = Number(row.duo_id);
    if (row.source_type === "match") {
      played.add(id);
      if (row.event_type === "match_win" || row.event_type === "promotion") {
        wins.set(id, (wins.get(id) ?? 0) + 1);
      }
    }
    if (latestByDuo.has(id)) continue;
    latestByDuo.set(id, {
      eventType: row.event_type,
      tierBeforeId: row.tier_before_id,
      tierAfterId: row.tier_after_id,
      starsBefore: row.stars_before,
      starsAfter: row.stars_after,
      cushionAvailable: row.cushion_available ?? false,
      sourceType: row.source_type,
      sourceId: row.source_id,
      occurredAt: row.occurred_at,
      metadata: row.metadata,
    });
  }

  // Live standings show ACTIVE duos only; a dissolved duo's record lives on in the cycle results.
  const { data: duosData, error: duosError } = await db
    .from("ladder_duos")
    .select("id, name, status, player_low_id, player_high_id")
    .eq("status", "active");
  if (duosError) throw new Error(duosError.message);
  const duos = (duosData ?? []) as DuoRow[];

  const players = await loadPlayers(
    db,
    duos.flatMap((d) => [d.player_low_id, d.player_high_id]),
  );

  const groupedDuos: Record<number, LadderDuoEntry[]> = {};
  for (const duo of duos) {
    const last = latestByDuo.get(duo.id);
    if (!last) continue; // formed but not placed yet (e.g. a player has no rating)
    const pair: [LadderDuoPlayer, LadderDuoPlayer] = [
      playerOrUnknown(players, duo.player_low_id),
      playerOrUnknown(players, duo.player_high_id),
    ];
    const entry: LadderDuoEntry = {
      duoId: duo.id,
      name: duo.name,
      label: duoDisplayName(duo.name, pair),
      players: pair,
      stars: last.starsAfter,
      cushionAvailable: last.cushionAvailable,
      winsThisCycle: wins.get(duo.id) ?? 0,
      hasPlayedThisCycle: played.has(duo.id),
      lastEvent: last,
    };
    (groupedDuos[last.tierAfterId] ??= []).push(entry);
  }
  for (const list of Object.values(groupedDuos)) {
    list.sort(
      (a, b) =>
        b.stars - a.stars ||
        b.winsThisCycle - a.winsThisCycle ||
        a.label.toLowerCase().localeCompare(b.label.toLowerCase()),
    );
  }

  const pendingMatchesByTier = await fetchPendingDuoMatches(db, activeCycle.id, latestByDuo);

  return { available: true, tiers, groupedDuos, pendingMatchesByTier, resultsByCycle };
}

// Open (assigned / scheduled) duo ladder matches in the cycle, bucketed by the tier they were made
// in (ladder_duo_matches.tier_id), falling back to team 1's current tier.
async function fetchPendingDuoMatches(
  db: SupabaseClient,
  cycleId: number,
  latestByDuo: Map<number, LadderStandingEvent>,
): Promise<Record<number, LadderDuoPendingMatch[]>> {
  const result: Record<number, LadderDuoPendingMatch[]> = {};

  const { data: dmData } = await db
    .from("ladder_duo_matches")
    .select("match_id, team1_duo_id, team2_duo_id, tier_id")
    .eq("cycle_id", cycleId)
    .is("cancelled_at", null);
  const dms = (dmData ?? []) as Array<{ match_id: number; team1_duo_id: number; team2_duo_id: number; tier_id: number | null }>;
  if (dms.length === 0) return result;

  const { data: matchesData } = await db
    .from("matches")
    .select("match_id, status, date_local, time_local, venue")
    .in("match_id", dms.map((d) => d.match_id))
    .in("status", ["assigned", "scheduled"]);
  const matches = (matchesData ?? []) as Array<{
    match_id: number;
    status: string;
    date_local: string | null;
    time_local: string | null;
    venue: string | null;
  }>;
  if (matches.length === 0) return result;

  const duoIds = Array.from(new Set(dms.flatMap((d) => [d.team1_duo_id, d.team2_duo_id])));
  const { data: duosData } = await db
    .from("ladder_duos")
    .select("id, name, status, player_low_id, player_high_id")
    .in("id", duoIds);
  const duos = new Map(((duosData ?? []) as DuoRow[]).map((d) => [d.id, d]));
  const players = await loadPlayers(
    db,
    [...duos.values()].flatMap((d) => [d.player_low_id, d.player_high_id]),
  );

  const team = (duoId: number) => {
    const duo = duos.get(duoId);
    if (!duo) return { label: `Duo #${duoId}`, players: ["?", "?"] as [string, string] };
    const pair = [playerOrUnknown(players, duo.player_low_id), playerOrUnknown(players, duo.player_high_id)];
    return {
      label: duoDisplayName(duo.name, pair),
      players: pair.map((p) => p.nickname || p.name) as [string, string],
    };
  };

  for (const match of matches) {
    const dm = dms.find((d) => d.match_id === match.match_id);
    if (!dm) continue;
    const tierId = dm.tier_id ?? latestByDuo.get(dm.team1_duo_id)?.tierAfterId ?? null;
    if (tierId == null) continue;
    (result[tierId] ??= []).push({
      matchId: match.match_id,
      status: match.status === "scheduled" ? "scheduled" : "assigned",
      team1: team(dm.team1_duo_id),
      team2: team(dm.team2_duo_id),
      dateLocal: match.date_local,
      timeLocal: match.time_local,
      venue: match.venue,
    });
  }
  for (const list of Object.values(result)) list.sort((a, b) => a.matchId - b.matchId);
  return result;
}

type DuoResultRow = {
  cycle_id: number;
  duo_id: number;
  player_low_id: number;
  player_high_id: number;
  duo_name: string | null;
  tier_name: string;
  tier_rank: number;
  stars: number;
  matches_played: number;
  wins: number;
  losses: number;
  overall_rank: number | null;
  tier_position: number | null;
  badge_eligible: boolean;
  start_tier_name: string | null;
  start_tier_rank: number | null;
};

// Frozen duo results of every completed cycle, keyed by cycle id. The cycle list itself comes from
// the solo page data (cycles are shared).
async function fetchDuoCycleResults(db: SupabaseClient): Promise<Record<number, LadderDuoCycleResult[]>> {
  const { data, error } = await db
    .from("ladder_duo_cycle_results")
    .select(
      "cycle_id, duo_id, player_low_id, player_high_id, duo_name, tier_name, tier_rank, stars, matches_played, wins, losses, overall_rank, tier_position, badge_eligible, start_tier_name, start_tier_rank",
    );
  if (error || !data || data.length === 0) return {};
  const rows = data as DuoResultRow[];

  const players = await loadPlayers(
    db,
    rows.flatMap((r) => [r.player_low_id, r.player_high_id]),
  );

  const byCycle: Record<number, LadderDuoCycleResult[]> = {};
  for (const row of rows) {
    const pair: [LadderDuoPlayer, LadderDuoPlayer] = [
      playerOrUnknown(players, row.player_low_id),
      playerOrUnknown(players, row.player_high_id),
    ];
    (byCycle[row.cycle_id] ??= []).push({
      duoId: row.duo_id,
      label: duoDisplayName(row.duo_name, pair),
      players: pair,
      tierName: row.tier_name,
      tierRank: row.tier_rank,
      stars: row.stars,
      matchesPlayed: row.matches_played,
      wins: row.wins,
      losses: row.losses,
      overallRank: row.overall_rank,
      tierPosition: row.tier_position,
      badgeEligible: row.badge_eligible === true,
      startTierName: row.start_tier_name,
      startTierRank: row.start_tier_rank,
    });
  }

  for (const list of Object.values(byCycle)) {
    list.sort((a, b) => {
      if (a.overallRank !== null && b.overallRank !== null) return a.overallRank - b.overallRank;
      if (a.overallRank !== null) return -1;
      if (b.overallRank !== null) return 1;
      return b.tierRank - a.tierRank || b.stars - a.stars || a.label.localeCompare(b.label);
    });
  }
  return byCycle;
}

const getCachedLadderDuoPageData = unstable_cache(
  fetchLadderDuoPageDataUncached,
  ["ladder-duo-page-data"],
  { revalidate: 120, tags: [LADDER_PAGE_CACHE_TAG] },
);

export async function fetchLadderDuoPageData(): Promise<LadderDuoPageData> {
  try {
    return await getCachedLadderDuoPageData();
  } catch (err) {
    // The duo ladder must never take /ladder down with it.
    console.error("[ladder-duo] failed to load duo page data:", err);
    return UNAVAILABLE;
  }
}
