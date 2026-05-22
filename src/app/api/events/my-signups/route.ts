import { NextResponse } from "next/server";
import {
  getServerServiceClient,
  getServerUserClient,
} from "@/app/api/_lib/supabase";

/** GET /api/events/my-signups — returns accepted event IDs for the signed-in user */
export async function GET(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json({ acceptedEventIds: [] });
  }

  let userClient;
  try {
    userClient = getServerUserClient(authorization);
  } catch {
    return NextResponse.json({ acceptedEventIds: [] });
  }

  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser();

  if (authError || !user?.email) {
    return NextResponse.json({ acceptedEventIds: [] });
  }

  let serviceClient;
  try {
    serviceClient = getServerServiceClient();
  } catch {
    return NextResponse.json({ acceptedEventIds: [] });
  }

  const { data: player } = await serviceClient
    .from("players")
    .select("player_id")
    .eq("email", user.email)
    .maybeSingle();

  if (!player) {
    return NextResponse.json({ acceptedEventIds: [] });
  }

  const { data: signups } = await serviceClient
    .from("signups_events")
    .select("event_id")
    .eq("player_id", player.player_id)
    .eq("status", "accepted");

  const acceptedEventIds = (signups ?? []).map((s) => s.event_id as number);

  return NextResponse.json({ acceptedEventIds });
}
