import { NextResponse } from "next/server";
import {
  getAuthorizedAdminClient,
  isRecord,
  normalizeRequiredPositiveInteger,
} from "@/app/api/admin/_lib/auth";
import {
  adminCreateDuo,
  DUO_COLUMNS,
  expireStaleDuoInvites,
  loadDuoByPair,
  type DuoRow,
} from "@/lib/ladder/ladderDuos";
import { fetchLatestDuoStandings } from "@/lib/ladder/ladderDuoPlacement";
import { fetchDuoBackoutCounts } from "@/lib/ladder/ladderDuoQueue";
import { fetchActiveCycleId } from "@/lib/ladder/ladderQueue";
import { DUO_LADDER_UNAVAILABLE, isDuoLadderAvailable } from "@/lib/ladder/ladderSchema";
import { duoDisplayName, normalizeDuoName, type DuoStatus } from "@/lib/ladder/ladderDuoShared";
import { revalidateLadderPage } from "@/app/api/ladder/_lib/duo";

export type AdminDuoRow = {
  duoId: number;
  name: string | null;
  label: string;
  status: DuoStatus;
  players: Array<{ playerId: number; name: string }>;
  createdByAdmin: boolean;
  invitedAt: string | null;
  acceptedAt: string | null;
  dissolvedAt: string | null;
  tierId: number | null;
  stars: number | null;
  cushionAvailable: boolean | null;
  strikes: number;
  waiting: boolean;
  openMatchId: number | null;
};

export type AdminDuoList = {
  available: boolean;
  cycleId: number | null;
  tiers: Array<{ id: number; name: string; rank: number }>;
  duos: AdminDuoRow[];
};

// GET /api/admin/ladder/duos?status=active|pending|all&pair=a,b
// Every duo with its current standing (active cycle), strikes, queue ticket and open match. With
// `pair`, just the duo for those two players (any status) — used by Schedule Match's duo chips.
export async function GET(request: Request) {
  const auth = await getAuthorizedAdminClient(request);
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  if (!(await isDuoLadderAvailable(supabase))) {
    const empty: AdminDuoList = { available: false, cycleId: null, tiers: [], duos: [] };
    return NextResponse.json(empty, { status: 200 });
  }

  await expireStaleDuoInvites(supabase);

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status") ?? "all";
  const pairParam = url.searchParams.get("pair");

  let rows: DuoRow[] = [];
  if (pairParam) {
    const [a, b] = pairParam.split(",").map((v) => normalizeRequiredPositiveInteger(v));
    if (!a || !b) return NextResponse.json({ error: "pair must be two player ids." }, { status: 400 });
    const duo = await loadDuoByPair(supabase, a, b);
    rows = duo ? [duo] : [];
  } else {
    let query = supabase.from("ladder_duos").select(DUO_COLUMNS).order("created_at", { ascending: false });
    if (statusParam !== "all") query = query.eq("status", statusParam);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    rows = (data ?? []) as DuoRow[];
  }

  const cycleId = await fetchActiveCycleId(supabase);
  const ids = rows.map((d) => d.id);
  const playerIds = Array.from(new Set(rows.flatMap((d) => [d.player_low_id, d.player_high_id])));

  const [{ data: tiers }, { data: players }, standings, strikes, waitingRes, openRes] = await Promise.all([
    supabase.from("ladder_tiers").select("id, name, rank").order("rank", { ascending: false }),
    playerIds.length
      ? supabase.from("players").select("player_id, name, nickname").in("player_id", playerIds)
      : Promise.resolve({ data: [] as Array<{ player_id: number; name: string | null; nickname: string | null }> }),
    cycleId ? fetchLatestDuoStandings(supabase, cycleId, ids) : Promise.resolve(new Map()),
    cycleId ? fetchDuoBackoutCounts(supabase, cycleId) : Promise.resolve(new Map<number, number>()),
    ids.length
      ? supabase.from("ladder_duo_queue_entries").select("duo_id").eq("status", "waiting").in("duo_id", ids)
      : Promise.resolve({ data: [] as Array<{ duo_id: number }> }),
    ids.length && cycleId
      ? supabase
          .from("ladder_duo_matches")
          .select("match_id, team1_duo_id, team2_duo_id, matches(status)")
          .eq("cycle_id", cycleId)
          .is("cancelled_at", null)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
  ]);

  const playerById = new Map(
    ((players ?? []) as Array<{ player_id: number; name: string | null; nickname: string | null }>).map((p) => [
      Number(p.player_id),
      p,
    ]),
  );
  const waiting = new Set((waitingRes.data ?? []).map((w) => Number(w.duo_id)));
  type StatusEmbed = { status?: string | null };
  const openByDuo = new Map<number, number>();
  for (const row of openRes.data ?? []) {
    const embed = row.matches as StatusEmbed | StatusEmbed[] | null;
    const status = (Array.isArray(embed) ? embed[0] : embed)?.status;
    if (status !== "assigned" && status !== "scheduled") continue;
    openByDuo.set(Number(row.team1_duo_id), Number(row.match_id));
    openByDuo.set(Number(row.team2_duo_id), Number(row.match_id));
  }

  const list: AdminDuoList = {
    available: true,
    cycleId,
    tiers: (tiers ?? []) as AdminDuoList["tiers"],
    duos: rows.map((d) => {
      const low = playerById.get(d.player_low_id);
      const high = playerById.get(d.player_high_id);
      const standing = standings.get(String(d.id));
      return {
        duoId: d.id,
        name: d.name,
        label: duoDisplayName(d.name, [low, high]),
        status: d.status,
        players: [d.player_low_id, d.player_high_id].map((id) => {
          const p = playerById.get(id);
          return { playerId: id, name: p?.nickname || p?.name || `#${id}` };
        }),
        createdByAdmin: d.invited_by_player_id == null,
        invitedAt: d.invited_at,
        acceptedAt: d.accepted_at,
        dissolvedAt: d.dissolved_at,
        tierId: standing?.tierId ?? null,
        stars: standing?.stars ?? null,
        cushionAvailable: standing?.cushionAvailable ?? null,
        strikes: strikes.get(d.id) ?? 0,
        waiting: waiting.has(d.id),
        openMatchId: openByDuo.get(d.id) ?? null,
      };
    }),
  };

  return NextResponse.json(list, { status: 200 });
}

// POST /api/admin/ladder/duos — create (or revive) a duo directly as active, no invite.
// Body: { playerA, playerB, name? }
export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!isRecord(payload)) return NextResponse.json({ error: "Body must be an object." }, { status: 400 });

  const playerA = normalizeRequiredPositiveInteger(payload.playerA);
  const playerB = normalizeRequiredPositiveInteger(payload.playerB);
  if (!playerA || !playerB) {
    return NextResponse.json({ error: "playerA and playerB are required." }, { status: 400 });
  }
  const name = normalizeDuoName(payload.name);
  if (!name.ok) return NextResponse.json({ error: name.error }, { status: 400 });

  const auth = await getAuthorizedAdminClient(request);
  if (!auth.ok) return auth.response;
  if (!(await isDuoLadderAvailable(auth.supabase))) {
    return NextResponse.json({ error: DUO_LADDER_UNAVAILABLE }, { status: 503 });
  }

  const result = await adminCreateDuo(auth.supabase, {
    playerA,
    playerB,
    name: name.name,
    adminUserId: auth.userId,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  revalidateLadderPage();
  return NextResponse.json(
    { duoId: result.duo.id, created: result.created, ladderWarning: result.ladderWarning },
    { status: result.created ? 201 : 200 },
  );
}
