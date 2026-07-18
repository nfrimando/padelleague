// Pure state-transition function for the tier ladder mechanic. See .claude/ladder.md for the
// mechanic overview and CLAUDE.md's ledger rule for why this produces a single next-state row
// rather than mutating anything.
//
// Cushion rule (confirmed with the user, broader than .claude/ladder.md's literal "promotion
// cushion" wording): the cushion re-arms on ANY tier entry (promotion, demotion, or cycle
// placement) and is consumed by the first loss at 0 stars in that tier. A second 0-star loss
// with no cushion available demotes; landing at 2 stars in the tier below.

export type LadderStanding = {
  tierId: number;
  stars: number;
  cushionAvailable: boolean;
};

export type LadderTierRow = {
  id: number;
  rank: number;
};

export type LadderTransitionEventType =
  | "match_win"
  | "match_loss"
  | "promotion"
  | "demotion";

export type LadderTransitionResult = {
  eventType: LadderTransitionEventType;
  tierBeforeId: number;
  tierAfterId: number;
  starsBefore: number;
  starsAfter: number;
  cushionAvailable: boolean;
  metadata: Record<string, unknown> | null;
};

const MAX_STARS = 2;
const MIN_STARS = 0;

function findAdjacentTier(
  currentTierId: number,
  tiers: LadderTierRow[],
  direction: 1 | -1,
): LadderTierRow | null {
  const current = tiers.find((t) => t.id === currentTierId);
  if (!current) return null;
  return (
    tiers.find((t) => t.rank === current.rank + direction) ?? null
  );
}

export function computeNextLadderStanding(
  current: LadderStanding,
  outcome: "win" | "loss",
  tiers: LadderTierRow[],
): LadderTransitionResult {
  if (outcome === "win") {
    if (current.stars < MAX_STARS) {
      return {
        eventType: "match_win",
        tierBeforeId: current.tierId,
        tierAfterId: current.tierId,
        starsBefore: current.stars,
        starsAfter: current.stars + 1,
        cushionAvailable: current.cushionAvailable,
        metadata: null,
      };
    }

    const nextTier = findAdjacentTier(current.tierId, tiers, 1);
    if (!nextTier) {
      // Top tier: capped at 2 stars, nowhere to promote to.
      return {
        eventType: "match_win",
        tierBeforeId: current.tierId,
        tierAfterId: current.tierId,
        starsBefore: current.stars,
        starsAfter: MAX_STARS,
        cushionAvailable: current.cushionAvailable,
        metadata: null,
      };
    }

    return {
      eventType: "promotion",
      tierBeforeId: current.tierId,
      tierAfterId: nextTier.id,
      starsBefore: current.stars,
      starsAfter: MIN_STARS,
      cushionAvailable: true,
      metadata: null,
    };
  }

  // outcome === "loss"
  if (current.stars > MIN_STARS) {
    return {
      eventType: "match_loss",
      tierBeforeId: current.tierId,
      tierAfterId: current.tierId,
      starsBefore: current.stars,
      starsAfter: current.stars - 1,
      cushionAvailable: current.cushionAvailable,
      metadata: null,
    };
  }

  if (current.cushionAvailable) {
    return {
      eventType: "match_loss",
      tierBeforeId: current.tierId,
      tierAfterId: current.tierId,
      starsBefore: MIN_STARS,
      starsAfter: MIN_STARS,
      cushionAvailable: false,
      metadata: { cushion_consumed: true },
    };
  }

  const prevTier = findAdjacentTier(current.tierId, tiers, -1);
  if (!prevTier) {
    // Bottom tier: floor at 0 stars, nowhere to demote to.
    return {
      eventType: "match_loss",
      tierBeforeId: current.tierId,
      tierAfterId: current.tierId,
      starsBefore: MIN_STARS,
      starsAfter: MIN_STARS,
      cushionAvailable: false,
      metadata: null,
    };
  }

  return {
    eventType: "demotion",
    tierBeforeId: current.tierId,
    tierAfterId: prevTier.id,
    starsBefore: MIN_STARS,
    starsAfter: MAX_STARS,
    cushionAvailable: true,
    metadata: null,
  };
}
