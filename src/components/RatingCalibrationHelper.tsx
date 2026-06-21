"use client";

import { useState } from "react";
import SimilarPlayersSection from "@/app/dashboard/SimilarPlayersSection";
import PlayerSearchBox from "@/components/PlayerSearchBox";
import { supabase } from "@/lib/supabase";
import { usePlayers } from "@/lib/usePlayers";
import { usePlayerSearch } from "@/lib/usePlayerSearch";
import { fetchLatestRatingsByPlayerIds } from "@/lib/ratingLedger";
import type { SimilarPlayer } from "@/lib/useSimilarPlayers";
import type { Player } from "@/lib/types";

export function RatingCalibrationHelper({
  currentPlayerId,
  onRatingChange,
}: {
  currentPlayerId: number | null;
  rating: string;
  onRatingChange: (value: string) => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [looking, setLooking] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const { players } = usePlayers({
    orderByName: true,
    select: "player_id, name, nickname",
  });
  const suggestions = usePlayerSearch(players, search);

  function applyPeerRating(peer: SimilarPlayer) {
    setLookupError(null);
    onRatingChange(peer.latestRating.toFixed(2));
  }

  async function handleSelectSearchedPlayer(player: Player) {
    setLooking(true);
    setLookupError(null);

    const ratingsById = await fetchLatestRatingsByPlayerIds(supabase, [
      Number(player.player_id),
    ]);
    const rating = ratingsById.get(String(player.player_id)) ?? null;

    setLooking(false);

    if (rating === null) {
      setLookupError(
        `${player.nickname || player.name} has no rating on record yet.`,
      );
      return;
    }

    onRatingChange(String(rating));
    setSearch("");
    setSearchOpen(false);
  }

  return (
    <div className="space-y-2">
      <div className="-mx-4 sm:mx-0">
        <SimilarPlayersSection
          playerId={currentPlayerId}
          currentPlayerRating={null}
          onSelectPeer={applyPeerRating}
        />
      </div>

      {!searchOpen ? (
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="text-xs font-bold text-[#00C8DC] hover:text-white transition-colors cursor-pointer"
        >
          Select most similar player
        </button>
      ) : (
        <div className="space-y-1.5">
          <PlayerSearchBox
            value={search}
            suggestions={suggestions}
            onValueChange={setSearch}
            onSelectPlayer={handleSelectSearchedPlayer}
            onClear={() => setSearch("")}
            placeholder="Search by name or nickname..."
          />
          <button
            type="button"
            onClick={() => {
              setSearchOpen(false);
              setSearch("");
              setLookupError(null);
            }}
            className="text-xs text-[#687FA3] hover:text-white transition-colors cursor-pointer"
          >
            Cancel
          </button>
          {looking && (
            <p className="text-xs text-[#687FA3]">Looking up rating…</p>
          )}
          {lookupError && (
            <p className="text-xs text-red-400">{lookupError}</p>
          )}
        </div>
      )}
    </div>
  );
}
