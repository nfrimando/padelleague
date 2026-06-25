import type { SupabaseClient } from "@supabase/supabase-js";

export async function checkIsAdmin(client: SupabaseClient, userId: string) {
  const { data } = await client
    .from("admin_users")
    .select("user_id")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .maybeSingle();
  return Boolean(data);
}
