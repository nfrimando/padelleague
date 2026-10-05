// Comparison-based recalibration survey — the pure, server-owned logic that turns
// a series of head-to-head comparisons ("is the calibratee better than, about the
// same as, or worse than player X?") into a single derived rating.
//
// It is a binary search over a rating bracket [lo, hi]: "better" raises lo to the
// opponent's rating, "worse" lowers hi, "about the same" narrows to the opponent's
// rating ± SAME_BAND. Each next opponent is the one nearest the bracket midpoint. Two
// guards keep a single careless answer from poisoning the result: an answer that
// contradicts the bracket undoes the cut it contradicts, and once the bracket closes we
// ask one opponent just outside each edge to confirm it.
//
// The client never runs any of this and never sees a rating: the server picks each
// next opponent (selectNextAnchor), records the answer, and derives the final value
// (deriveRating) once there is no one left to ask. The full trail is persisted to
// recalibration_respondents.survey_answers as an audit record.

import { ratingGapForWinProbability } from "@/lib/ratings/v3/calculate";

export const SURVEY_VERSION = 2 as const;

// "About the same" = the stronger player would win no more than this share of matches.
export const SAME_WIN_PROB = 0.6;
// Rating gap matching SAME_WIN_PROB on the v3 EWP curve (≈ 0.47). Used both as the
// half-width of an "about the same" answer and as the bracket width that counts as closed.
export const SAME_BAND = ratingGapForWinProbability(SAME_WIN_PROB);
export const MAX_QUESTIONS = 10; // players shown per rater, including "don't know"
export const DERIVED_MARGIN = 0.5; // headroom beyond the pool's ends for the bracket

/** v1 magnitude choices — no longer offered, but kept so stored surveys still read. */
export type LegacySurveyChoice =
  | "significantly_better"
  | "slightly_better"
  | "slightly_worse"
  | "significantly_worse";

export type SurveyChoice = "better" | "relatively_same" | "worse" | "dont_know" | LegacySurveyChoice;

/** Choices the API accepts. */
export const SURVEY_CHOICES: SurveyChoice[] = ["better", "relatively_same", "worse", "dont_know"];

export type SurveyQuestion = {
  order: number;
  anchorPlayerId: number;
  anchorPlayerName: string | null;
  anchorPlayerNickname: string | null;
  anchorPlayerImage: string | null;
  anchorRating: number; // audit-only; never sent to the responding player
  choice: SurveyChoice | null; // null while pending
  impliedRating: number | null; // running estimate after this answer; null for dont_know / pending
  askedAt: string;
  answeredAt: string | null;
};

export type SurveyState = {
  version: 1 | typeof SURVEY_VERSION;
  status: "in_progress" | "complete";
  startedAt: string;
  completedAt: string | null;
  questions: SurveyQuestion[];
  derivedRating: number | null;
  confidence: number | null;
};

export type AnchorPoolPlayer = {
  player_id: number;
  name: string | null;
  nickname: string | null;
  image_link: string | null;
  rating: number;
};

export type Bracket = { lo: number; hi: number };

/** +1 = calibratee is better, -1 = worse, 0 = about the same, null = no signal. */
export function choiceDirection(choice: SurveyChoice): 1 | 0 | -1 | null {
  switch (choice) {
    case "better":
    case "slightly_better":
    case "significantly_better":
      return 1;
    case "relatively_same":
      return 0;
    case "worse":
    case "slightly_worse":
    case "significantly_worse":
      return -1;
    case "dont_know":
      return null;
  }
}

function isRealAnswer(q: SurveyQuestion): boolean {
  return q.choice !== null && choiceDirection(q.choice) !== null;
}

/** Number of answered, non-"don't know" questions. */
export function realAnswerCount(questions: SurveyQuestion[]): number {
  return questions.filter(isRealAnswer).length;
}

/** Lowest and highest rating in a pool sorted ascending by rating. */
export function poolBounds(poolSortedAsc: AnchorPoolPlayer[]): { poolMin: number; poolMax: number } {
  return {
    poolMin: poolSortedAsc[0]?.rating ?? 0,
    poolMax: poolSortedAsc[poolSortedAsc.length - 1]?.rating ?? 0,
  };
}

/**
 * Replay the answers into a bracket. Each cut is stacked per side; an answer that
 * contradicts the bracket (e.g. "worse" than someone at or below lo) pops the cuts it
 * contradicts and is itself ignored, since we can't tell which of the two was wrong.
 */
export function computeBracket(
  questions: SurveyQuestion[],
  poolMin: number,
  poolMax: number,
): Bracket {
  const los = [Math.max(0, poolMin - DERIVED_MARGIN)];
  const his = [poolMax + DERIVED_MARGIN];
  const top = (stack: number[]) => stack[stack.length - 1];

  for (const q of questions) {
    if (q.choice === null) continue;
    const dir = choiceDirection(q.choice);
    if (dir === null) continue;
    const a = q.anchorRating;
    // The range this answer alone says the calibratee is in.
    const low = dir > 0 ? a : dir < 0 ? -Infinity : a - SAME_BAND;
    const high = dir < 0 ? a : dir > 0 ? Infinity : a + SAME_BAND;

    if (low >= top(his)) {
      while (his.length > 1 && top(his) <= low) his.pop();
      continue;
    }
    if (high <= top(los)) {
      while (los.length > 1 && top(los) >= high) los.pop();
      continue;
    }
    if (low > top(los)) los.push(low);
    if (high < top(his)) his.push(high);
  }

  return { lo: top(los), hi: top(his) };
}

/** Bracket midpoint after the given answers — the running estimate. */
export function runningEstimate(questions: SurveyQuestion[], poolMin: number, poolMax: number): number {
  const { lo, hi } = computeBracket(questions, poolMin, poolMax);
  return Math.round(((lo + hi) / 2) * 100) / 100;
}

function nearest(candidates: AnchorPoolPlayer[], target: number): AnchorPoolPlayer | null {
  let best: AnchorPoolPlayer | null = null;
  let bestDist = Infinity;
  for (const candidate of candidates) {
    const dist = Math.abs(candidate.rating - target);
    if (dist < bestDist) {
      best = candidate;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * Confirmation opponent just outside one edge of the bracket: walking outward from the
 * edge (skipping players the rater didn't know), the first player found. Returns null
 * when that player was already answered — the edge is confirmed — or nobody is there.
 */
function confirmationAnchor(
  poolSortedAsc: AnchorPoolPlayer[],
  questions: SurveyQuestion[],
  edge: number,
  side: "below" | "above",
): AnchorPoolPlayer | null {
  const choiceById = new Map(questions.map((q) => [q.anchorPlayerId, q.choice]));
  const outside =
    side === "below"
      ? poolSortedAsc.filter((p) => p.rating < edge).reverse()
      : poolSortedAsc.filter((p) => p.rating > edge);
  for (const candidate of outside) {
    if (!choiceById.has(candidate.player_id)) return candidate;
    if (choiceById.get(candidate.player_id) === "dont_know") continue;
    return null;
  }
  return null;
}

/**
 * Pick the next opponent, or null when the survey should end (cap reached, bracket
 * closed and confirmed, or no one left to ask). Before any real answer: the unasked
 * player nearest the seed (the calibratee's current rating, or mid-pool for recruits).
 * While the bracket is open: the unasked player nearest its midpoint. Once closed: one
 * confirmation opponent below lo, then one above hi.
 */
export function selectNextAnchor(
  poolSortedAsc: AnchorPoolPlayer[],
  questions: SurveyQuestion[],
  seedRating: number,
): AnchorPoolPlayer | null {
  if (questions.length >= MAX_QUESTIONS) return null;
  const askedIds = new Set(questions.map((q) => q.anchorPlayerId));
  const unasked = poolSortedAsc.filter((p) => !askedIds.has(p.player_id));
  if (unasked.length === 0) return null;
  if (realAnswerCount(questions) === 0) return nearest(unasked, seedRating);

  const { poolMin, poolMax } = poolBounds(poolSortedAsc);
  const { lo, hi } = computeBracket(questions, poolMin, poolMax);
  const inside = unasked.filter((p) => p.rating > lo && p.rating < hi);
  if (hi - lo > SAME_BAND && inside.length > 0) return nearest(inside, (lo + hi) / 2);

  return (
    confirmationAnchor(poolSortedAsc, questions, lo, "below") ??
    confirmationAnchor(poolSortedAsc, questions, hi, "above")
  );
}

/**
 * Final rating: the bracket midpoint, clamped to the rating scale and rounded to 2 dp.
 * Confidence is 1 minus half the bracket width (a 2.0-wide bracket => zero). Returns
 * null when there are no real answers to derive from.
 */
export function deriveRating(
  questions: SurveyQuestion[],
  poolSortedAsc: AnchorPoolPlayer[],
): { derivedRating: number; confidence: number } | null {
  if (realAnswerCount(questions) === 0) return null;
  const { poolMin, poolMax } = poolBounds(poolSortedAsc);
  const { lo, hi } = computeBracket(questions, poolMin, poolMax);
  const clamped = Math.min(Math.max(0, (lo + hi) / 2), poolMax + DERIVED_MARGIN);
  const derivedRating = Math.round(clamped * 100) / 100;
  const confidence = Math.round(Math.min(1, Math.max(0, 1 - (hi - lo) / 2)) * 100) / 100;
  return { derivedRating, confidence };
}

export function createSurveyState(now: string): SurveyState {
  return {
    version: SURVEY_VERSION,
    status: "in_progress",
    startedAt: now,
    completedAt: null,
    questions: [],
    derivedRating: null,
    confidence: null,
  };
}

/** The single unanswered question at the tail, if any. */
export function pendingQuestion(state: SurveyState): SurveyQuestion | null {
  const last = state.questions[state.questions.length - 1];
  return last && last.choice === null ? last : null;
}

/** The opponent fields safe to send to the responding player (never a rating). */
export type PublicAnchorPlayer = {
  player_id: number;
  name: string | null;
  nickname: string | null;
  image_link: string | null;
};

export function questionToPublicAnchor(question: SurveyQuestion): PublicAnchorPlayer {
  return {
    player_id: question.anchorPlayerId,
    name: question.anchorPlayerName,
    nickname: question.anchorPlayerNickname,
    image_link: question.anchorPlayerImage,
  };
}

/** What the responding player may see about their own survey — status + counts only. */
export type RespondentSurveySummary = {
  status: SurveyState["status"];
  answeredCount: number;
};

export function toRespondentSurveySummary(state: SurveyState): RespondentSurveySummary {
  return { status: state.status, answeredCount: realAnswerCount(state.questions) };
}

/** Counts for the rater-facing recap (no rating numbers). */
export function summarizeChoices(
  state: SurveyState,
): { better: number; worse: number; same: number; total: number } {
  let better = 0;
  let worse = 0;
  let same = 0;
  for (const q of state.questions) {
    if (q.choice === null) continue;
    const dir = choiceDirection(q.choice);
    if (dir === 1) better += 1;
    else if (dir === -1) worse += 1;
    else if (dir === 0) same += 1;
  }
  return { better, worse, same, total: better + worse + same };
}
