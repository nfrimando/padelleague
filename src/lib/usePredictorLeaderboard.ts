import { useState, useEffect } from "react";

export type PredictorLeaderboardEntry = {
  player_id: number;
  name: string | null;
  nickname: string | null;
  image_link: string | null;
  points: number;
};

export function usePredictorLeaderboard() {
  const [data, setData] = useState<PredictorLeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/predictor-leaderboard")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load leaderboard.");
        return res.json() as Promise<PredictorLeaderboardEntry[]>;
      })
      .then((entries) => {
        if (!cancelled) {
          setData(entries);
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load leaderboard.",
          );
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, isLoading, error };
}
