import { NextResponse } from "next/server";
import { getServerServiceClient } from "@/app/api/_lib/supabase";
import { resolveCallerPlayerId, isAdminUser } from "@/app/api/events/_lib/auth";
import { fetchLatestRatingsByPlayerIds } from "@/lib/ratingLedger";
import { loadPlayers, type PairRow, type PartnerPlayer } from "@/app/api/events/_lib/pairs";
import type { EventSignupStatus } from "@/lib/eventSignupStatus";
import type { PairPartnerView } from "@/lib/types";

type SignupPlayerRow = {
  id: string;
  player_id: number | null;
  status: EventSignupStatus;
  pair_id: string | null;
  looking_for_partner: boolean | null;
  player: {
    player_id: number;
    name: string | null;
    nickname: string | null;
    image_link: string | null;
  } | null;
};

/** Flatten a pair from one member's point of view. */
function toPartnerView(
  pair: PairRow,
  playerId: number,
  people: Map<number, PartnerPlayer>,
): PairPartnerView {
  const isInitiator = pair.initiator_player_id === playerId;
  const partnerId = isInitiator ? pair.invitee_player_id : pair.initiator_player_id;
  return {
    pair_id: pair.id,
    status: pair.status,
    role: isInitiator ? "initiator" : "invitee",
    partner: people.get(partnerId) ?? null,
  };
}

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
      "event_id, visibility, signup_list_visible, created_by_player_id, requires_payment, signup_mode, player_limit, deleted_at",
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

  const signupMode: "individual" | "paired" =
    event.signup_mode === "paired" ? "paired" : "individual";

  // Every live pair for the event — used for the viewer's own state, the manager's
  // pending-invite list and the pair counts.
  const { data: livePairRows } = await serviceClient
    .from("event_signup_pairs")
    .select(
      "id, event_id, initiator_player_id, invitee_player_id, status, responded_at, created_at",
    )
    .eq("event_id", eventId)
    .in("status", ["pending", "accepted"])
    .order("created_at", { ascending: false });

  const livePairs = (livePairRows ?? []) as PairRow[];
  const pairMembers = await loadPlayers(
    serviceClient,
    livePairs.flatMap((p) => [p.initiator_player_id, p.invitee_player_id]),
  );

  let viewerSignup: {
    id: string;
    status: EventSignupStatus;
    looking_for_partner: boolean;
    pair: PairPartnerView | null;
  } | null = null;
  let viewerIncomingInvite: PairPartnerView | null = null;

  if (playerId !== null) {
    const { data: viewerRow } = await serviceClient
      .from("signups_events")
      .select("id, status, pair_id, looking_for_partner")
      .eq("event_id", eventId)
      .eq("player_id", playerId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const viewerPair =
      livePairs.find(
        (p) =>
          p.initiator_player_id === playerId || p.invitee_player_id === playerId,
      ) ?? null;

    if (viewerRow) {
      viewerSignup = {
        id: viewerRow.id as string,
        status: viewerRow.status as EventSignupStatus,
        looking_for_partner: Boolean(viewerRow.looking_for_partner),
        pair: viewerPair ? toPartnerView(viewerPair, playerId, pairMembers) : null,
      };
    }

    // An invite the viewer must reply to. Reported separately from viewerSignup
    // because the invitee usually has no signup row of their own yet.
    const hasLiveSignup =
      viewerSignup !== null && viewerSignup.status !== "cancelled";
    if (
      viewerPair &&
      viewerPair.status === "pending" &&
      viewerPair.invitee_player_id === playerId &&
      !hasLiveSignup
    ) {
      viewerIncomingInvite = toPartnerView(viewerPair, playerId, pairMembers);
    }
  }

  const acceptedPairIds = new Set(
    livePairs.filter((p) => p.status === "accepted").map((p) => p.id),
  );
  const pendingInvites = livePairs
    .filter((p) => p.status === "pending")
    .map((p) => ({
      pair_id: p.id,
      initiator: pairMembers.get(p.initiator_player_id) ?? null,
      invitee: pairMembers.get(p.invitee_player_id) ?? null,
      created_at: p.created_at,
    }));

  if (canManage) {
    const { data: signupRows, error: signupsError } = await serviceClient
      .from("signups_events")
      .select(
        "id,player_id,status,pair_id,looking_for_partner,player:player_id(player_id,name,nickname,image_link)",
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

    const statusCounts: Record<EventSignupStatus, number> = {
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
      // A pair_id only counts once its pair is actually accepted.
      pair_id: row.pair_id && acceptedPairIds.has(row.pair_id) ? row.pair_id : null,
      looking_for_partner: Boolean(row.looking_for_partner),
      paid: paidSignupIds.has(row.id),
      name: row.player?.name ?? null,
      nickname: row.player?.nickname ?? null,
      image_link: row.player?.image_link ?? null,
      latest_rating:
        row.player_id != null
          ? latestRatingByPlayer.get(String(row.player_id)) ?? null
          : null,
    }));

    const acceptedSignups = signups.filter((s) => s.status === "accepted");
    const playersInPendingInvite = new Set(
      livePairs
        .filter((p) => p.status === "pending")
        .flatMap((p) => [p.initiator_player_id, p.invitee_player_id]),
    );

    const pairCounts = {
      accepted_pairs: acceptedPairIds.size,
      pending_invites: pendingInvites.length,
      // Someone waiting on an invite reply isn't in the unmatched pool.
      solo_looking: signups.filter(
        (s) =>
          s.status !== "cancelled" &&
          s.looking_for_partner &&
          s.pair_id === null &&
          (s.player_id == null || !playersInPendingInvite.has(s.player_id)),
      ).length,
    };

    const playerLimit = event.player_limit ?? null;

    return NextResponse.json({
      signupMode,
      signupListVisible: event.signup_list_visible,
      canManage: true,
      viewerSignup,
      viewerIncomingInvite,
      statusCounts,
      pairCounts,
      pendingInvites,
      capacity: {
        player_limit: playerLimit,
        accepted_players: acceptedSignups.length,
        accepted_pairs: new Set(
          acceptedSignups.map((s) => s.pair_id).filter((v): v is string => v != null),
        ).size,
        remaining:
          playerLimit != null ? Math.max(0, playerLimit - acceptedSignups.length) : null,
      },
      signups,
      roster: acceptedSignups.map((s) => ({
        player_id: s.player_id,
        name: s.name,
        nickname: s.nickname,
        image_link: s.image_link,
        latest_rating: s.latest_rating,
        pair_id: s.pair_id,
      })),
    });
  }

  if (!event.signup_list_visible) {
    return NextResponse.json({
      signupMode,
      signupListVisible: false,
      canManage: false,
      viewerSignup,
      viewerIncomingInvite,
      hidden: true,
      roster: [],
    });
  }

  const { data: acceptedRows, error: acceptedError } = await serviceClient
    .from("signups_events")
    .select("player_id,pair_id,player:player_id(player_id,name,nickname,image_link)")
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
    pair_id: row.pair_id && acceptedPairIds.has(row.pair_id) ? row.pair_id : null,
  }));

  return NextResponse.json({
    signupMode,
    signupListVisible: true,
    canManage: false,
    viewerSignup,
    viewerIncomingInvite,
    roster,
  });
}
