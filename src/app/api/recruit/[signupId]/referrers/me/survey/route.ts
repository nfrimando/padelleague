import { NextResponse } from "next/server";
import { getServerServiceClient } from "@/app/api/_lib/supabase";
import { getAuthorizedPlayer } from "@/app/api/recruit/_lib/auth";
import { buildAnchorPool } from "@/app/api/recalibration/_lib/pool";
import {
  MAX_QUESTIONS,
  SURVEY_CHOICES,
  choiceDirection,
  createSurveyState,
  deriveRating,
  pendingQuestion,
  poolBounds,
  questionToPublicAnchor,
  runningEstimate,
  selectNextAnchor,
  summarizeChoices,
  type AnchorPoolPlayer,
  type SurveyChoice,
  type SurveyQuestion,
  type SurveyState,
} from "@/lib/recalibration/survey";

/**
 * POST /api/recruit/[signupId]/referrers/me/survey
 *
 * Drives the comparison-based recruit assessment for the calling referrer, reusing the
 * recalibration survey engine. The applicant is the subject "being rated"; each question
 * compares them against another rated player. The server owns all rating logic and never
 * returns any rating to the client.
 *
 * Body:
 *   { action: "start" }                              — resume an in-progress survey, or
 *                                                       (re)start a fresh one
 *   { action: "answer", anchorPlayerId, choice }     — record the answer to the pending
 *                                                       question and advance / finish
 *
 * Returns { done: false, question: { anchorPlayer } } while more comparisons are needed,
 * or { done: true, recap } once the rating has been derived and written to the referrer's
 * signups_players_referrers.initial_rating.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ signupId: string }> },
) {
  const auth = await getAuthorizedPlayer(request);
  if (!auth.ok) return auth.response;

  const { signupId } = await params;

  let body: { action?: unknown; anchorPlayerId?: unknown; choice?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const action = body.action;
  if (action !== "start" && action !== "answer") {
    return NextResponse.json({ error: "action must be 'start' or 'answer'." }, { status: 400 });
  }

  const serviceClient = getServerServiceClient();

  const { data: signup } = await serviceClient
    .from("signups_players")
    .select("id, status")
    .eq("id", signupId)
    .maybeSingle();

  if (!signup) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }
  if (signup.status === "accepted" || signup.status === "cancelled") {
    return NextResponse.json(
      { error: "This application is no longer open for input." },
      { status: 409 },
    );
  }

  const { data: referrerRow } = await serviceClient
    .from("signups_players_referrers")
    .select("id, survey_answers")
    .eq("signup_id", signupId)
    .eq("referrer_player_id", auth.playerId)
    .maybeSingle();

  if (!referrerRow) {
    return NextResponse.json(
      { error: "You haven't been added as a referrer for this application." },
      { status: 403 },
    );
  }

  // The applicant is not a player row, so nothing needs excluding for them; excluding the
  // referrer's own id keeps them from being asked to compare the applicant to themselves.
  const pool = await buildAnchorPool(serviceClient, auth.playerId);
  if (pool.length === 0) {
    return NextResponse.json(
      { error: "Not enough rated players are available to run a comparison survey yet." },
      { status: 409 },
    );
  }
  const { poolMin, poolMax } = poolBounds(pool);
  const seed = poolMax / 2; // applicant has no prior rating; start in the middle

  let state = (referrerRow.survey_answers as SurveyState | null) ?? null;
  const now = new Date().toISOString();

  async function persist(next: SurveyState) {
    await serviceClient
      .from("signups_players_referrers")
      .update({ survey_answers: next, updated_at: now })
      .eq("id", referrerRow!.id);
  }

  if (action === "start") {
    // Resume a pending question; otherwise start fresh (including after a run where
    // every player shown was marked "don't know").
    const resumable = state?.status === "in_progress" ? pendingQuestion(state) : null;
    if (state && resumable) return questionResponse(state, resumable);
    state = createSurveyState(now);
    const next = appendNextQuestion(state, pool, seed, now);
    if (!next) {
      return NextResponse.json(
        { error: "Not enough rated players are available to run a comparison survey yet." },
        { status: 409 },
      );
    }
    await persist(state);
    return questionResponse(state, next);
  }

  // action === "answer"
  if (!state || state.status !== "in_progress") {
    return NextResponse.json(
      { error: "No survey in progress. Start the assessment first." },
      { status: 409 },
    );
  }
  const pending = pendingQuestion(state);
  if (!pending) {
    return NextResponse.json({ error: "No pending question to answer." }, { status: 409 });
  }

  const choice = body.choice;
  if (typeof choice !== "string" || !SURVEY_CHOICES.includes(choice as SurveyChoice)) {
    return NextResponse.json({ error: "Invalid choice." }, { status: 400 });
  }
  const anchorPlayerId = Number(body.anchorPlayerId);
  if (anchorPlayerId !== pending.anchorPlayerId) {
    return NextResponse.json(
      { error: "This question is out of date. Reload and continue." },
      { status: 409 },
    );
  }

  pending.choice = choice as SurveyChoice;
  pending.impliedRating =
    choiceDirection(pending.choice) === null
      ? null
      : runningEstimate(state.questions, poolMin, poolMax);
  pending.answeredAt = now;

  const next = appendNextQuestion(state, pool, seed, now);
  if (!next) {
    const result = deriveRating(state.questions, pool);
    if (!result) {
      // Every player shown was marked "don't know" — nothing to derive from.
      await persist(state);
      return NextResponse.json(
        {
          error:
            "You didn't recognize enough of these players to give an assessment. Restart to try again.",
        },
        { status: 409 },
      );
    }
    const { derivedRating, confidence } = result;
    state.status = "complete";
    state.completedAt = now;
    state.derivedRating = derivedRating;
    state.confidence = confidence;
    await serviceClient
      .from("signups_players_referrers")
      .update({
        survey_answers: state,
        initial_rating: derivedRating,
        submitted_by_player_id: auth.playerId,
        updated_at: now,
      })
      .eq("id", referrerRow.id);
    return NextResponse.json({ done: true, recap: summarizeChoices(state) });
  }

  await persist(state);
  return questionResponse(state, next);
}

/** Append the next pending question; null when the survey should end. */
function appendNextQuestion(
  state: SurveyState,
  pool: AnchorPoolPlayer[],
  seed: number,
  now: string,
): SurveyQuestion | null {
  const anchor = selectNextAnchor(pool, state.questions, seed);
  if (!anchor) return null;
  const question: SurveyQuestion = {
    order: state.questions.length + 1,
    anchorPlayerId: anchor.player_id,
    anchorPlayerName: anchor.name,
    anchorPlayerNickname: anchor.nickname,
    anchorPlayerImage: anchor.image_link,
    anchorRating: anchor.rating,
    choice: null,
    impliedRating: null,
    askedAt: now,
    answeredAt: null,
  };
  state.questions.push(question);
  return question;
}

function questionResponse(state: SurveyState, question: SurveyQuestion) {
  return NextResponse.json({
    done: false,
    question: { anchorPlayer: questionToPublicAnchor(question) },
    questionNumber: state.questions.length,
    maxQuestions: MAX_QUESTIONS,
  });
}
