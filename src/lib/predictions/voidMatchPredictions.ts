import { AdminSupabaseClient } from "@/app/api/admin/_lib/auth";

export type VoidedPredictor = {
  playerId: number | null;
  email: string;
  name: string | null;
  nickname: string | null;
};

export async function voidMatchPredictions(
  supabase: AdminSupabaseClient,
  matchId: number,
  voidReason: string,
): Promise<VoidedPredictor[]> {
  const { data: active, error: fetchErr } = await supabase
    .from("predictions")
    .select("id,email,player_id")
    .eq("match_id", matchId)
    .eq("type", "winning_team")
    .is("voided_at", null);

  if (fetchErr) throw new Error(`Failed to fetch predictions: ${fetchErr.message}`);
  if (!active || active.length === 0) return [];

  const ids = active.map((r) => r.id);
  const now = new Date().toISOString();

  const { error: updateErr } = await supabase
    .from("predictions")
    .update({ voided_at: now, void_reason: voidReason })
    .in("id", ids);

  if (updateErr) throw new Error(`Failed to void predictions: ${updateErr.message}`);

  const playerIds = active
    .map((r) => r.player_id)
    .filter((id): id is number => id !== null);

  const playerMap = new Map<number, { name: string | null; nickname: string | null }>();
  if (playerIds.length > 0) {
    const { data: players } = await supabase
      .from("players")
      .select("player_id,name,nickname")
      .in("player_id", playerIds);

    for (const p of players ?? []) {
      playerMap.set(Number(p.player_id), { name: p.name ?? null, nickname: p.nickname ?? null });
    }
  }

  return active.map((r) => {
    const info = r.player_id !== null ? playerMap.get(Number(r.player_id)) : undefined;
    return {
      playerId: r.player_id ?? null,
      email: r.email,
      name: info?.name ?? null,
      nickname: info?.nickname ?? null,
    };
  });
}
