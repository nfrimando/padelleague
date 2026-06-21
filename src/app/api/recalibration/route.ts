import { NextResponse } from "next/server";
import { getServerServiceClient } from "@/app/api/_lib/supabase";
import { getAuthorizedAdminClient } from "@/app/api/admin/_lib/auth";
import { getAuthorizedPlayer } from "@/app/api/recalibration/_lib/auth";
import { getRecalibrationCooldownStatus } from "@/app/api/recalibration/_lib/cooldown";
import { fetchLatestRatingsByPlayerIds } from "@/lib/ratingLedger";
import { notifyRecalibrationRequested } from "@/lib/email/notifications/recalibrationRequested";

/** GET /api/recalibration — admin-only list of pending recalibration requests */
export async function GET(request: Request) {
  const auth = await getAuthorizedAdminClient(request);
  if (!auth.ok) return auth.response;

  const { supabase } = auth;

  const { data: requests, error } = await supabase
    .from("recalibration_requests")
    .select(
      "id, player_id, requested_at, requestor_notes, player:players!player_id(player_id, name, nickname, image_link)",
    )
    .eq("status", "pending")
    .order("requested_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const pending = requests ?? [];
  if (pending.length === 0) {
    return NextResponse.json({ requests: [] });
  }

  const requestIds = pending.map((r) => r.id as number);

  const { data: respondentRows } = await supabase
    .from("recalibration_respondents")
    .select("recalibration_id, rating")
    .in("recalibration_id", requestIds);

  const statsMap = new Map<number, { respondent_count: number; rated_count: number }>();
  for (const row of respondentRows ?? []) {
    const id = row.recalibration_id as number;
    const existing = statsMap.get(id) ?? { respondent_count: 0, rated_count: 0 };
    existing.respondent_count += 1;
    if (row.rating !== null) existing.rated_count += 1;
    statsMap.set(id, existing);
  }

  const enriched = pending.map((r) => ({
    ...r,
    respondent_count: statsMap.get(r.id as number)?.respondent_count ?? 0,
    rated_count: statsMap.get(r.id as number)?.rated_count ?? 0,
  }));

  return NextResponse.json({ requests: enriched });
}

/** POST /api/recalibration — any linked player creates a recalibration request for themselves */
export async function POST(request: Request) {
  const auth = await getAuthorizedPlayer(request);
  if (!auth.ok) return auth.response;

  let body: { requestor_notes?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const requestorNotes =
    typeof body.requestor_notes === "string" && body.requestor_notes.trim()
      ? body.requestor_notes.trim()
      : null;

  const serviceClient = getServerServiceClient();

  const cooldown = await getRecalibrationCooldownStatus(serviceClient, auth.playerId);
  if (!cooldown.eligible) {
    return NextResponse.json(
      {
        error: "You can only request a recalibration every 3 months.",
        nextEligibleAt: cooldown.nextEligibleAt,
      },
      { status: 409 },
    );
  }

  const latestRatingByPlayer = await fetchLatestRatingsByPlayerIds(serviceClient, [auth.playerId]);
  const ratingAtRequest = latestRatingByPlayer.get(String(auth.playerId));

  if (ratingAtRequest == null) {
    return NextResponse.json(
      { error: "Could not resolve your current rating." },
      { status: 409 },
    );
  }

  const { data: inserted, error: insertError } = await serviceClient
    .from("recalibration_requests")
    .insert({
      player_id: auth.playerId,
      rating_at_request: ratingAtRequest,
      requestor_notes: requestorNotes,
    })
    .select("id, player_id, status, rating_at_request, requestor_notes, requested_at")
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const { data: player } = await serviceClient
    .from("players")
    .select("name, nickname")
    .eq("player_id", auth.playerId)
    .maybeSingle();

  await notifyRecalibrationRequested({
    requestId: inserted.id as number,
    playerName: (player?.name as string | null) ?? null,
    playerNickname: (player?.nickname as string | null) ?? null,
    currentRating: ratingAtRequest,
  }).catch((err) => console.error("[email] notifyRecalibrationRequested failed:", err));

  return NextResponse.json({ request: inserted }, { status: 201 });
}
