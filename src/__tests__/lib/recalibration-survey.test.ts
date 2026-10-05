import { describe, expect, it } from "vitest";
import {
  choiceDirection,
  computeBracket,
  createSurveyState,
  deriveRating,
  selectNextAnchor,
  summarizeChoices,
  toRespondentSurveySummary,
  type AnchorPoolPlayer,
  type SurveyChoice,
  type SurveyQuestion,
  type SurveyState,
  DERIVED_MARGIN,
  MAX_QUESTIONS,
  SAME_BAND,
  SAME_WIN_PROB,
} from "../../lib/recalibration/survey";
import { computeV3ExpectedWinProbability } from "../../lib/ratings/v3/calculate";

function pool(...ratings: number[]): AnchorPoolPlayer[] {
  return ratings
    .map((rating, i) => ({
      player_id: i + 1,
      name: `P${i + 1}`,
      nickname: null,
      image_link: null,
      rating,
    }))
    .sort((a, b) => a.rating - b.rating);
}

/** Evenly spread pool from `from` to `to` in `step` increments. */
function spreadPool(from: number, to: number, step: number): AnchorPoolPlayer[] {
  const ratings: number[] = [];
  for (let r = from; r <= to + 1e-9; r += step) ratings.push(Math.round(r * 100) / 100);
  return pool(...ratings);
}

function q(anchorRating: number, choice: SurveyChoice | null, anchorPlayerId = anchorRating * 100): SurveyQuestion {
  return {
    order: 0,
    anchorPlayerId,
    anchorPlayerName: null,
    anchorPlayerNickname: null,
    anchorPlayerImage: null,
    anchorRating,
    choice,
    impliedRating: null,
    askedAt: "2026-10-06T00:00:00Z",
    answeredAt: choice ? "2026-10-06T00:01:00Z" : null,
  };
}

type Rater = (anchor: AnchorPoolPlayer, index: number) => SurveyChoice;

/** A rater who knows the calibratee's true rating and answers honestly. */
function honest(trueRating: number): Rater {
  return (anchor) => {
    const gap = trueRating - anchor.rating;
    if (Math.abs(gap) <= SAME_BAND / 2) return "relatively_same";
    return gap > 0 ? "better" : "worse";
  };
}

/** Drive the full survey loop the way the API routes do. */
function runSurvey(players: AnchorPoolPlayer[], seed: number, rater: Rater) {
  const questions: SurveyQuestion[] = [];
  for (;;) {
    const anchor = selectNextAnchor(players, questions, seed);
    if (!anchor) break;
    questions.push({ ...q(anchor.rating, null, anchor.player_id), order: questions.length + 1 });
    questions[questions.length - 1].choice = rater(anchor, questions.length - 1);
  }
  return { questions, result: deriveRating(questions, players) };
}

describe("SAME_BAND", () => {
  it("is the rating gap at which the stronger player wins SAME_WIN_PROB of the time", () => {
    expect(SAME_BAND).toBeCloseTo(0.47, 2);
    const [ewp] = computeV3ExpectedWinProbability(5 + SAME_BAND, 5);
    expect(ewp).toBeCloseTo(SAME_WIN_PROB, 6);
  });
});

describe("choiceDirection", () => {
  it("maps new and v1 choices by direction", () => {
    expect(choiceDirection("better")).toBe(1);
    expect(choiceDirection("significantly_better")).toBe(1);
    expect(choiceDirection("slightly_better")).toBe(1);
    expect(choiceDirection("relatively_same")).toBe(0);
    expect(choiceDirection("worse")).toBe(-1);
    expect(choiceDirection("slightly_worse")).toBe(-1);
    expect(choiceDirection("significantly_worse")).toBe(-1);
    expect(choiceDirection("dont_know")).toBeNull();
  });
});

describe("computeBracket", () => {
  it("starts at the pool ends plus margin", () => {
    expect(computeBracket([], 2, 8)).toEqual({ lo: 2 - DERIVED_MARGIN, hi: 8 + DERIVED_MARGIN });
  });

  it("cuts lo on 'better' and hi on 'worse', ignoring don't know", () => {
    const b = computeBracket([q(4, "better"), q(7, "dont_know"), q(6, "worse")], 2, 8);
    expect(b).toEqual({ lo: 4, hi: 6 });
  });

  it("narrows to the opponent ± SAME_BAND on 'about the same'", () => {
    const b = computeBracket([q(5, "relatively_same")], 2, 8);
    expect(b.lo).toBeCloseTo(5 - SAME_BAND);
    expect(b.hi).toBeCloseTo(5 + SAME_BAND);
  });

  it("lets later answers inside a 'same' band narrow it further", () => {
    const b = computeBracket([q(5, "relatively_same"), q(5.2, "worse")], 2, 8);
    expect(b.lo).toBeCloseTo(5 - SAME_BAND);
    expect(b.hi).toBe(5.2);
  });

  it("undoes the contradicted cut and ignores the contradicting answer", () => {
    // better than 4, better than 6, then worse than 5 → the 6 cut is undone, lo back to 4.
    const b = computeBracket([q(4, "better"), q(6, "better"), q(5, "worse")], 2, 8);
    expect(b).toEqual({ lo: 4, hi: 8 + DERIVED_MARGIN });
  });

  it("reads v1 magnitude answers by direction", () => {
    const b = computeBracket([q(4, "significantly_better"), q(6, "slightly_worse")], 2, 8);
    expect(b).toEqual({ lo: 4, hi: 6 });
  });
});

describe("selectNextAnchor", () => {
  it("seeds the first opponent nearest the seed rating", () => {
    expect(selectNextAnchor(pool(1, 2, 3, 4, 5), [], 3.2)?.rating).toBe(3);
  });

  it("stays near the seed while every answer is don't know", () => {
    const next = selectNextAnchor(pool(1, 2, 3, 4, 5), [q(3, "dont_know", 3)], 3.2);
    expect(next?.rating).toBe(4);
  });

  it("asks the opponent nearest the bracket midpoint", () => {
    // better than 3 → bracket [3, 5.5] → midpoint 4.25 → nearest is 4.
    const next = selectNextAnchor(pool(1, 2, 3, 4, 5), [q(3, "better", 3)], 3);
    expect(next?.rating).toBe(4);
  });

  it("never asks more than MAX_QUESTIONS players", () => {
    const players = spreadPool(1, 9, 0.1);
    const asked = Array.from({ length: MAX_QUESTIONS }, (_, i) => q(players[i].rating, "dont_know", players[i].player_id));
    expect(selectNextAnchor(players, asked, 5)).toBeNull();
  });

  it("returns null when the pool is exhausted", () => {
    const players = pool(1, 2);
    expect(selectNextAnchor(players, [q(1, "better", 1), q(2, "better", 2)], 1)).toBeNull();
  });
});

describe("full survey", () => {
  const players = spreadPool(2, 9, 0.25);
  const { poolMax } = { poolMax: players[players.length - 1].rating };

  it("lands near the true rating within a few questions", () => {
    const { questions, result } = runSurvey(players, 5, honest(6.3));
    expect(questions.length).toBeLessThanOrEqual(8);
    expect(Math.abs((result?.derivedRating ?? 0) - 6.3)).toBeLessThanOrEqual(0.5);
  });

  it("climbs to the top of the pool when always 'better'", () => {
    const { result } = runSurvey(players, 5, () => "better");
    expect(result?.derivedRating).toBeGreaterThanOrEqual(poolMax);
  });

  it("drops to the bottom of the pool when always 'worse'", () => {
    const { result } = runSurvey(players, 5, () => "worse");
    expect(result?.derivedRating).toBeLessThanOrEqual(players[0].rating);
  });

  it("confirms the closed bracket with an opponent just outside each edge", () => {
    const { questions } = runSurvey(players, 5, honest(6.3));
    const final = computeBracket(questions, players[0].rating, poolMax);
    const askedBelow = questions.some((x) => x.anchorRating < final.lo);
    const askedAbove = questions.some((x) => x.anchorRating > final.hi);
    expect(askedBelow && askedAbove).toBe(true);
  });

  it("recovers from one wrong answer", () => {
    // Truly 6.3, but the second answer is wrong.
    const truth = honest(6.3);
    const { result } = runSurvey(players, 5, (a, i) => (i === 1 ? (truth(a, i) === "better" ? "worse" : "better") : truth(a, i)));
    expect(Math.abs((result?.derivedRating ?? 0) - 6.3)).toBeLessThanOrEqual(0.75);
  });

  it("reopens the bracket when a confirmation answer disagrees", () => {
    // better than 5, worse than 5.5 → closed [5, 5.5]; then "worse" than 4.75 below lo.
    const b = computeBracket([q(5, "better"), q(5.5, "worse"), q(4.75, "worse")], 2, 9);
    expect(b.lo).toBeLessThan(5);
  });

  it("caps at MAX_QUESTIONS even when the rater knows almost nobody", () => {
    const { questions, result } = runSurvey(players, 5, (a, i) => (i === 7 ? "better" : "dont_know"));
    expect(questions.length).toBe(MAX_QUESTIONS);
    expect(result).not.toBeNull();
  });

  it("derives nothing when every answer is don't know", () => {
    const { questions, result } = runSurvey(players, 5, () => "dont_know");
    expect(questions.length).toBe(MAX_QUESTIONS);
    expect(result).toBeNull();
  });
});

describe("deriveRating", () => {
  it("is the bracket midpoint with confidence from its width", () => {
    const players = pool(2, 4, 6, 8);
    const result = deriveRating([q(4, "better"), q(6, "worse")], players);
    expect(result).toEqual({ derivedRating: 5, confidence: 0 });
    const tight = deriveRating([q(4, "better"), q(4.4, "worse")], pool(2, 4, 4.4, 8));
    expect(tight).toEqual({ derivedRating: 4.2, confidence: 0.8 });
  });
});

describe("summarizeChoices + toRespondentSurveySummary", () => {
  it("counts by direction (including v1 choices) and skips don't know", () => {
    const state: SurveyState = {
      ...createSurveyState("2026-10-06T00:00:00Z"),
      questions: [
        q(3, "better"),
        q(4, "dont_know"),
        q(3.5, "slightly_worse"),
        q(3.2, "relatively_same"),
      ],
    };
    expect(summarizeChoices(state)).toEqual({ better: 1, worse: 1, same: 1, total: 3 });
    expect(toRespondentSurveySummary(state)).toEqual({ status: "in_progress", answeredCount: 3 });
  });
});
