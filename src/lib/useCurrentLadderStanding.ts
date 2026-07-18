"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type CurrentLadderStanding = {
  tierName: string;
  stars: number;
};

export type CurrentLadderStandingResult = {
  standing: CurrentLadderStanding | null;
  loading: boolean;
};

// Client-side lookup of a single player's current tier + stars in the active
// ladder cycle. No fallback to a past cycle — no active cycle means no badge.
export function useCurrentLadderStanding(
  playerId: string | null,
): CurrentLadderStandingResult {
  const [standing, setStanding] = useState<CurrentLadderStanding | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!playerId) {
      setStanding(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    async function load() {
      const { data: activeCycle } = await supabase
        .from("ladder_cycles")
        .select("id")
        .eq("status", "active")
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      if (!activeCycle) {
        setStanding(null);
        setLoading(false);
        return;
      }

      const { data: eventRow } = await supabase
        .from("ladder_standing_events")
        .select("tier_after_id, stars_after")
        .eq("cycle_id", activeCycle.id)
        .eq("player_id", playerId)
        .order("occurred_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      if (!eventRow) {
        setStanding(null);
        setLoading(false);
        return;
      }

      const { data: tierRow } = await supabase
        .from("ladder_tiers")
        .select("name")
        .eq("id", eventRow.tier_after_id)
        .maybeSingle();

      if (cancelled) return;

      setStanding(
        tierRow ? { tierName: tierRow.name, stars: eventRow.stars_after } : null,
      );
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  return { standing, loading };
}
