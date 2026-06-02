import { SupabaseClient } from "@supabase/supabase-js";
import type { NotifType, PlayerNotificationPreferences } from "./types";

const ALL_TYPES: NotifType[] = ["match_results", "match_scheduled", "predictions"];

/**
 * Fetch all notification preferences for a single player.
 * Missing rows mean subscribed (returns true for that type).
 */
export async function fetchPlayerPrefs(
  supabase: SupabaseClient,
  playerId: number,
): Promise<PlayerNotificationPreferences> {
  const { data } = await supabase
    .from("player_notification_preferences")
    .select("notif_type, subscribed")
    .eq("player_id", playerId);

  const prefs: PlayerNotificationPreferences = {};
  for (const type of ALL_TYPES) {
    const row = (data ?? []).find((r) => r.notif_type === type);
    prefs[type] = row ? (row.subscribed as boolean) : true;
  }
  return prefs;
}

/**
 * Fetch preferences for multiple players at once.
 * Returns a Map<playerId, PlayerNotificationPreferences>.
 */
export async function fetchPlayerPrefsMap(
  supabase: SupabaseClient,
  playerIds: number[],
): Promise<Map<number, PlayerNotificationPreferences>> {
  if (playerIds.length === 0) return new Map();

  const { data } = await supabase
    .from("player_notification_preferences")
    .select("player_id, notif_type, subscribed")
    .in("player_id", playerIds);

  const result = new Map<number, PlayerNotificationPreferences>();

  for (const id of playerIds) {
    const prefs: PlayerNotificationPreferences = {};
    for (const type of ALL_TYPES) {
      const row = (data ?? []).find(
        (r) => r.player_id === id && r.notif_type === type,
      );
      prefs[type] = row ? (row.subscribed as boolean) : true;
    }
    result.set(id, prefs);
  }

  return result;
}

/**
 * Upsert a single notification preference for a player.
 */
export async function setPlayerPref(
  supabase: SupabaseClient,
  playerId: number,
  type: NotifType | "all",
  subscribed: boolean,
): Promise<void> {
  if (type === "all") {
    // "all" maps to the master is_notifications_subscribed on players table
    await supabase
      .from("players")
      .update({ is_notifications_subscribed: subscribed })
      .eq("player_id", playerId);
    return;
  }

  await supabase
    .from("player_notification_preferences")
    .upsert(
      { player_id: playerId, notif_type: type, subscribed, updated_at: new Date().toISOString() },
      { onConflict: "player_id,notif_type" },
    );
}
