"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabase";

// Returns the number of scheduled matches within the next ~48 hours (today + tomorrow
// in PH time, UTC+8) that the signed-in user has not yet submitted a prediction for.
export function useUnvotedUpcomingCount(email: string | null): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!email) {
      setCount(0);
      return;
    }

    let cancelled = false;

    void (async () => {
      // Use browser local date (user is in PH so this gives the correct PH date)
      const today = new Date().toLocaleDateString("en-CA");
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString("en-CA");

      const { data: matches } = await supabase
        .from("matches")
        .select("match_id")
        .eq("status", "scheduled")
        .gte("date_local", today)
        .lte("date_local", tomorrow);

      const matchIds = (matches ?? []).map((m) => m.match_id as number);
      if (matchIds.length === 0) {
        if (!cancelled) setCount(0);
        return;
      }

      const { data: existingPreds } = await supabase
        .from("predictions")
        .select("match_id")
        .eq("email", email)
        .in("match_id", matchIds);

      if (cancelled) return;

      const voted = new Set((existingPreds ?? []).map((p) => p.match_id as number));
      setCount(matchIds.filter((id) => !voted.has(id)).length);
    })();

    return () => {
      cancelled = true;
    };
  }, [email]);

  return count;
}
