"use client";

import { useMemo } from "react";
import { Player } from "@/lib/types";

export function usePlayerSearch(players: Player[], searchValue: string) {
  const normalizedQuery = searchValue.trim().toLowerCase();

  return useMemo(() => {
    if (!normalizedQuery) {
      return [];
    }

    return players.filter((player) => {
      return (
        String(player.name || "")
          .toLowerCase()
          .includes(normalizedQuery) ||
        String(player.nickname || "")
          .toLowerCase()
          .includes(normalizedQuery)
      );
    });
  }, [players, normalizedQuery]);
}