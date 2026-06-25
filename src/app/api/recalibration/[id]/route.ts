import { NextResponse } from "next/server";
import { getServerServiceClient } from "@/app/api/_lib/supabase";
import { getAuthorizedPlayer } from "@/app/api/recalibration/_lib/auth";
import { fetchLatestRatingsByPlayerIds } from "@/lib/ratingLedger";
import { toRespondentSurveySummary, type SurveyState } from "@/lib/recalibration/survey";

/**
 * GET /api/recalibration/[id] — visible to admins and to players who've been added
 * as a respondent on this specific request. Response is role-shaped: a respondent
 * only ever sees their own respondent row, never other respondents' ratings/notes.
 */
export async function GET(
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

  const serviceClient = getServerServiceClient();

  const { data: recalRequest, error } = await serviceClient
    .from("recalibration_requests")
    .select(
      "id, player_id, status, outcome, rating_at_request, requestor_notes, computed_average, resolved_rating, admin_notes, requested_at, resolved_at",
    )
    .eq("id", requestId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!recalRequest) {
    return NextResponse.json({ error: "Recalibration request not found." }, { status: 404 });
  }

  const { data: myRespondentRow } = await serviceClient
    .from("recalibration_respondents")
    .select("id, recalibration_id, player_id, rating, notes, submitted_at, created_at, survey_answers")
    .eq("recalibration_id", requestId)
    .eq("player_id", auth.playerId)
    .maybeSingle();

  if (!auth.isAdmin && !myRespondentRow) {
    return NextResponse.json(
      { error: "You don't have access to this recalibration request." },
      { status: 403 },
    );
  }

  const [{ data: requestorPlayer }, latestRatingByPlayer] = await Promise.all([
    serviceClient
      .from("players")
      .select("player_id, name, nickname, image_link, initial_rating")
      .eq("player_id", recalRequest.player_id)
      .maybeSingle(),
    fetchLatestRatingsByPlayerIds(serviceClient, [recalRequest.player_id as number]),
  ]);

  // Respondents must never see any rating — not the calibratee's current/initial
  // rating, not their own derived rating, not the survey's audit numbers. They only
  // get enough of their own survey to know whether to start / resume / retake.
  if (!auth.isAdmin) {
    const { initial_rating: _initial, ...requestorPublic } = requestorPlayer ?? {};
    void _initial;
    const {
      rating_at_request: _rar,
      computed_average: _avg,
      resolved_rating: _resolved,
      ...requestPublic
    } = recalRequest;
    void _rar;
    void _avg;
    void _resolved;

    const survey = (myRespondentRow?.survey_answers as SurveyState | null) ?? null;
    const mySurvey = survey ? toRespondentSurveySummary(survey) : null;

    return NextResponse.json({
      role: "respondent",
      request: requestPublic,
      requestorPlayer: requestorPlayer ? requestorPublic : null,
      respondents: null,
      myRespondentRow: myRespondentRow
        ? {
            id: myRespondentRow.id,
            recalibration_id: myRespondentRow.recalibration_id,
            player_id: myRespondentRow.player_id,
            notes: myRespondentRow.notes,
            submitted_at: myRespondentRow.submitted_at,
            created_at: myRespondentRow.created_at,
            survey: mySurvey,
          }
        : null,
    });
  }

  const requestorPlayerWithRating = requestorPlayer
    ? {
        ...requestorPlayer,
        latest_rating: latestRatingByPlayer.get(String(recalRequest.player_id)) ?? null,
      }
    : null;

  const { data: respondents } = await serviceClient
    .from("recalibration_respondents")
    .select(
      "id, recalibration_id, player_id, rating, notes, submitted_at, created_at, survey_answers, player:players!player_id(player_id, name, nickname, image_link)",
    )
    .eq("recalibration_id", requestId)
    .order("created_at", { ascending: true });

  return NextResponse.json({
    role: "admin",
    request: recalRequest,
    requestorPlayer: requestorPlayerWithRating,
    respondents: respondents ?? [],
    myRespondentRow: myRespondentRow ?? null,
  });
}
