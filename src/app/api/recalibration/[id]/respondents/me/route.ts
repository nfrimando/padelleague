import { NextResponse } from "next/server";
import { getServerServiceClient } from "@/app/api/_lib/supabase";
import { getAuthorizedPlayer } from "@/app/api/recalibration/_lib/auth";

/**
 * PATCH /api/recalibration/[id]/respondents/me — a respondent edits their own notes
 * (and, for the legacy manual flow, optionally their rating). The structured survey
 * (respondents/me/survey) is now the source of the rating, so `rating` is optional
 * here; a notes-only update is allowed. Editable anytime before the parent request
 * leaves "pending".
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

  const ratingProvided = body.rating !== undefined && body.rating !== null;
  const rating =
    typeof body.rating === "number" && Number.isFinite(body.rating) && body.rating >= 0
      ? body.rating
      : null;
  if (ratingProvided && rating === null) {
    return NextResponse.json({ error: "rating must be a non-negative number." }, { status: 400 });
  }
  const notesProvided = body.notes !== undefined;
  const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;

  if (!ratingProvided && !notesProvided) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

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

  const updates: Record<string, unknown> = { updated_at: now };
  if (notesProvided) updates.notes = notes;
  if (ratingProvided) {
    updates.rating = rating;
    updates.submitted_at = now;
  }

  const { data: updated, error: updateError } = await serviceClient
    .from("recalibration_respondents")
    .update(updates)
    .eq("id", respondentRow.id)
    .select("id, recalibration_id, player_id, notes, submitted_at")
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ respondent: updated });
}
