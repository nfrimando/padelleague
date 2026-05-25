"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";

const LS_KEY = "padelleague:predictions_last_viewed";

// Returns whether the signed-in user has prediction results that arrived since
// they last opened the Predictions tab, plus a markViewed() function to clear
// the badge. Uses localStorage so no DB schema changes are needed.
export function useUnviewedPredictionResults(email: string | null): {
  hasUnviewed: boolean;
  markViewed: () => void;
} {
  const [hasUnviewed, setHasUnviewed] = useState(false);

  useEffect(() => {
    if (!email) {
      setHasUnviewed(false);
      return;
    }

    let cancelled = false;

    void (async () => {
      const lastViewed = localStorage.getItem(LS_KEY);

      // prediction_results.user_pick_id → predictions.id (FK)
      // Filter to only this user's picks, optionally newer than last viewed.
      let query = supabase
        .from("prediction_results")
        .select("id, predictions!user_pick_id!inner(email)", { count: "exact", head: true })
        .eq("predictions.email", email);

      if (lastViewed) {
        query = query.gt("created_at", lastViewed);
      }

      const { count } = await query;

      if (!cancelled) setHasUnviewed((count ?? 0) > 0);
    })();

    return () => {
      cancelled = true;
    };
  }, [email]);

  const markViewed = useCallback(() => {
    localStorage.setItem(LS_KEY, new Date().toISOString());
    setHasUnviewed(false);
  }, []);

  return { hasUnviewed, markViewed };
}
