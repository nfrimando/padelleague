import { describe, expect, it } from "vitest";
import {
  answeredImpliedRatings,
  createSurveyState,
  deriveRating,
  impliedRating,
  median,
  selectNextAnchor,
  shouldStop,
  summarizeChoices,
  type AnchorPoolPlayer,
  type SurveyState,
  DELTA_SIGNIFICANT,
  DELTA_SLIGHT,
  MIN_ANSWERS,
  MAX_ANSWERS,
} from "../../lib/recalibration/survey";

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

describe("impliedRating", () => {
  it("maps each magnitude to an offset from the opponent's rating", () => {
    expect(impliedRating(3, "significantly_better")).toBeCloseTo(3 + DELTA_SIGNIFICANT);
    expect(impliedRating(3, "slightly_better")).toBeCloseTo(3 + DELTA_SLIGHT);
    expect(impliedRating(3, "slightly_worse")).toBeCloseTo(3 - DELTA_SLIGHT);
    expect(impliedRating(3, "significantly_worse")).toBeCloseTo(3 - DELTA_SIGNIFICANT);
  });

  it("clamps to >= 0 and returns null for don't know", () => {
    expect(impliedRating(0.1, "significantly_worse")).toBe(0);
    expect(impliedRating(3, "dont_know")).toBeNull();
  });
});

describe("median", () => {
  it("handles odd and even lengths", () => {
    expect(median([3])).toBe(3);
    expect(median([1, 3, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("selectNextAnchor", () => {
  it("seeds the first opponent nearest the calibratee's current rating", () => {
    const next = selectNextAnchor(pool(1, 2, 3, 4, 5), new Set(), [], 3.2);
    expect(next?.rating).toBe(3);
  });

  it("homes in on the running median once answers exist", () => {
    const next = selectNextAnchor(pool(1, 2, 3, 4, 5), new Set([3]), [4.1, 3.9], 2);
    expect(next?.rating).toBe(4);
  });

  it("never re-asks the same opponent and returns null when exhausted", () => {
    const askedAll = new Set([1, 2, 3]);
    expect(selectNextAnchor(pool(1, 2, 3), askedAll, [2], 2)).toBeNull();
  });
});

describe("shouldStop", () => {
  it("requires at least MIN_ANSWERS real answers", () => {
    const answers = Array(MIN_ANSWERS - 1).fill(3);
    expect(shouldStop(answers, 10)).toBe(false);
  });

  it("stops after MIN_ANSWERS once recent answers converge", () => {
    expect(shouldStop([1, 5, 3.0, 3.1, 3.2], 10)).toBe(true);
  });

  it("keeps going past MIN_ANSWERS while answers stay spread out", () => {
    expect(shouldStop([1, 5, 2, 6, 3], 10)).toBe(false);
  });

  it("hard-stops at MAX_ANSWERS even when not converged", () => {
    const noisy = [1, 6, 2, 7, 3, 8, 1, 9, 2];
    expect(noisy.length).toBe(MAX_ANSWERS);
    expect(shouldStop(noisy, 10)).toBe(true);
  });

  it("stops when the opponent pool is exhausted", () => {
    expect(shouldStop([3, 3], 0)).toBe(true);
  });
});

describe("deriveRating", () => {
  it("uses the median and is robust to a single outlier", () => {
    const { derivedRating } = deriveRating([3.4, 3.5, 3.6, 9.0], 8);
    expect(derivedRating).toBeCloseTo(3.55);
  });

  it("rounds to 2 dp and clamps to the scale", () => {
    const { derivedRating } = deriveRating([10, 10, 10], 8);
    expect(derivedRating).toBe(8.5); // poolMax 8 + margin 0.5
  });

  it("reports higher confidence for tightly-clustered answers", () => {
    const tight = deriveRating([3.4, 3.5, 3.6], 8).confidence;
    const loose = deriveRating([1, 3.5, 6], 8).confidence;
    expect(tight).toBeGreaterThan(loose);
  });
});

describe("answeredImpliedRatings + summarizeChoices", () => {
  it("excludes don't-know answers from the implied ratings but the survey continues", () => {
    const state: SurveyState = {
      ...createSurveyState("2026-06-25T00:00:00Z"),
      questions: [
        q(1, 3, "slightly_better", 3.25),
        q(2, 4, "dont_know", null),
        q(3, 3.5, "slightly_worse", 3.25),
      ],
    };
    expect(answeredImpliedRatings(state)).toEqual([3.25, 3.25]);
    expect(summarizeChoices(state)).toEqual({ better: 1, worse: 1, total: 2 });
  });
});

function q(
  order: number,
  anchorRating: number,
  choice: SurveyState["questions"][number]["choice"],
  implied: number | null,
): SurveyState["questions"][number] {
  return {
    order,
    anchorPlayerId: order,
    anchorPlayerName: `P${order}`,
    anchorPlayerNickname: null,
    anchorPlayerImage: null,
    anchorRating,
    choice,
    impliedRating: implied,
    askedAt: "2026-06-25T00:00:00Z",
    answeredAt: choice ? "2026-06-25T00:01:00Z" : null,
  };
}
