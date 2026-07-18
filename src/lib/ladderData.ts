import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";

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
  isOptedIn: boolean;
  hasPlayedThisCycle: boolean;
  winsThisCycle: number;
  lastEvent: LadderStandingEvent;
};

export type LadderPageData = {
  hasActiveCycle: boolean;
  activeCycle: { id: number; label: string } | null;
  tiers: LadderTier[];
  groupedPlayers: Record<number, LadderPlayer[]>;
};

type TierRow = { id: number; name: string; rank: number; elo_floor: number | string };
type StandingRow = {
  player_id: number | string;
  event_type: string;
  tier_before_id: number | null;
  tier_after_id: number;
  stars_before: number | null;
  stars_after: number;
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

async function fetchActiveCycle(
  db: ServerClient,
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
    return { hasActiveCycle: false, activeCycle: null, tiers, groupedPlayers: {} };
  }

  const { data: standingsData, error: standingsError } = await db
    .from("ladder_standing_events")
    .select(
      "player_id, event_type, tier_before_id, tier_after_id, stars_before, stars_after, source_type, source_id, occurred_at, created_at, metadata",
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

  const playerIds = Array.from(latestByPlayer.keys()).map(Number);
  if (playerIds.length === 0) {
    return { hasActiveCycle: true, activeCycle, tiers, groupedPlayers: {} };
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

  const groupedPlayers: Record<number, LadderPlayer[]> = {};
  for (const [pid, lastEvent] of latestByPlayer) {
    const info = playerInfoMap.get(pid);
    if (!info) continue;

    const entry: LadderPlayer = {
      player_id: pid,
      name: info.name ?? "Unknown",
      nickname: info.nickname ?? "",
      image_link: info.image_link ?? null,
      stars: lastEvent.starsAfter,
      isOptedIn: info.is_ladder_opt_in ?? false,
      hasPlayedThisCycle: hasLadderMatchThisCycle.has(pid),
      winsThisCycle: winsByPlayer.get(pid) ?? 0,
      lastEvent,
    };

    if (!groupedPlayers[lastEvent.tierAfterId]) groupedPlayers[lastEvent.tierAfterId] = [];
    groupedPlayers[lastEvent.tierAfterId].push(entry);
  }

  for (const tierId of Object.keys(groupedPlayers)) {
    groupedPlayers[Number(tierId)].sort((a, b) => {
      if (b.stars !== a.stars) return b.stars - a.stars;
      if (b.winsThisCycle !== a.winsThisCycle) return b.winsThisCycle - a.winsThisCycle;
      return getLastNameKey(a.name).localeCompare(getLastNameKey(b.name));
    });
  }

  return { hasActiveCycle: true, activeCycle, tiers, groupedPlayers };
}

const getCachedLadderPageData = unstable_cache(
  fetchLadderPageDataUncached,
  ["ladder-page-data"],
  { revalidate: 120 },
);

export async function fetchLadderPageData(): Promise<LadderPageData> {
  return getCachedLadderPageData();
}
