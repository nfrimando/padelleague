import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerServiceClient, getServerUserClient } from "@/app/api/_lib/supabase";

// Server-side counterpart of useCurrentPlayer: resolves the signed-in user's players row via
// players.email = auth email, and hands back a service-role client for the ladder writes (the
// queue tables have no RLS write policies).
export async function getAuthorizedPlayer(
  request: Request,
): Promise<
  | { ok: true; supabase: SupabaseClient; playerId: number }
  | { ok: false; response: NextResponse }
> {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const {
    data: { user },
    error: authError,
  } = await getServerUserClient(authorization).auth.getUser();
  if (authError || !user?.email) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const supabase = getServerServiceClient();
  const { data: player } = await supabase
    .from("players")
    .select("player_id")
    .eq("email", user.email)
    .maybeSingle();

  if (!player) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Your account isn't linked to a player profile." },
        { status: 403 },
      ),
    };
  }

  return { ok: true, supabase, playerId: player.player_id as number };
}
