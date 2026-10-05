import { NextResponse } from "next/server";
import { getAuthorizedAdminClient } from "@/app/api/admin/_lib/auth";
import { fetchActiveCycleId } from "@/lib/ladder/ladderQueue";
import { fetchDuoBackoutCounts } from "@/lib/ladder/ladderDuoQueue";
import { isDuoLadderAvailable } from "@/lib/ladder/ladderSchema";
import { duoDisplayName } from "@/lib/ladder/ladderDuoShared";

export type AdminDuoQueueOverview = {
  available: boolean;
  cycleId: number | null;
  tiers: Array<{ id: number; name: string; rank: number }>;
  waiting: Array<{ duoId: number; label: string; tierId: number; queuedAt: string; requeueReason: string | null }>;
  openMatches: Array<{
    matchId: number;
    status: string;
    playByAt: string | null;
    dateLocal: string | null;
    duos: string[];
  }>;
  strikes: Array<{ duoId: number; label: string; backouts: number }>;
};

// Admin view of the duo queue: waiting duos per tier, open duo queue matches with deadlines, and
// derived per-duo strike (backout) counts. Mirrors /api/admin/ladder/queue.
export async function GET(request: Request) {
  const auth = await getAuthorizedAdminClient(request);
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const empty: AdminDuoQueueOverview = {
    available: false,
    cycleId: null,
    tiers: [],
    waiting: [],
    openMatches: [],
    strikes: [],
  };
  if (!(await isDuoLadderAvailable(supabase))) return NextResponse.json(empty, { status: 200 });

  const cycleId = await fetchActiveCycleId(supabase);
  if (!cycleId) return NextResponse.json({ ...empty, available: true }, { status: 200 });

  const [{ data: tiers }, { data: waitingRows }, { data: openRows }, backouts] = await Promise.all([
    supabase.from("ladder_tiers").select("id, name, rank").order("rank", { ascending: false }),
    supabase
      .from("ladder_duo_queue_entries")
      .select("duo_id, tier_id, queued_at, requeue_reason")
      .eq("cycle_id", cycleId)
      .eq("status", "waiting")
      .order("queued_at", { ascending: true }),
    supabase
      .from("ladder_duo_matches")
      .select("match_id, play_by_at, team1_duo_id, team2_duo_id, matches(status, date_local)")
      .eq("cycle_id", cycleId)
      .eq("source", "queue")
      .is("cancelled_at", null)
      .order("play_by_at", { ascending: true }),
    fetchDuoBackoutCounts(supabase, cycleId),
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
        duoIds: [Number(row.team1_duo_id), Number(row.team2_duo_id)],
      };
    })
    .filter((m) => m.status === "assigned" || m.status === "scheduled");

  const duoIds = new Set<number>([
    ...(waitingRows ?? []).map((w) => Number(w.duo_id)),
    ...backouts.keys(),
    ...open.flatMap((m) => m.duoIds),
  ]);
  const { data: duos } = duoIds.size
    ? await supabase.from("ladder_duos").select("id, name, player_low_id, player_high_id").in("id", [...duoIds])
    : { data: [] as Array<{ id: number; name: string | null; player_low_id: number; player_high_id: number }> };
  const playerIds = (duos ?? []).flatMap((d) => [d.player_low_id as number, d.player_high_id as number]);
  const { data: players } = playerIds.length
    ? await supabase.from("players").select("player_id, name, nickname").in("player_id", playerIds)
    : { data: [] as Array<{ player_id: number; name: string | null; nickname: string | null }> };
  const playerById = new Map((players ?? []).map((p) => [Number(p.player_id), p]));
  const labelOf = (duoId: number) => {
    const d = (duos ?? []).find((row) => Number(row.id) === duoId);
    if (!d) return `Duo #${duoId}`;
    return duoDisplayName(d.name as string | null, [
      playerById.get(d.player_low_id as number),
      playerById.get(d.player_high_id as number),
    ]);
  };

  const overview: AdminDuoQueueOverview = {
    available: true,
    cycleId,
    tiers: (tiers ?? []) as AdminDuoQueueOverview["tiers"],
    waiting: (waitingRows ?? []).map((w) => ({
      duoId: Number(w.duo_id),
      label: labelOf(Number(w.duo_id)),
      tierId: w.tier_id as number,
      queuedAt: w.queued_at as string,
      requeueReason: (w.requeue_reason as string | null) ?? null,
    })),
    openMatches: open.map(({ duoIds: ids, ...m }) => ({ ...m, duos: ids.map(labelOf) })),
    strikes: [...backouts.entries()]
      .map(([duoId, count]) => ({ duoId, label: labelOf(duoId), backouts: count }))
      .sort((a, b) => b.backouts - a.backouts || a.label.localeCompare(b.label)),
  };

  return NextResponse.json(overview, { status: 200 });
}
