import { NextResponse } from "next/server";
import { getAuthorizedAdminClient } from "@/app/api/admin/_lib/auth";
import { notifyRecalibrationResolved } from "@/lib/email/notifications/recalibrationResolved";

/**
 * POST /api/recalibration/[id]/resolve — admin-only. Body: { outcome, admin_notes? }.
 * "updated" inserts a player_rating_events row with event_type 'recalibration'.
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

  let body: { outcome?: unknown; admin_notes?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (body.outcome !== "retained" && body.outcome !== "updated") {
    return NextResponse.json(
      { error: "outcome must be 'retained' or 'updated'." },
      { status: 400 },
    );
  }
  const outcome = body.outcome;
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

  const { data: respondentRows } = await supabase
    .from("recalibration_respondents")
    .select("rating")
    .eq("recalibration_id", requestId);

  const submittedRatings = (respondentRows ?? [])
    .map((r) => (r.rating == null ? null : Number(r.rating)))
    .filter((r): r is number => r != null && Number.isFinite(r));

  const computedAverage =
    submittedRatings.length > 0
      ? submittedRatings.reduce((sum, r) => sum + r, 0) / submittedRatings.length
      : null;

  const now = new Date().toISOString();
  const ratingAtRequest = Number(recalRequest.rating_at_request);
  const resolvedRating = outcome === "updated" ? computedAverage : null;

  if (outcome === "updated") {
    if (resolvedRating == null) {
      return NextResponse.json(
        {
          error:
            "Cannot accept a new rating without at least one submitted respondent rating.",
        },
        { status: 409 },
      );
    }

    const { error: ledgerError } = await supabase.from("player_rating_events").insert({
      player_id: recalRequest.player_id,
      event_type: "recalibration",
      rating_before: ratingAtRequest,
      rating_after: resolvedRating,
      rating_delta: resolvedRating - ratingAtRequest,
      source_type: "recalibration",
      source_id: String(recalRequest.id),
      occurred_at: now,
      metadata: { computed_average: computedAverage, respondent_count: submittedRatings.length },
    });

    if (ledgerError) {
      return NextResponse.json({ error: ledgerError.message }, { status: 500 });
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from("recalibration_requests")
    .update({
      status: "resolved",
      outcome,
      computed_average: computedAverage,
      resolved_rating: resolvedRating,
      admin_notes: adminNotes,
      resolved_at: now,
      resolved_by: auth.userId,
      updated_at: now,
    })
    .eq("id", requestId)
    .select(
      "id, player_id, status, outcome, computed_average, resolved_rating, admin_notes, resolved_at",
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
    outcome,
    oldRating: ratingAtRequest,
    newRating: resolvedRating,
    respondentCount: submittedRatings.length,
  }).catch((err) => console.error("[email] notifyRecalibrationResolved failed:", err));

  return NextResponse.json({ request: updated });
}
