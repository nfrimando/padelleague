import { unstable_cache } from "next/cache";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type LadderTier = {
  id: number;
  name: string;
  rank: number;
  elo_floor: number;
};

export type LadderStandingEvent = {
  eventType: string;
  tierBeforeId: number | null;
  tierAfterId: number;
  starsBefore: number | null;
  starsAfter: number;
  cushionAvailable: boolean;
  sourceType: string | null;
  sourceId: string | null;
  occurredAt: string | null;
  metadata: Record<string, unknown> | null;
};

export type LadderPlayer = {
  player_id: string;
  name: string;
  nickname: string;
  image_link: string | null;
  stars: number;
  // null = no standing event this cycle yet (opted in but not placed), so cushion is unknown.
  cushionAvailable: boolean | null;
  isOptedIn: boolean;
  hasPlayedThisCycle: boolean;
  winsThisCycle: number;
  lastEvent: LadderStandingEvent | null;
};

export type LadderPendingMatchPlayer = {
  player_id: string;
  name: string;
  nickname: string;
};

export type LadderPendingMatch = {
  matchId: number;
  status: "assigned" | "scheduled";
  team1: [LadderPendingMatchPlayer, LadderPendingMatchPlayer];
  team2: [LadderPendingMatchPlayer, LadderPendingMatchPlayer];
  scheduleDeadlineAt: string | null;
  dateLocal: string | null;
  timeLocal: string | null;
  venue: string | null;
};

export type LadderPageData = {
  hasActiveCycle: boolean;
  activeCycle: { id: number; label: string } | null;
  tiers: LadderTier[];
  groupedPlayers: Record<number, LadderPlayer[]>;
  pendingMatchesByTier: Record<number, LadderPendingMatch[]>;
};

type TierRow = { id: number; name: string; rank: number; elo_floor: number | string };
type StandingRow = {
  player_id: number | string;
  event_type: string;
  tier_before_id: number | null;
  tier_after_id: number;
  stars_before: number | null;
  stars_after: number;
  cushion_available: boolean | null;
  source_type: string | null;
  source_id: string | null;
  occurred_at: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};
type PlayerRow = {
  player_id: number | string;
  name: string | null;
  nickname: string | null;
  image_link: string | null;
  is_ladder_opt_in: boolean | null;
};

function makeServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

type ServerClient = ReturnType<typeof makeServerClient>;

function getLastNameKey(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  const parts = trimmed.split(/\s+/);
  return parts[parts.length - 1].toLowerCase();
}

export async function fetchActiveCycle(
  db: SupabaseClient,
): Promise<{ id: number; label: string } | null> {
  const { data: active } = await db
    .from("ladder_cycles")
    .select("id, label")
    .eq("status", "active")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (active?.id) return { id: active.id as number, label: active.label as string };

  const { data: latest } = await db
    .from("ladder_cycles")
    .select("id, label")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  return latest?.id ? { id: latest.id as number, label: latest.label as string } : null;
}

function toStandingEvent(row: StandingRow): LadderStandingEvent {
  return {
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
  };
}

async function fetchLadderPageDataUncached(): Promise<LadderPageData> {
  const db = makeServerClient();

  const { data: tiersData, error: tiersError } = await db
    .from("ladder_tiers")
    .select("id, name, rank, elo_floor")
    .order("rank", { ascending: true });

  if (tiersError) throw new Error(tiersError.message);
  const tiers = ((tiersData ?? []) as TierRow[]).map((t) => ({
    id: t.id,
    name: t.name,
    rank: t.rank,
    elo_floor: Number(t.elo_floor),
  }));

  const activeCycle = await fetchActiveCycle(db);
  if (activeCycle == null) {
    return {
      hasActiveCycle: false,
      activeCycle: null,
      tiers,
      groupedPlayers: {},
      pendingMatchesByTier: {},
    };
  }

  const { data: standingsData, error: standingsError } = await db
    .from("ladder_standing_events")
    .select(
      "player_id, event_type, tier_before_id, tier_after_id, stars_before, stars_after, cushion_available, source_type, source_id, occurred_at, created_at, metadata",
    )
    .eq("cycle_id", activeCycle.id)
    .order("occurred_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (standingsError) throw new Error(standingsError.message);

  const standingRows = (standingsData ?? []) as StandingRow[];

  // Latest row per player: mirrors fetchLatestRatingsByPlayerIds in src/lib/ratingLedger.ts.
  const latestByPlayer = new Map<string, LadderStandingEvent>();
  // A player may have played a ladder match earlier in the cycle even if their
  // latest row is something else, so this scans every row, not just the latest.
  const hasLadderMatchThisCycle = new Set<string>();
  // A win that also promotes the player still counts as a win for this tally.
  const winsByPlayer = new Map<string, number>();
  for (const row of standingRows) {
    const pid = String(row.player_id);
    if (row.source_type === "match") {
      hasLadderMatchThisCycle.add(pid);
      if (row.event_type === "match_win" || row.event_type === "promotion") {
        winsByPlayer.set(pid, (winsByPlayer.get(pid) ?? 0) + 1);
      }
    }
    if (latestByPlayer.has(pid)) continue;
    latestByPlayer.set(pid, toStandingEvent(row));
  }

  // Opted-in players are shown even before they have a standing-event row (e.g. opted in but
  // haven't been placed yet) — see ensureLadderPlacement in src/lib/ladder/ladderPlacement.ts,
  // which normally places them immediately on opt-in / first match. This union is a defensive
  // fallback for the rare case a player has no resolvable rating yet to be placed by.
  const { data: optedInPlayersData, error: optedInError } = await db
    .from("players")
    .select("player_id")
    .eq("is_ladder_opt_in", true);

  if (optedInError) throw new Error(optedInError.message);

  const optedInIds = ((optedInPlayersData ?? []) as Array<{ player_id: number | string }>).map(
    (p) => String(p.player_id),
  );

  const playerIdSet = new Set<string>([...latestByPlayer.keys(), ...optedInIds]);
  const playerIds = Array.from(playerIdSet).map(Number);
  if (playerIds.length === 0) {
    return {
      hasActiveCycle: true,
      activeCycle,
      tiers,
      groupedPlayers: {},
      pendingMatchesByTier: {},
    };
  }

  const { data: playersData, error: playersError } = await db
    .from("players")
    .select("player_id, name, nickname, image_link, is_ladder_opt_in")
    .in("player_id", playerIds);

  if (playersError) throw new Error(playersError.message);

  const playerInfoMap = new Map<string, PlayerRow>();
  for (const p of (playersData ?? []) as PlayerRow[]) {
    playerInfoMap.set(String(p.player_id), p);
  }

  // Lowest-rank tier, used as a display fallback for opted-in players with no standing-event
  // row and no resolvable rating to be placed by (tiers is ordered by rank ascending; rank 1 is
  // the lowest tier per .claude/ladder.md).
  const lowestTierId = tiers.length > 0 ? tiers[0].id : null;

  const groupedPlayers: Record<number, LadderPlayer[]> = {};
  for (const pid of playerIdSet) {
    const info = playerInfoMap.get(pid);
    if (!info) continue;

    const lastEvent = latestByPlayer.get(pid) ?? null;
    const tierId = lastEvent ? lastEvent.tierAfterId : lowestTierId;
    if (tierId == null) continue;

    const entry: LadderPlayer = {
      player_id: pid,
      name: info.name ?? "Unknown",
      nickname: info.nickname ?? "",
      image_link: info.image_link ?? null,
      stars: lastEvent?.starsAfter ?? 0,
      cushionAvailable: lastEvent?.cushionAvailable ?? null,
      isOptedIn: info.is_ladder_opt_in ?? false,
      hasPlayedThisCycle: hasLadderMatchThisCycle.has(pid),
      winsThisCycle: winsByPlayer.get(pid) ?? 0,
      lastEvent,
    };

    if (!groupedPlayers[tierId]) groupedPlayers[tierId] = [];
    groupedPlayers[tierId].push(entry);
  }

  for (const tierId of Object.keys(groupedPlayers)) {
    groupedPlayers[Number(tierId)].sort((a, b) => {
      if (b.stars !== a.stars) return b.stars - a.stars;
      if (b.winsThisCycle !== a.winsThisCycle) return b.winsThisCycle - a.winsThisCycle;
      return getLastNameKey(a.name).localeCompare(getLastNameKey(b.name));
    });
  }

  const pendingMatchesByTier = await fetchPendingLadderMatches(db, activeCycle.id, latestByPlayer);

  return { hasActiveCycle: true, activeCycle, tiers, groupedPlayers, pendingMatchesByTier };
}

type PendingMatchTeamRow = {
  match_id: number;
  team_number: number | null;
  player_1_id: number | null;
  player_2_id: number | null;
};

// Roulette- and manually-created matches that are "assigned" (no date/time yet) or
// "scheduled" (time confirmed, not yet completed) for the active cycle, bucketed by tier.
// ladder_matches doesn't store tier directly, so tier is inferred from any participant's
// current standing this cycle (all 4 players in an own-tier match share a tier by
// construction).
async function fetchPendingLadderMatches(
  db: ServerClient,
  cycleId: number,
  latestByPlayer: Map<string, LadderStandingEvent>,
): Promise<Record<number, LadderPendingMatch[]>> {
  const pendingMatchesByTier: Record<number, LadderPendingMatch[]> = {};

  const { data: cycleLadderMatches } = await db
    .from("ladder_matches")
    .select("match_id, schedule_deadline_at")
    .eq("cycle_id", cycleId);

  const candidateMatchIds = (cycleLadderMatches ?? []).map((m) => m.match_id as number);
  if (candidateMatchIds.length === 0) return pendingMatchesByTier;

  const deadlineByMatchId = new Map(
    (cycleLadderMatches ?? []).map((m) => [
      m.match_id as number,
      m.schedule_deadline_at as string | null,
    ]),
  );

  const { data: pendingMatchRows } = await db
    .from("matches")
    .select("match_id, status, date_local, time_local, venue")
    .in("match_id", candidateMatchIds)
    .in("status", ["assigned", "scheduled"]);

  const pendingMatchIds = (pendingMatchRows ?? []).map((m) => m.match_id as number);
  if (pendingMatchIds.length === 0) return pendingMatchesByTier;

  const { data: teamsData } = await db
    .from("match_teams")
    .select("match_id, team_number, player_1_id, player_2_id")
    .in("match_id", pendingMatchIds);

  const teamRows = (teamsData ?? []) as PendingMatchTeamRow[];

  const involvedPlayerIds = new Set<number>();
  for (const t of teamRows) {
    if (t.player_1_id != null) involvedPlayerIds.add(t.player_1_id);
    if (t.player_2_id != null) involvedPlayerIds.add(t.player_2_id);
  }

  const { data: involvedPlayersData } = await db
    .from("players")
    .select("player_id, name, nickname")
    .in("player_id", Array.from(involvedPlayerIds));

  const involvedPlayerMap = new Map(
    ((involvedPlayersData ?? []) as Array<{
      player_id: number | string;
      name: string | null;
      nickname: string | null;
    }>).map((p) => [String(p.player_id), p]),
  );

  const toPendingPlayer = (id: number | null): LadderPendingMatchPlayer | null => {
    if (id == null) return null;
    const p = involvedPlayerMap.get(String(id));
    if (!p) return null;
    return { player_id: String(id), name: p.name ?? "Unknown", nickname: p.nickname ?? "" };
  };

  for (const matchRow of (pendingMatchRows ?? []) as Array<{
    match_id: number;
    status: string;
    date_local: string | null;
    time_local: string | null;
    venue: string | null;
  }>) {
    const matchId = matchRow.match_id;
    const team1Row = teamRows.find((t) => t.match_id === matchId && t.team_number === 1);
    const team2Row = teamRows.find((t) => t.match_id === matchId && t.team_number === 2);
    if (!team1Row || !team2Row) continue;

    const t1p1 = toPendingPlayer(team1Row.player_1_id);
    const t1p2 = toPendingPlayer(team1Row.player_2_id);
    const t2p1 = toPendingPlayer(team2Row.player_1_id);
    const t2p2 = toPendingPlayer(team2Row.player_2_id);
    if (!t1p1 || !t1p2 || !t2p1 || !t2p2) continue;

    const tierId =
      latestByPlayer.get(String(team1Row.player_1_id))?.tierAfterId ??
      latestByPlayer.get(String(team1Row.player_2_id))?.tierAfterId ??
      latestByPlayer.get(String(team2Row.player_1_id))?.tierAfterId ??
      latestByPlayer.get(String(team2Row.player_2_id))?.tierAfterId ??
      null;
    if (tierId == null) continue;

    const entry: LadderPendingMatch = {
      matchId,
      status: matchRow.status === "scheduled" ? "scheduled" : "assigned",
      team1: [t1p1, t1p2],
      team2: [t2p1, t2p2],
      scheduleDeadlineAt: deadlineByMatchId.get(matchId) ?? null,
      dateLocal: matchRow.date_local,
      timeLocal: matchRow.time_local,
      venue: matchRow.venue,
    };

    if (!pendingMatchesByTier[tierId]) pendingMatchesByTier[tierId] = [];
    pendingMatchesByTier[tierId].push(entry);
  }

  for (const tierId of Object.keys(pendingMatchesByTier)) {
    pendingMatchesByTier[Number(tierId)].sort((a, b) => {
      const aDeadline = a.scheduleDeadlineAt ? new Date(a.scheduleDeadlineAt).getTime() : Infinity;
      const bDeadline = b.scheduleDeadlineAt ? new Date(b.scheduleDeadlineAt).getTime() : Infinity;
      return aDeadline - bDeadline;
    });
  }

  return pendingMatchesByTier;
}

const getCachedLadderPageData = unstable_cache(
  fetchLadderPageDataUncached,
  ["ladder-page-data"],
  { revalidate: 120 },
);

export async function fetchLadderPageData(): Promise<LadderPageData> {
  return getCachedLadderPageData();
}
