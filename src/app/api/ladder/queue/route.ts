import { NextResponse } from "next/server";
import { getAuthorizedPlayer } from "@/app/api/ladder/_lib/currentPlayer";
import { fetchLatestLadderStandings } from "@/lib/ladder/ladderStandingLedger";
import {
  countWaitingInTier,
  fetchActiveCycleId,
  findOpenLadderMatch,
} from "@/lib/ladder/ladderQueue";

export type LadderQueueState = {
  cycleId: number | null;
  tier: { id: number; name: string } | null;
  waiting: { queuedAt: string; position: number; waitingCount: number } | null;
  openMatch: {
    matchId: number;
    status: "assigned" | "scheduled";
    source: string;
    playByAt: string | null;
    team1: string[];
    team2: string[];
  } | null;
};

// The signed-in player's queue state for the /ladder queue panel.
export async function GET(request: Request) {
  const auth = await getAuthorizedPlayer(request);
  if (!auth.ok) return auth.response;
  const { supabase, playerId } = auth;

  const empty: LadderQueueState = { cycleId: null, tier: null, waiting: null, openMatch: null };

  const cycleId = await fetchActiveCycleId(supabase);
  if (!cycleId) return NextResponse.json(empty, { status: 200 });

  const standing = (await fetchLatestLadderStandings(supabase, cycleId, [playerId])).get(
    String(playerId),
  );

  let tier: LadderQueueState["tier"] = null;
  if (standing) {
    const { data: tierRow } = await supabase
      .from("ladder_tiers")
      .select("id, name")
      .eq("id", standing.tierId)
      .maybeSingle();
    tier = tierRow ? { id: tierRow.id as number, name: tierRow.name as string } : null;
  }

  const { data: entry } = await supabase
    .from("ladder_queue_entries")
    .select("tier_id, queued_at, created_at")
    .eq("player_id", playerId)
    .eq("status", "waiting")
    .maybeSingle();

  let waiting: LadderQueueState["waiting"] = null;
  if (entry) {
    const tierId = entry.tier_id as number;
    const queuedAt = entry.queued_at as string;
    const { count: ahead } = await supabase
      .from("ladder_queue_entries")
      .select("id", { count: "exact", head: true })
      .eq("cycle_id", cycleId)
      .eq("tier_id", tierId)
      .eq("status", "waiting")
      .lt("queued_at", queuedAt);
    waiting = {
      queuedAt,
      position: (ahead ?? 0) + 1,
      waitingCount: await countWaitingInTier(supabase, cycleId, tierId),
    };
  }

  let openMatch: LadderQueueState["openMatch"] = null;
  const open = await findOpenLadderMatch(supabase, cycleId, playerId);
  if (open) {
    const { data: teams } = await supabase
      .from("match_teams")
      .select("team_number, player_1_id, player_2_id")
      .eq("match_id", open.matchId);
    const ids = (teams ?? []).flatMap((t) => [t.player_1_id as number, t.player_2_id as number]);
    const { data: players } = await supabase
      .from("players")
      .select("player_id, name, nickname")
      .in("player_id", ids);
    const nameOf = (id: number) => {
      const p = (players ?? []).find((row) => row.player_id === id);
      return (p?.nickname as string | null) || (p?.name as string | null) || "Unknown";
    };
    const team = (n: number) => {
      const t = (teams ?? []).find((row) => row.team_number === n);
      return t ? [nameOf(t.player_1_id as number), nameOf(t.player_2_id as number)] : [];
    };
    openMatch = { ...open, team1: team(1), team2: team(2) };
  }

  const state: LadderQueueState = { cycleId, tier, waiting, openMatch };
  return NextResponse.json(state, { status: 200 });
}
