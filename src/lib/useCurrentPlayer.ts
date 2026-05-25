"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  fetchPlayerByEmail,
  PLAYER_LOOKUP_DASHBOARD_SELECT,
} from "@/lib/playerLookup";
import type { Player } from "@/lib/types";

type CurrentPlayerState = {
  user: User | null;
  player: Player | null;
  isLinked: boolean;
  isLoading: boolean;
};

export function useCurrentPlayer(): CurrentPlayerState {
  const [user, setUser] = useState<User | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function fetchPlayer(email: string | undefined) {
      if (!email) {
        if (mounted) setPlayer(null);
        return;
      }
      const { player: row } = await fetchPlayerByEmail<Player>({
        email,
        select: PLAYER_LOOKUP_DASHBOARD_SELECT,
      });
      if (mounted) setPlayer(row ?? null);
    }

    async function init() {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      const currentUser = data.user ?? null;
      setUser(currentUser);
      await fetchPlayer(currentUser?.email);
      if (mounted) setIsLoading(false);
    }

    void init();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      setIsLoading(true);
      void fetchPlayer(nextUser?.email).then(() => {
        if (mounted) setIsLoading(false);
      });
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { user, player, isLinked: player !== null, isLoading };
}
