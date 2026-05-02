"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import BackToHome from "@/components/BackToHome";
import PlayerSearchBox from "@/components/PlayerSearchBox";
import PlayerDiscoveryCard from "@/components/PlayerDiscoveryCard";
import { usePlayers } from "@/lib/usePlayers";
import { usePlayerMatchCounts } from "@/lib/usePlayerMatchCounts";
import { usePlayerSearch } from "@/lib/usePlayerSearch";
import { Player } from "@/lib/types";

function PlayersPageContent() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const playerCardHrefBuilder = useCallback((playerId: string) => {
    return `/players/${encodeURIComponent(playerId)}`;
  }, []);

  const { players, loading } = usePlayers({ onlyActivePlayers: true });
  const filteredPlayers = usePlayerSearch(players, search);

  const [randomPlayers, setRandomPlayers] = useState<Player[]>([]);
  const pickRandomPlayers = () => {
    if (players.length === 0) return [];
    const shuffled = [...players].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 8);
  };
  useEffect(() => {
    if (players.length > 0) {
      setRandomPlayers(pickRandomPlayers());
    }
  }, [players]);
  const handleReroll = () => {
    setRandomPlayers(pickRandomPlayers());
  };

  const displayedPlayers = useMemo(() => {
    if (search.trim().length > 0) {
      return filteredPlayers;
    }

    return randomPlayers;
  }, [search, filteredPlayers, randomPlayers]);

  const displayedPlayerIds = useMemo(
    () => displayedPlayers.map((player) => player.player_id),
    [displayedPlayers],
  );
  const { matchCounts, loading: loadingMatchCounts } =
    usePlayerMatchCounts(displayedPlayerIds);

  return (
    <>
      <BackToHome />
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
        <div className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-bold">Players</h1>
            {search.trim().length === 0 ? (
              <button
                type="button"
                className="text-xs px-2 py-1 rounded font-semibold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-100 border border-slate-300 dark:border-slate-600 shadow-sm hover:bg-sky-100 dark:hover:bg-sky-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 transition"
                onClick={handleReroll}
                disabled={loading || players.length === 0}
                aria-label="Re-roll players"
              >
                Re-roll
              </button>
            ) : null}
          </div>
          <div className="mt-3">
            <PlayerSearchBox
              value={search}
              suggestions={filteredPlayers}
              selectedPlayerName={null}
              maxSuggestions={6}
              placeholder="Search players by name or nickname..."
              onValueChange={setSearch}
              onClear={() => setSearch("")}
              onSelectPlayer={(player) => {
                router.push(playerCardHrefBuilder(String(player.player_id)));
              }}
            />
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {search.trim().length > 0
              ? `Showing ${displayedPlayers.length} result${displayedPlayers.length === 1 ? "" : "s"}`
              : "Showing a random subset. Hit re-roll for a fresh mix."}
          </div>
        </div>

        {players.length === 0 && loading ? (
          <div className="flex items-center justify-center py-8">
            <svg
              className="animate-spin h-6 w-6 text-sky-500"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              ></path>
            </svg>
          </div>
        ) : displayedPlayers.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {displayedPlayers.map((player) => (
              <PlayerDiscoveryCard
                key={player.player_id}
                player={player}
                href={playerCardHrefBuilder(String(player.player_id))}
                loadingLifetimeMatches={loadingMatchCounts}
                lifetimeMatches={matchCounts[String(player.player_id)] ?? null}
              />
            ))}
          </div>
        ) : (
          <div className="rounded border border-dashed border-slate-300 dark:border-slate-700 p-6 text-sm text-slate-600 dark:text-slate-300">
            {search.trim().length > 0
              ? "No players matched your search."
              : "No active players found."}
          </div>
        )}
      </div>
    </>
  );
}

export default function PlayersPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 max-w-xl mx-auto text-sm text-slate-500">
          Loading players...
        </div>
      }
    >
      <PlayersPageContent />
    </Suspense>
  );
}
