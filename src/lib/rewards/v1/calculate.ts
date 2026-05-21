export const REWARD_BASE = 100;
// Scale factor of 1 matches fair-market (Polymarket-style) odds payout:
// reward = base × (1−p)/p, the exact return you'd expect from a fair bet.
export const REWARD_SCALE_FACTOR = 1;

// reward = base × ((1−p) / p)^scaleFactor
//
// Anchored so p=0.5 always yields exactly REWARD_BASE (100 pts).
//
// Properties:
//   1. Asymmetric   — lower p always yields higher reward; picking the underdog pays
//                    more than picking the favorite in the same match
//   2. Convex       — curvature accelerates toward p→0; the gap between p=0.1 and
//                     p=0.3 is much larger than between p=0.4 and p=0.5
//   3. Smooth + tunable — scaleFactor controls steepness; 0 → flat 100 everywhere,
//                         higher values → stronger underdog premium
//   4. Fair-market odds — equivalent to Polymarket EV; f(0.75) ≈ 33, f(0.25) = 300
//
// Returns 0 for incorrect picks.
export function calculateV1PredictionReward({
  predictedTeamWinProbability,
  wasCorrect,
}: {
  predictedTeamWinProbability: number;
  wasCorrect: boolean;
}): number {
  if (!wasCorrect) return 0;
  const p = predictedTeamWinProbability;
  return REWARD_BASE * Math.pow((1 - p) / p, REWARD_SCALE_FACTOR);
}
