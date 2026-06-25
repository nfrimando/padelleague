import { NextResponse } from "next/server";
import { getAuthorizedAdminClient } from "@/app/api/admin/_lib/auth";
import { notifyRecalibrationResolved } from "@/lib/email/notifications/recalibrationResolved";

/**
 * POST /api/recalibration/[id]/cancel — admin-only. Body: { admin_notes? }.
 * Distinct from /resolve: available any time while pending (e.g. suspected
 * influence), writes no ledger row, and is excluded from the cooldown lookup.
 */
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

  let body: { admin_notes?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const adminNotes =
    typeof body.admin_notes === "string" && body.admin_notes.trim()
      ? body.admin_notes.trim()
      : null;

  const { data: recalRequest, error: fetchError } = await supabase
    .from("recalibration_requests")
    .select("id, player_id, status, rating_at_request")
    .eq("id", requestId)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!recalRequest) {
    return NextResponse.json({ error: "Recalibration request not found." }, { status: 404 });
  }
  if (recalRequest.status !== "pending") {
    return NextResponse.json(
      { error: "This request has already been resolved or cancelled." },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();

  const { data: updated, error: updateError } = await supabase
    .from("recalibration_requests")
    .update({
      status: "cancelled",
      admin_notes: adminNotes,
      resolved_at: now,
      resolved_by: auth.userId,
      updated_at: now,
    })
    .eq("id", requestId)
    .select(
      "id, player_id, status, outcome, rating_at_request, requestor_notes, computed_average, resolved_rating, admin_notes, requested_at, resolved_at",
    )
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const { data: player } = await supabase
    .from("players")
    .select("name, nickname")
    .eq("player_id", recalRequest.player_id)
    .maybeSingle();

  await notifyRecalibrationResolved({
    playerId: recalRequest.player_id as number,
    playerName: (player?.name as string | null) ?? null,
    playerNickname: (player?.nickname as string | null) ?? null,
    outcome: "cancelled",
    oldRating: Number(recalRequest.rating_at_request),
    newRating: null,
    respondentCount: 0, // unused by the "cancelled" email template
  }).catch((err) => console.error("[email] notifyRecalibrationResolved failed:", err));

  return NextResponse.json({ request: updated });
}
