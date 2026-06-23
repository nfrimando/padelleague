import { NextResponse } from "next/server";
import { getServerServiceClient } from "@/app/api/_lib/supabase";
import { resolveCallerPlayerId, isAdminUser } from "@/app/api/events/_lib/auth";
import { fetchLatestRatingsByPlayerIds } from "@/lib/ratingLedger";

type SignupStatus =
  | "applied"
  | "pending_payment"
  | "accepted"
  | "waitlisted"
  | "cancelled";

type SignupPlayerRow = {
  id: string;
  player_id: number | null;
  status: SignupStatus;
  player: {
    player_id: number;
    name: string | null;
    nickname: string | null;
    image_link: string | null;
  } | null;
};

/** GET /api/events/[id]/signups — roster (public/creator/admin) + viewer's own signup status */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const eventId = parseInt(id, 10);
  if (isNaN(eventId)) {
    return NextResponse.json({ error: "Invalid event ID." }, { status: 400 });
  }

  const serviceClient = getServerServiceClient();

  const { data: event, error: eventError } = await serviceClient
    .from("events")
    .select(
      "event_id, visibility, signup_list_visible, created_by_player_id, requires_payment, deleted_at",
    )
    .eq("event_id", eventId)
    .is("deleted_at", null)
    .maybeSingle();

  if (eventError) {
    return NextResponse.json({ error: eventError.message }, { status: 500 });
  }
  if (!event) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }

  const authorization = request.headers.get("authorization");
  const [playerId, adminFlag] = await Promise.all([
    resolveCallerPlayerId(authorization),
    isAdminUser(authorization),
  ]);

  const canManage =
    adminFlag || (playerId !== null && playerId === event.created_by_player_id);

  if (event.visibility === "draft" && !canManage) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }

  let viewerSignup: { id: string; status: SignupStatus } | null = null;
  if (playerId !== null) {
    const { data: viewerRow } = await serviceClient
      .from("signups_events")
      .select("id, status")
      .eq("event_id", eventId)
      .eq("player_id", playerId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (viewerRow)
      viewerSignup = { id: viewerRow.id as string, status: viewerRow.status as SignupStatus };
  }

  if (canManage) {
    const { data: signupRows, error: signupsError } = await serviceClient
      .from("signups_events")
      .select(
        "id,player_id,status,player:player_id(player_id,name,nickname,image_link)",
      )
      .eq("event_id", eventId)
      .order("created_at", { ascending: false });

    if (signupsError) {
      return NextResponse.json({ error: signupsError.message }, { status: 500 });
    }

    const rows = (signupRows ?? []) as unknown as SignupPlayerRow[];

    let paidSignupIds = new Set<string>();
    if (event.requires_payment) {
      const { data: paidPayments } = await serviceClient
        .from("payments")
        .select("signup_id")
        .eq("event_id", eventId)
        .eq("status", "paid");
      paidSignupIds = new Set((paidPayments ?? []).map((p) => p.signup_id as string));
    }

    const statusCounts: Record<SignupStatus, number> = {
      applied: 0,
      pending_payment: 0,
      accepted: 0,
      waitlisted: 0,
      cancelled: 0,
    };
    for (const row of rows) statusCounts[row.status]++;

    const latestRatingByPlayer = await fetchLatestRatingsByPlayerIds(
      serviceClient,
      rows.map((row) => row.player_id).filter((id): id is number => id != null),
    );

    const signups = rows.map((row) => ({
      id: row.id,
      player_id: row.player_id,
      status: row.status,
      paid: paidSignupIds.has(row.id),
      name: row.player?.name ?? null,
      nickname: row.player?.nickname ?? null,
      image_link: row.player?.image_link ?? null,
      latest_rating:
        row.player_id != null
          ? latestRatingByPlayer.get(String(row.player_id)) ?? null
          : null,
    }));

    return NextResponse.json({
      signupListVisible: event.signup_list_visible,
      canManage: true,
      viewerSignup,
      statusCounts,
      signups,
      roster: signups
        .filter((s) => s.status === "accepted")
        .map((s) => ({
          player_id: s.player_id,
          name: s.name,
          nickname: s.nickname,
          image_link: s.image_link,
          latest_rating: s.latest_rating,
        })),
    });
  }

  if (!event.signup_list_visible) {
    return NextResponse.json({
      signupListVisible: false,
      canManage: false,
      viewerSignup,
      hidden: true,
      roster: [],
    });
  }

  const { data: acceptedRows, error: acceptedError } = await serviceClient
    .from("signups_events")
    .select("player_id,player:player_id(player_id,name,nickname,image_link)")
    .eq("event_id", eventId)
    .eq("status", "accepted");

  if (acceptedError) {
    return NextResponse.json({ error: acceptedError.message }, { status: 500 });
  }

  const acceptedPlayerRows = (acceptedRows ?? []) as unknown as SignupPlayerRow[];
  const latestRatingByPlayer = await fetchLatestRatingsByPlayerIds(
    serviceClient,
    acceptedPlayerRows.map((row) => row.player_id).filter((id): id is number => id != null),
  );

  const roster = acceptedPlayerRows.map((row) => ({
    player_id: row.player_id,
    name: row.player?.name ?? null,
    nickname: row.player?.nickname ?? null,
    image_link: row.player?.image_link ?? null,
    latest_rating:
      row.player_id != null
        ? latestRatingByPlayer.get(String(row.player_id)) ?? null
        : null,
  }));

  return NextResponse.json({
    signupListVisible: true,
    canManage: false,
    viewerSignup,
    roster,
  });
}
