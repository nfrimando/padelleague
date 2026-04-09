"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import MatchCard from "@/components/MatchCard";
import BackToHome from "@/components/BackToHome";
import PlayerCard from "@/components/PlayerCard";
import { Player, MatchWithTeams } from "@/lib/types";

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [search, setSearch] = useState("");
  const [filtered, setFiltered] = useState<Player[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [playerMatches, setPlayerMatches] = useState<MatchWithTeams[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);

  // Fetch players on load
  useEffect(() => {
    async function fetchPlayers() {
      const { data, error } = await supabase.from("players").select("*");

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

  // Fetch matches for selected player
  useEffect(() => {
    if (!selectedPlayer) {
      setPlayerMatches([]);
      return;
    }

    async function fetchPlayerMatches() {
      setLoadingMatches(true);

      try {
        // Get all match_teams where the player is involved
        const { data: teamsData, error: teamsError } = await supabase
          .from("match_teams")
          .select("match_id")
          .or(
            `player_1_id.eq.${selectedPlayer!.player_id},player_2_id.eq.${selectedPlayer!.player_id}`,
          );

        if (teamsError) {
          console.error("Error fetching teams:", teamsError);
          setPlayerMatches([]);
          return;
        }

        if (!teamsData || teamsData.length === 0) {
          setPlayerMatches([]);
          return;
        }

        const matchIds = teamsData.map((t) => t.match_id);

        // Get matches
        const { data: matchesData, error: matchesError } = await supabase
          .from("matches")
          .select("*")
          .in("match_id", matchIds)
          .order("date_local", { ascending: false })
          .order("time_local", { ascending: false });

        if (matchesError) {
          console.error("Error fetching matches:", matchesError);
          setPlayerMatches([]);
          return;
        }

        // Get all teams for these matches
        const { data: allTeamsData, error: allTeamsError } = await supabase
          .from("match_teams")
          .select(
            "*, player_1:player_1_id(player_id,name,nickname,image_link), player_2:player_2_id(player_id,name,nickname,image_link)",
          )
          .in("match_id", matchIds);

        if (allTeamsError) {
          console.error("Error fetching teams:", allTeamsError);
          setPlayerMatches([]);
          return;
        }

        // Combine matches with teams
        const matches: MatchWithTeams[] = (matchesData || []).map((m) => ({
          ...m,
          teams: (allTeamsData || [])
            .filter((t) => t.match_id === m.match_id)
            .map((t) => ({
              uuid: t.uuid,
              team_number: t.team_number,
              sets_won: t.sets_won,
              player_1: t.player_1 || null,
              player_2: t.player_2 || null,
            })),
        }));

        setPlayerMatches(matches);
      } catch (error) {
        console.error("Error fetching player matches:", error);
        setPlayerMatches([]);
      } finally {
        setLoadingMatches(false);
      }
    }

    fetchPlayerMatches();
  }, [selectedPlayer]);

  return (
    <>
      <BackToHome />
      <div className="p-6 max-w-xl mx-auto">
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
                className="px-3 py-2 cursor-pointer hover:bg-gray-700 bg-gray-800 text-white"
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
            <PlayerCard player={selectedPlayer} size="lg" />
          </div>
        )}
      </div>

      {/* Player Matches - Full Width */}
      {selectedPlayer && (
        <div className="mt-8">
          <div className="max-w-xl mx-auto px-6 mb-4">
            <h2 className="text-xl font-bold">Matches</h2>
          </div>
          {loadingMatches ? (
            <div className="text-center py-8">Loading matches...</div>
          ) : playerMatches.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No matches found for this player.
            </div>
          ) : (
            <div className="space-y-6">
              {playerMatches.map((match) => (
                <MatchCard
                  key={match.match_id}
                  match={match}
                  highlightPlayerId={selectedPlayer?.player_id}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
