import { NextResponse } from "next/server";
import { getAuthorizedAdminClient } from "@/app/api/admin/_lib/auth";
import { notifyRecalibrationCalibratorAdded } from "@/lib/email/notifications/recalibrationCalibratorAdded";

/** POST /api/recalibration/[id]/respondents — admin-only "Add Calibrator". Body: { player_id }. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthorizedAdminClient(request);
  if (!auth.ok) return auth.response;

  const { supabase } = auth;
  const { id } = await params;
  const requestId = Number(id);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    return NextResponse.json({ error: "Invalid request id." }, { status: 400 });
  }

  let body: { player_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const playerId =
    typeof body.player_id === "number" && Number.isFinite(body.player_id)
      ? body.player_id
      : null;
  if (!playerId) {
    return NextResponse.json({ error: "player_id is required." }, { status: 400 });
  }

  const { data: recalRequest } = await supabase
    .from("recalibration_requests")
    .select("id, player_id, status, rating_at_request")
    .eq("id", requestId)
    .maybeSingle();

  if (!recalRequest) {
    return NextResponse.json({ error: "Recalibration request not found." }, { status: 404 });
  }
  if (recalRequest.status !== "pending") {
    return NextResponse.json({ error: "This request is no longer pending." }, { status: 409 });
  }
  if (playerId === recalRequest.player_id) {
    return NextResponse.json(
      { error: "The requestor cannot be added as their own respondent." },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("recalibration_respondents")
    .insert({
      recalibration_id: requestId,
      player_id: playerId,
      added_by: auth.userId,
    })
    .select(
      "id, recalibration_id, player_id, rating, notes, submitted_at, created_at, player:players!player_id(player_id, name, nickname, image_link)",
    )
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "This player has already been added as a respondent." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: requestorPlayer } = await supabase
    .from("players")
    .select("name, nickname")
    .eq("player_id", recalRequest.player_id)
    .maybeSingle();

  await notifyRecalibrationCalibratorAdded({
    calibratorPlayerId: playerId,
    requestId,
    requestorName: (requestorPlayer?.name as string | null) ?? null,
    requestorNickname: (requestorPlayer?.nickname as string | null) ?? null,
    ratingAtRequest: recalRequest.rating_at_request as number,
  }).catch((err) =>
    console.error(
      `[email] notifyRecalibrationCalibratorAdded failed for player_id=${playerId}:`,
      err,
    ),
  );

  return NextResponse.json({ respondent: data }, { status: 201 });
}
