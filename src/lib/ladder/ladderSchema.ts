import type { SupabaseClient } from "@supabase/supabase-js";

// Migrations in this repo are applied by hand, so ladder code can reach production before the
// tables it reads exist. These helpers let a read path treat "table/column not there yet" as the
// feature being off rather than as an outage.

// Postgres 42P01 (undefined_table) / 42703 (undefined_column), or PostgREST's PGRST205 / PGRST204
// when the table / column is absent from its schema cache.
export function isMissingTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST205" ||
    error.code === "PGRST204" ||
    /Could not find the (table|column)/i.test(error.message ?? "") ||
    /relation .* does not exist/i.test(error.message ?? "")
  );
}

// Whether the duo ladder schema (20261005000000+) has been applied. Memoized per server process: a
// positive answer is permanent; a negative one is re-probed after a minute so applying the migration
// switches the feature on without a redeploy.
const NEGATIVE_TTL_MS = 60_000;
let duoAvailableCache: { value: boolean; at: number } | null = null;

export async function isDuoLadderAvailable(client: SupabaseClient): Promise<boolean> {
  if (duoAvailableCache?.value) return true;
  if (duoAvailableCache && Date.now() - duoAvailableCache.at < NEGATIVE_TTL_MS) return false;

  const { error } = await client.from("ladder_duos").select("id", { head: true, count: "exact" }).limit(1);
  const value = !error || !isMissingTableError(error);
  duoAvailableCache = { value, at: Date.now() };
  return value;
}

export const DUO_LADDER_UNAVAILABLE = "The duo ladder isn't enabled yet.";
