"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type AdminPlayerClaim = {
  id: string;
  player_id: number;
  claimed_by_email: string;
  claimed_by_name: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  player: { player_id: number; name: string; nickname: string } | null;
};

export function useAdminPlayerClaims(enabled = true) {
  const [claims, setClaims] = useState<AdminPlayerClaim[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!enabled) {
      setClaims([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setClaims([]);
        return;
      }

      const res = await fetch("/api/admin/player-claims", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const json = (await res.json()) as { claims: AdminPlayerClaim[] };
        // Supabase FK joins come back as arrays; normalize to single object
        const normalized = (json.claims ?? []).map((c) => ({
          ...c,
          player: Array.isArray(c.player) ? (c.player[0] ?? null) : c.player,
        }));
        setClaims(normalized);
      }
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  return { claims, setClaims, loading, reload: load };
}
