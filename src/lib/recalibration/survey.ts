// Comparison-based recalibration survey — the pure, server-owned logic that turns
// a series of head-to-head comparisons ("is the calibratee significantly/slightly
// better/worse than player X?") into a single derived rating.
//
// The client never runs any of this and never sees a rating: the server picks each
// next opponent (selectNextAnchor), records the answer, decides when to stop
// (shouldStop), and derives the final value (deriveRating). The full trail is
// persisted to recalibration_respondents.survey_answers as an audit record.
//
// Tunables are calibrated to the app's 0–10 rating scale, where ~0.5 is a
// "significant" gap and ~1.0 ≈ two skill levels (see src/lib/ratings/v3/calculate.ts).

export const SURVEY_VERSION = 1 as const;

export const DELTA_SLIGHT = 0.25; // "slightly better/worse" offset from the opponent
export const DELTA_SIGNIFICANT = 0.75; // "significantly better/worse" offset
export const MIN_ANSWERS = 5; // real answers (excludes "don't know") before we may stop
export const MAX_ANSWERS = 9; // hard cap on real answers
export const CONVERGE_WINDOW = 3; // inspect the last N implied ratings...
export const CONVERGE_SPREAD = 0.3; // ...stop once their (max - min) <= this
export const MAX_QUESTIONS = 14; // absolute cap incl. "don't know", guards against loops
export const DERIVED_MARGIN = 0.5; // headroom above the pool max when clamping the result

export type SurveyChoice =
  | "significantly_better"
  | "slightly_better"
  | "slightly_worse"
  | "significantly_worse"
  | "dont_know";

export const SURVEY_CHOICES: SurveyChoice[] = [
  "significantly_better",
  "slightly_better",
  "slightly_worse",
  "significantly_worse",
  "dont_know",
];

export type SurveyQuestion = {
  order: number;
  anchorPlayerId: number;
  anchorPlayerName: string | null;
  anchorPlayerNickname: string | null;
  anchorPlayerImage: string | null;
  anchorRating: number; // audit-only; never sent to the responding player
  choice: SurveyChoice | null; // null while pending
  impliedRating: number | null; // null for dont_know / pending
  askedAt: string;
  answeredAt: string | null;
};

export type SurveyState = {
  version: typeof SURVEY_VERSION;
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

/** Signed offset applied to the opponent's rating, or null for "don't know". */
export function choiceToOffset(choice: SurveyChoice): number | null {
  switch (choice) {
    case "significantly_better":
      return DELTA_SIGNIFICANT;
    case "slightly_better":
      return DELTA_SLIGHT;
    case "slightly_worse":
      return -DELTA_SLIGHT;
    case "significantly_worse":
      return -DELTA_SIGNIFICANT;
    case "dont_know":
      return null;
  }
}

/** Implied calibratee rating from one comparison, clamped to >= 0. null = no signal. */
export function impliedRating(anchorRating: number, choice: SurveyChoice): number | null {
  const offset = choiceToOffset(choice);
  if (offset === null) return null;
  return Math.max(0, anchorRating + offset);
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Implied ratings of every answered, non-"don't know" question, in ask order. */
export function answeredImpliedRatings(state: SurveyState): number[] {
  return state.questions
    .filter((q) => q.choice !== null && q.impliedRating !== null)
    .map((q) => q.impliedRating as number);
}

/**
 * Pick the next opponent: the not-yet-asked pool player whose rating is closest to
 * the running estimate (median of implied ratings so far, or the seed rating — the
 * calibratee's current rating — before any answers). Returns null if exhausted.
 */
export function selectNextAnchor(
  poolSortedAsc: AnchorPoolPlayer[],
  askedIds: Set<number>,
  answered: number[],
  seedRating: number,
): AnchorPoolPlayer | null {
  const estimate = answered.length > 0 ? (median(answered) as number) : seedRating;
  let best: AnchorPoolPlayer | null = null;
  let bestDist = Infinity;
  for (const candidate of poolSortedAsc) {
    if (askedIds.has(candidate.player_id)) continue;
    const dist = Math.abs(candidate.rating - estimate);
    if (dist < bestDist) {
      best = candidate;
      bestDist = dist;
    }
  }
  return best;
}

/** Stop once we have enough converged answers, hit the cap, or run out of opponents. */
export function shouldStop(answered: number[], poolRemaining: number): boolean {
  if (answered.length >= MAX_ANSWERS) return true;
  if (poolRemaining <= 0 && answered.length > 0) return true;
  if (answered.length < MIN_ANSWERS) return false;
  const recent = answered.slice(-CONVERGE_WINDOW);
  const spread = Math.max(...recent) - Math.min(...recent);
  return spread <= CONVERGE_SPREAD;
}

/**
 * Final rating from all implied ratings — the median (robust to a single careless or
 * contradictory answer), clamped to the rating scale and rounded to 2 dp. Confidence
 * is 1 minus the normalized spread of the answers.
 */
export function deriveRating(
  answered: number[],
  poolMax: number,
): { derivedRating: number; confidence: number } {
  const mid = median(answered);
  if (mid === null) return { derivedRating: 0, confidence: 0 };
  const clamped = Math.min(Math.max(0, mid), poolMax + DERIVED_MARGIN);
  const derivedRating = Math.round(clamped * 100) / 100;
  const spread = answered.length > 1 ? Math.max(...answered) - Math.min(...answered) : 0;
  // ~2.0 points of spread => zero confidence; tighter => closer to 1.
  const confidence = Math.round(Math.max(0, 1 - spread / 2) * 100) / 100;
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
  return { status: state.status, answeredCount: answeredImpliedRatings(state).length };
}

/** Counts for the rater-facing recap (no rating numbers). */
export function summarizeChoices(state: SurveyState): { better: number; worse: number; total: number } {
  let better = 0;
  let worse = 0;
  for (const q of state.questions) {
    if (q.choice === "significantly_better" || q.choice === "slightly_better") better += 1;
    else if (q.choice === "significantly_worse" || q.choice === "slightly_worse") worse += 1;
  }
  return { better, worse, total: better + worse };
}
