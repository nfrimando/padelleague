import { NextResponse } from "next/server";
import { getServerServiceClient } from "@/app/api/_lib/supabase";
import { getAuthorizedPlayer } from "@/app/api/recruit/_lib/auth";
import { buildAnchorPool } from "@/app/api/recalibration/_lib/pool";
import {
  MIN_ANSWERS,
  SURVEY_CHOICES,
  answeredImpliedRatings,
  createSurveyState,
  deriveRating,
  impliedRating,
  pendingQuestion,
  questionToPublicAnchor,
  selectNextAnchor,
  shouldStop,
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
  const poolMax = pool[pool.length - 1].rating;
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
    if (state && state.status === "in_progress") {
      const pending = pendingQuestion(state);
      if (pending) return questionResponse(state, pending);
    } else {
      state = createSurveyState(now);
    }
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
  pending.impliedRating = impliedRating(pending.anchorRating, choice as SurveyChoice);
  pending.answeredAt = now;

  const answered = answeredImpliedRatings(state);
  const askedIds = new Set(state.questions.map((q) => q.anchorPlayerId));
  const poolRemaining = pool.filter((p) => !askedIds.has(p.player_id)).length;

  if (shouldStop(answered, poolRemaining)) {
    const { derivedRating, confidence } = deriveRating(answered, poolMax);
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

  const next = appendNextQuestion(state, pool, seed, now);
  if (!next) {
    // Ran out of opponents without a usable answer (e.g. everyone marked "don't know").
    await persist(state);
    return NextResponse.json(
      {
        error:
          "We've run out of players to compare. Restart and rate the players you do recognize.",
      },
      { status: 409 },
    );
  }
  await persist(state);
  return questionResponse(state, next);
}

/** Append the next pending question for the running estimate; null if pool exhausted. */
function appendNextQuestion(
  state: SurveyState,
  pool: AnchorPoolPlayer[],
  seed: number,
  now: string,
): SurveyQuestion | null {
  const askedIds = new Set(state.questions.map((q) => q.anchorPlayerId));
  const answered = answeredImpliedRatings(state);
  const anchor = selectNextAnchor(pool, askedIds, answered, seed);
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
    answeredCount: answeredImpliedRatings(state).length,
    softTarget: MIN_ANSWERS,
  });
}
