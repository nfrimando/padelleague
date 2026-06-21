import { NextResponse } from "next/server";
import {
  getServerUserClient,
  getServerServiceClient,
} from "@/app/api/_lib/supabase";

type PlayerAuthResult =
  | { ok: true; playerId: number; userId: string; isAdmin: boolean }
  | { ok: false; response: NextResponse };

/**
 * Validates that the request comes from an authenticated, existing player.
 * Also resolves whether the caller is an admin.
 */
export async function getAuthorizedPlayer(
  request: Request,
): Promise<PlayerAuthResult> {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Missing or invalid Authorization header." },
        { status: 401 },
      ),
    };
  }

  const userClient = getServerUserClient(authorization);
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user?.email) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Unauthorized user session." },
        { status: 401 },
      ),
    };
  }

  const serviceClient = getServerServiceClient();

  const { data: player } = await serviceClient
    .from("players")
    .select("player_id")
    .eq("email", user.email)
    .maybeSingle();

  if (!player) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Only existing league members can access this page." },
        { status: 403 },
      ),
    };
  }

  const { data: adminRow } = await serviceClient
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  return {
    ok: true,
    playerId: player.player_id as number,
    userId: user.id,
    isAdmin: Boolean(adminRow),
  };
}
