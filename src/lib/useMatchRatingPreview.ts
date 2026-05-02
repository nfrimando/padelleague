import { useMemo } from "react";
import { calculateMatchRatingPreview } from "@/lib/matchRatingPreview";
import { LoadedMatchDetails, MatchRatingPreview } from "@/lib/types";

type UseMatchRatingPreviewInput = {
  loadedMatchDetails: LoadedMatchDetails | null;
  updateSet1Team1: string;
  updateSet1Team2: string;
  updateSet2Team1: string;
  updateSet2Team2: string;
  updateSet3Team1: string;
  updateSet3Team2: string;
};

export function useMatchRatingPreview({
  loadedMatchDetails,
  updateSet1Team1,
  updateSet1Team2,
  updateSet2Team1,
  updateSet2Team2,
  updateSet3Team1,
  updateSet3Team2,
}: UseMatchRatingPreviewInput): MatchRatingPreview | null {
  return useMemo(
    () =>
      calculateMatchRatingPreview({
        loadedMatchDetails,
        updateSet1Team1,
        updateSet1Team2,
        updateSet2Team1,
        updateSet2Team2,
        updateSet3Team1,
        updateSet3Team2,
      }),
    [
      loadedMatchDetails,
      updateSet1Team1,
      updateSet1Team2,
      updateSet2Team1,
      updateSet2Team2,
      updateSet3Team1,
      updateSet3Team2,
    ],
  );
}
