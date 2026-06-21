import { NextResponse } from "next/server";
import { getServerServiceClient } from "@/app/api/_lib/supabase";
import { getAuthorizedPlayer } from "@/app/api/recalibration/_lib/auth";

/**
 * PATCH /api/recalibration/[id]/respondents/me — a respondent submits or edits
 * their own rating+notes. Body: { rating, notes? }. Editable anytime before the
 * parent request leaves "pending".
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthorizedPlayer(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const requestId = Number(id);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    return NextResponse.json({ error: "Invalid request id." }, { status: 400 });
  }

  let body: { rating?: unknown; notes?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const rating =
    typeof body.rating === "number" && Number.isFinite(body.rating) && body.rating >= 0
      ? body.rating
      : null;
  if (rating === null) {
    return NextResponse.json({ error: "rating (non-negative number) is required." }, { status: 400 });
  }
  const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;

  const serviceClient = getServerServiceClient();

  const { data: recalRequest } = await serviceClient
    .from("recalibration_requests")
    .select("id, status")
    .eq("id", requestId)
    .maybeSingle();

  if (!recalRequest) {
    return NextResponse.json({ error: "Recalibration request not found." }, { status: 404 });
  }
  if (recalRequest.status !== "pending") {
    return NextResponse.json({ error: "This request is no longer open for input." }, { status: 409 });
  }

  const { data: respondentRow } = await serviceClient
    .from("recalibration_respondents")
    .select("id")
    .eq("recalibration_id", requestId)
    .eq("player_id", auth.playerId)
    .maybeSingle();

  if (!respondentRow) {
    return NextResponse.json(
      { error: "You haven't been added as a respondent for this request." },
      { status: 403 },
    );
  }

  const now = new Date().toISOString();

  const { data: updated, error: updateError } = await serviceClient
    .from("recalibration_respondents")
    .update({ rating, notes, submitted_at: now, updated_at: now })
    .eq("id", respondentRow.id)
    .select("id, recalibration_id, player_id, rating, notes, submitted_at")
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ respondent: updated });
}
