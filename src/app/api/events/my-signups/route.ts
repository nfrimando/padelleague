import { NextResponse } from "next/server";
import {
  getServerServiceClient,
  getServerUserClient,
} from "@/app/api/_lib/supabase";

/** GET /api/events/my-signups — accepted event IDs, plus events with a partner invite
 *  awaiting the caller's reply, for the signed-in user */
export async function GET(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json({ acceptedEventIds: [], pendingInviteEventIds: [] });
  }

  let userClient;
  try {
    userClient = getServerUserClient(authorization);
  } catch {
    return NextResponse.json({ acceptedEventIds: [], pendingInviteEventIds: [] });
  }

  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser();

  if (authError || !user?.email) {
    return NextResponse.json({ acceptedEventIds: [], pendingInviteEventIds: [] });
  }

  let serviceClient;
  try {
    serviceClient = getServerServiceClient();
  } catch {
    return NextResponse.json({ acceptedEventIds: [], pendingInviteEventIds: [] });
  }

  const { data: player } = await serviceClient
    .from("players")
    .select("player_id")
    .eq("email", user.email)
    .maybeSingle();

  if (!player) {
    return NextResponse.json({ acceptedEventIds: [], pendingInviteEventIds: [] });
  }

  const [{ data: signups }, { data: invites }] = await Promise.all([
    serviceClient
      .from("signups_events")
      .select("event_id")
      .eq("player_id", player.player_id)
      .eq("status", "accepted"),
    serviceClient
      .from("event_signup_pairs")
      .select("event_id")
      .eq("invitee_player_id", player.player_id)
      .eq("status", "pending"),
  ]);

  const acceptedEventIds = (signups ?? []).map((s) => s.event_id as number);
  const pendingInviteEventIds = [
    ...new Set((invites ?? []).map((i) => Number(i.event_id))),
  ];

  return NextResponse.json({ acceptedEventIds, pendingInviteEventIds });
}
