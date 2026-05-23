import { NextRequest, NextResponse } from "next/server";
import {
  getServerUserClient,
  getServerServiceClient,
} from "@/app/api/_lib/supabase";
import { fetchPlayerPrefs } from "@/lib/notificationPreferences";

export async function GET(request: NextRequest) {
  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userClient = getServerUserClient(authorization);
  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser();
  if (authError || !user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceClient = getServerServiceClient();

  const { data: player, error: lookupError } = await serviceClient
    .from("players")
    .select("player_id")
    .eq("email", user.email)
    .maybeSingle();

  if (lookupError || !player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  const prefs = await fetchPlayerPrefs(serviceClient, player.player_id as number);
  return NextResponse.json({ notification_preferences: prefs });
}
