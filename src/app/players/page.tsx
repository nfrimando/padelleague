"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Player = {
  player_id: string;
  name: string;
  nickname: string;
  created_at: string;
  image_link?: string;
};

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [search, setSearch] = useState("");
  const [filtered, setFiltered] = useState<Player[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

  // Fetch players on load
  useEffect(() => {
    async function fetchPlayers() {
      const { data, error } = await supabase.from("dim_players").select("*");

      if (error) {
        console.error(error);
        return;
      }

      setPlayers(data || []);
    }

    fetchPlayers();
  }, []);

  // Filter players when typing
  useEffect(() => {
    if (!search) {
      setFiltered([]);
      return;
    }

    const results = players.filter((p) => {
      const query = search.toLowerCase();

      return (
        p.name?.toLowerCase().includes(query) ||
        p.nickname?.toLowerCase().includes(query)
      );
    });

    setFiltered(results);
  }, [search, players]);

  return (
    <>
      {selectedPlayer?.image_link && (
        <img
          src={selectedPlayer.image_link}
          alt={selectedPlayer.name}
          className="fixed top-4 right-4 w-20 h-20 rounded-full object-cover border-2 shadow-lg"
        />
      )}

      <div className="p-6 max-w-xl">
        <h1 className="text-2xl font-bold mb-4">Player Search</h1>

        {/* Input */}
        <input
          type="text"
          placeholder="Type player name..."
          className="w-full border px-3 py-2 rounded"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setSelectedPlayer(null);
          }}
        />

        {/* Dropdown */}
        {filtered.length > 0 && !selectedPlayer && (
          <div className="border mt-2 rounded shadow bg-white">
            {filtered.slice(0, 5).map((player) => (
              <div
                key={player.player_id}
                className="px-3 py-2 hover:bg-gray-100 cursor-pointer"
                onClick={() => {
                  setSelectedPlayer(player);
                  setSearch(player.name);
                  setFiltered([]);
                }}
              >
                <div>
                  <div className="font-medium">{player.name}</div>
                  {player.nickname && (
                    <div className="text-sm text-gray-500">
                      {player.nickname}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Selected Player Details */}
        {selectedPlayer && (
          <div className="mt-6 border p-4 rounded">
            <div className="flex items-center gap-4">
              {selectedPlayer.image_link && (
                <img
                  src={selectedPlayer.image_link}
                  className="w-16 h-16 rounded-full object-cover"
                />
              )}
              <div>
                <h2 className="text-xl font-semibold">{selectedPlayer.name}</h2>
                <p className="text-gray-600">
                  Nickname: {selectedPlayer.nickname || "—"}
                </p>
              </div>
            </div>
            <p className="text-gray-600 text-sm">
              Created:{" "}
              {new Date(selectedPlayer.created_at).toLocaleDateString()}
            </p>
          </div>
        )}
      </div>
    </>
  );
}
