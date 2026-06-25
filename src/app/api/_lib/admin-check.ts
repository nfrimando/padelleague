import type { SupabaseClient } from "@supabase/supabase-js";

// Single source of truth for the admin check. Returns the DB error so callers
// that distinguish 500-vs-403 (getAuthorizedAdminClient) can; boolean-only
// callers ignore it. The revoked_at filter lives ONLY here.
export async function isUserAdmin(client: SupabaseClient, userId: string) {
  const { data, error } = await client
    .from("admin_users")
    .select("user_id")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .maybeSingle();
  return { isAdmin: Boolean(data), error };
}
