"use client";

import {
  createContext,
  Dispatch,
  ReactNode,
  SetStateAction,
  useContext,
} from "react";
import { Player } from "@/lib/types";
import { EventOption } from "@/lib/useMatchEvents";
import { ScheduledMatchOption } from "@/lib/useScheduledMatches";

type AdminDataContextValue = {
  players: Player[];
  setPlayers: Dispatch<SetStateAction<Player[]>>;
  playersLoading: boolean;
  playersError: string | null;
  matchSeasons: EventOption[];
  matchSeasonsLoading: boolean;
  matchSeasonsError: string | null;
  scheduledMatches: ScheduledMatchOption[];
  scheduledMatchesLoading: boolean;
  scheduledMatchesError: string | null;
  playerNameById: Map<string, string>;
  pendingEditPlayer: Player | null;
  consumePendingEditPlayer: () => void;
  handlePlayerCreated: (created: Player) => void;
  refreshScheduledMatches: () => void;
};

const AdminDataContext = createContext<AdminDataContextValue | null>(null);

type ProviderProps = {
  value: AdminDataContextValue;
  children: ReactNode;
};

export function AdminDataProvider({ value, children }: ProviderProps) {
  return (
    <AdminDataContext.Provider value={value}>
      {children}
    </AdminDataContext.Provider>
  );
}

export function useAdminDataContext(): AdminDataContextValue {
  const value = useContext(AdminDataContext);
  if (!value) {
    throw new Error(
      "useAdminDataContext must be used within AdminDataProvider.",
    );
  }
  return value;
}
