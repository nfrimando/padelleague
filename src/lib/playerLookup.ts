import { supabase } from "@/lib/supabase";

export const PLAYER_LOOKUP_REGISTER_SELECT =
  "player_id, name, is_profile_complete";
export const PLAYER_LOOKUP_DASHBOARD_SELECT = "*";

type FetchPlayerByEmailOptions = {
  email: string | null | undefined;
  select: string;
};

export async function fetchPlayerByEmail<T>(
  options: FetchPlayerByEmailOptions,
): Promise<{ player: T | null; error: string | null }> {
  if (!options.email) {
    return { player: null, error: null };
  }

  const { data, error } = await supabase
    .from("players")
    .select(options.select)
    .eq("email", options.email)
    .maybeSingle();

  if (error) {
    return {
      player: null,
      error: error.message || "Failed to load player by email.",
    };
  }

  return { player: (data as T | null) ?? null, error: null };
}
