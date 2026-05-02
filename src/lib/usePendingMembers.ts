"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type PendingMember = {
  player_id: number;
  name: string;
  nickname: string;
  email: string;
  image_link: string | null;
  created_at: string;
};

export function usePendingMembers(enabled = true) {
  const [pendingMembers, setPendingMembers] = useState<PendingMember[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setPendingMembers([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    supabase
      .from("players")
      .select("player_id, name, nickname, email, image_link, created_at")
      .eq("is_profile_complete", false)
      .not("email", "is", null)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (!cancelled) {
          setPendingMembers((data ?? []) as PendingMember[]);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return {
    pendingMembers,
    setPendingMembers,
    loading,
  };
}
