import { NextResponse } from "next/server";
import { getAuthorizedAdminClient } from "@/app/api/admin/_lib/auth";
import { fetchActiveCycleId, fetchBackoutCounts } from "@/lib/ladder/ladderQueue";

export type AdminQueueOverview = {
  cycleId: number | null;
  tiers: Array<{ id: number; name: string; rank: number }>;
  waiting: Array<{ playerId: number; name: string; tierId: number; queuedAt: string; requeueReason: string | null }>;
  openMatches: Array<{
    matchId: number;
    status: string;
    playByAt: string | null;
    dateLocal: string | null;
    players: string[];
  }>;
  strikes: Array<{ playerId: number; name: string; backouts: number }>;
};

// Admin view of the ladder queue: who's waiting per tier, open queue matches with deadlines, and
// derived strike (backout) counts.
export async function GET(request: Request) {
  const auth = await getAuthorizedAdminClient(request);
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const empty: AdminQueueOverview = { cycleId: null, tiers: [], waiting: [], openMatches: [], strikes: [] };
  const cycleId = await fetchActiveCycleId(supabase);
  if (!cycleId) return NextResponse.json(empty, { status: 200 });

  const [{ data: tiers }, { data: waitingRows }, { data: openRows }, backouts] = await Promise.all([
    supabase.from("ladder_tiers").select("id, name, rank").order("rank", { ascending: false }),
    supabase
      .from("ladder_queue_entries")
      .select("player_id, tier_id, queued_at, requeue_reason")
      .eq("cycle_id", cycleId)
      .eq("status", "waiting")
      .order("queued_at", { ascending: true }),
    supabase
      .from("ladder_matches")
      .select("match_id, play_by_at, matches(status, date_local)")
      .eq("cycle_id", cycleId)
      .eq("source", "queue")
      .is("cancelled_at", null)
      .order("play_by_at", { ascending: true }),
    fetchBackoutCounts(supabase, cycleId),
  ]);

  type MatchEmbed = { status?: string | null; date_local?: string | null };
  const open = (openRows ?? [])
    .map((row) => {
      const embed = row.matches as MatchEmbed | MatchEmbed[] | null;
      const m = (Array.isArray(embed) ? embed[0] : embed) ?? null;
      return {
        matchId: row.match_id as number,
        status: m?.status ?? "unknown",
        playByAt: (row.play_by_at as string | null) ?? null,
        dateLocal: m?.date_local ?? null,
      };
    })
    .filter((m) => m.status === "assigned" || m.status === "scheduled");

  const { data: teams } = open.length
    ? await supabase
        .from("match_teams")
        .select("match_id, team_number, player_1_id, player_2_id")
        .in("match_id", open.map((m) => m.matchId))
    : { data: [] as Array<Record<string, unknown>> };

  const playerIds = new Set<number>([
    ...(waitingRows ?? []).map((w) => w.player_id as number),
    ...backouts.keys(),
    ...(teams ?? []).flatMap((t) => [t.player_1_id as number, t.player_2_id as number]),
  ]);
  const { data: players } = playerIds.size
    ? await supabase.from("players").select("player_id, name, nickname").in("player_id", [...playerIds])
    : { data: [] as Array<Record<string, unknown>> };
  const nameOf = (id: number) => {
    const p = (players ?? []).find((row) => row.player_id === id);
    return (p?.nickname as string | null) || (p?.name as string | null) || `#${id}`;
  };

  const overview: AdminQueueOverview = {
    cycleId,
    tiers: (tiers ?? []) as AdminQueueOverview["tiers"],
    waiting: (waitingRows ?? []).map((w) => ({
      playerId: w.player_id as number,
      name: nameOf(w.player_id as number),
      tierId: w.tier_id as number,
      queuedAt: w.queued_at as string,
      requeueReason: (w.requeue_reason as string | null) ?? null,
    })),
    openMatches: open.map((m) => ({
      ...m,
      players: (teams ?? [])
        .filter((t) => t.match_id === m.matchId)
        .sort((a, b) => (a.team_number as number) - (b.team_number as number))
        .map((t) => `${nameOf(t.player_1_id as number)} & ${nameOf(t.player_2_id as number)}`),
    })),
    strikes: [...backouts.entries()]
      .map(([playerId, count]) => ({ playerId, name: nameOf(playerId), backouts: count }))
      .sort((a, b) => b.backouts - a.backouts || a.name.localeCompare(b.name)),
  };

  return NextResponse.json(overview, { status: 200 });
}
