import type { SupabaseClient } from "@supabase/supabase-js";
import {
  expireStaleDuoInvites,
  findOpenDuoMatch,
  listDuosForPlayer,
  partnerOf,
  type DuoRow,
} from "@/lib/ladder/ladderDuos";
import { fetchLatestDuoStandings } from "@/lib/ladder/ladderDuoPlacement";
import { fetchActiveCycleId } from "@/lib/ladder/ladderQueue";
import { fetchDuoBackoutCounts } from "@/lib/ladder/ladderDuoQueue";
import { isDuoLadderAvailable } from "@/lib/ladder/ladderSchema";
import {
  duoDisplayName,
  type DuoPlayerLite,
  type MyDuoEntry,
  type PlayerDuoState,
} from "@/lib/ladder/ladderDuoShared";

// Everything the /ladder duo panels need about the signed-in player's duos, in one round trip:
// active duos (with standing, queue position, open match, strikes) and pending invites both ways.
export async function fetchPlayerDuoState(
  supabase: SupabaseClient,
  playerId: number,
): Promise<PlayerDuoState> {
  const empty: PlayerDuoState = { available: false, cycleId: null, duos: [], incoming: [], outgoing: [] };
  if (!(await isDuoLadderAvailable(supabase))) return empty;

  await expireStaleDuoInvites(supabase);
  const cycleId = await fetchActiveCycleId(supabase);
  const rows = await listDuosForPlayer(supabase, playerId, ["pending", "active"]);
  if (rows.length === 0) return { ...empty, available: true, cycleId };

  const playerIds = Array.from(new Set(rows.flatMap((d) => [d.player_low_id, d.player_high_id])));
  const { data: playersData } = await supabase
    .from("players")
    .select("player_id, name, nickname, image_link")
    .in("player_id", playerIds);
  const players = new Map<number, DuoPlayerLite>();
  for (const p of (playersData ?? []) as DuoPlayerLite[]) players.set(Number(p.player_id), p);

  const { data: tiersData } = await supabase.from("ladder_tiers").select("id, name");
  const tierName = new Map<number, string>(
    ((tiersData ?? []) as Array<{ id: number; name: string }>).map((t) => [t.id, t.name]),
  );

  const activeIds = rows.filter((d) => d.status === "active").map((d) => d.id);
  const standings = cycleId ? await fetchLatestDuoStandings(supabase, cycleId, activeIds) : new Map();
  const strikes = cycleId ? await fetchDuoBackoutCounts(supabase, cycleId) : new Map<number, number>();

  const waitingByDuo = new Map<number, { tier_id: number; queued_at: string }>();
  if (cycleId && activeIds.length > 0) {
    const { data } = await supabase
      .from("ladder_duo_queue_entries")
      .select("duo_id, tier_id, queued_at")
      .eq("cycle_id", cycleId)
      .eq("status", "waiting")
      .in("duo_id", activeIds);
    for (const row of data ?? []) {
      waitingByDuo.set(Number(row.duo_id), { tier_id: row.tier_id as number, queued_at: row.queued_at as string });
    }
  }

  const labelOf = (duo: Pick<DuoRow, "name" | "player_low_id" | "player_high_id">) =>
    duoDisplayName(duo.name, [players.get(duo.player_low_id), players.get(duo.player_high_id)]);

  const nameOf = (id: number) => {
    const p = players.get(id);
    return p?.nickname || p?.name || "Unknown";
  };

  const build = async (duo: DuoRow): Promise<MyDuoEntry> => {
    const partnerId = partnerOf(duo, playerId);
    const partner = players.get(partnerId) ?? { player_id: partnerId, name: null, nickname: null };
    const standing = standings.get(String(duo.id));

    let waiting: MyDuoEntry["waiting"] = null;
    const ticket = waitingByDuo.get(duo.id);
    if (ticket && cycleId) {
      const [{ count: ahead }, { count: total }] = await Promise.all([
        supabase
          .from("ladder_duo_queue_entries")
          .select("id", { count: "exact", head: true })
          .eq("cycle_id", cycleId)
          .eq("tier_id", ticket.tier_id)
          .eq("status", "waiting")
          .lt("queued_at", ticket.queued_at),
        supabase
          .from("ladder_duo_queue_entries")
          .select("id", { count: "exact", head: true })
          .eq("cycle_id", cycleId)
          .eq("tier_id", ticket.tier_id)
          .eq("status", "waiting"),
      ]);
      waiting = {
        queuedAt: ticket.queued_at,
        position: (ahead ?? 0) + 1,
        waitingCount: total ?? 1,
        tierName: tierName.get(ticket.tier_id) ?? "",
      };
    }

    let openMatch: MyDuoEntry["openMatch"] = null;
    if (duo.status === "active") {
      const open = await findOpenDuoMatch(supabase, duo.id);
      if (open) {
        const { data: dm } = await supabase
          .from("ladder_duo_matches")
          .select("team1_duo_id, team2_duo_id")
          .eq("match_id", open.matchId)
          .maybeSingle();
        const { data: matchDuos } = await supabase
          .from("ladder_duos")
          .select("id, name, player_low_id, player_high_id")
          .in("id", [dm?.team1_duo_id, dm?.team2_duo_id].filter((v) => v != null));
        // Opponent players may not be in `players` yet.
        const missing = (matchDuos ?? [])
          .flatMap((d) => [d.player_low_id as number, d.player_high_id as number])
          .filter((id) => !players.has(id));
        if (missing.length > 0) {
          const { data: extra } = await supabase
            .from("players")
            .select("player_id, name, nickname, image_link")
            .in("player_id", missing);
          for (const p of (extra ?? []) as DuoPlayerLite[]) players.set(Number(p.player_id), p);
        }
        const team = (duoId: unknown) => {
          const d = (matchDuos ?? []).find((row) => row.id === duoId);
          if (!d) return { label: "", players: [] };
          return {
            label: labelOf(d as DuoRow),
            players: [nameOf(d.player_low_id as number), nameOf(d.player_high_id as number)],
          };
        };
        openMatch = {
          matchId: open.matchId,
          status: open.status === "scheduled" ? "scheduled" : "assigned",
          source: open.source,
          playByAt: open.playByAt,
          team1: team(dm?.team1_duo_id),
          team2: team(dm?.team2_duo_id),
        };
      }
    }

    return {
      duoId: duo.id,
      name: duo.name,
      label: labelOf(duo),
      status: duo.status,
      role:
        duo.invited_by_player_id == null
          ? "admin"
          : duo.invited_by_player_id === playerId
            ? "inviter"
            : "invitee",
      partner,
      invitedAt: duo.invited_at,
      standing: standing
        ? {
            tierId: standing.tierId,
            tierName: tierName.get(standing.tierId) ?? "",
            stars: standing.stars,
            cushionAvailable: standing.cushionAvailable,
          }
        : null,
      waiting,
      openMatch,
      strikes: strikes.get(duo.id) ?? 0,
    };
  };

  const entries: MyDuoEntry[] = [];
  for (const duo of rows) entries.push(await build(duo));

  return {
    available: true,
    cycleId,
    duos: entries.filter((e) => e.status === "active"),
    incoming: entries.filter((e) => e.status === "pending" && e.role === "invitee"),
    outgoing: entries.filter((e) => e.status === "pending" && e.role === "inviter"),
  };
}
