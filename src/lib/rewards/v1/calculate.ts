export const REWARD_BASE = 100;
export const REWARD_SCALE_FACTOR = 0.5;

// reward = base × (1 / predictedTeamWinProbability ^ scaleFactor)
// Higher reward for correctly picking the underdog.
// Returns 0 for incorrect picks.
export function calculateV1PredictionReward({
  predictedTeamWinProbability,
  wasCorrect,
}: {
  predictedTeamWinProbability: number;
  wasCorrect: boolean;
}): number {
  if (!wasCorrect) return 0;
  return REWARD_BASE * (1 / Math.pow(predictedTeamWinProbability, REWARD_SCALE_FACTOR));
}
