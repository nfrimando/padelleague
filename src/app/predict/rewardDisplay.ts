import { calculateV1PredictionReward, REWARD_BASE } from "@/lib/rewards/v1/calculate";

export const REWARD_SAMPLES = [
  { prob: 0.9, label: "90%" },
  { prob: 0.75, label: "75%" },
  { prob: 0.5, label: "50%" },
  { prob: 0.25, label: "25%" },
  { prob: 0.1, label: "10%" },
];

// Returns null if the reward system is unavailable or throws.
export function getPickReward(p: number): number | null {
  try {
    return calculateV1PredictionReward({ predictedTeamWinProbability: p, wasCorrect: true });
  } catch {
    return null;
  }
}

// Baseline reward at 50/50 odds. Null if unavailable.
export function getBaseReward(): number | null {
  try {
    return REWARD_BASE;
  } catch {
    return null;
  }
}
