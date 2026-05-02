"use client";

import { useEffect, useState } from "react";
import PlayerSearchBox from "@/components/PlayerSearchBox";
import { useAdminDataContext } from "@/components/admin/AdminDataContext";
import { supabase } from "@/lib/supabase";
import { Player } from "@/lib/types";
import { usePlayerSearch } from "@/lib/usePlayerSearch";

export function EditPlayerTab() {
  const {
    players,
    setPlayers,
    playersLoading,
    playersError,
    pendingEditPlayer,
    consumePendingEditPlayer,
  } = useAdminDataContext();
  const [search, setSearch] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [editName, setEditName] = useState("");
  const [editNickname, setEditNickname] = useState("");
  const [editImageLink, setEditImageLink] = useState("");
  const [savingPlayer, setSavingPlayer] = useState(false);
  const [savePlayerError, setSavePlayerError] = useState<string | null>(null);
  const [savePlayerSuccess, setSavePlayerSuccess] = useState<string | null>(
    null,
  );

  const filtered = usePlayerSearch(players, search);

  // When the page hands us a freshly created player, adopt it.
  useEffect(() => {
    if (!pendingEditPlayer) return;
    setSelectedPlayer(pendingEditPlayer);
    setSearch(pendingEditPlayer.name || "");
    setEditName(pendingEditPlayer.name || "");
    setEditNickname(pendingEditPlayer.nickname || "");
    setEditImageLink(pendingEditPlayer.image_link || "");
    setSavePlayerError(null);
    setSavePlayerSuccess(null);
    consumePendingEditPlayer();
  }, [pendingEditPlayer, consumePendingEditPlayer]);

  // Sync edit fields when selected player changes.
  useEffect(() => {
    setEditName(selectedPlayer?.name || "");
    setEditNickname(selectedPlayer?.nickname || "");
    setEditImageLink(selectedPlayer?.image_link || "");
  }, [selectedPlayer]);

  const selectPlayerFromSearch = (player: Player) => {
    setSelectedPlayer(player);
    setSearch(player.name || "");
    setSavePlayerError(null);
    setSavePlayerSuccess(null);
  };

  const handleSavePlayer = async () => {
    if (!selectedPlayer) return;
    setSavingPlayer(true);
    setSavePlayerError(null);
    setSavePlayerSuccess(null);

    try {
      const updates = {
        name: editName.trim(),
        nickname: editNickname.trim(),
        image_link: editImageLink.trim() || null,
      };

      if (!updates.name || !updates.nickname) {
        setSavePlayerError("Name and nickname cannot be empty.");
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        setSavePlayerError("No active session found. Please sign in again.");
        return;
      }

      const response = await fetch(
        `/api/admin/players/${selectedPlayer.player_id}/update`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            name: updates.name,
            nickname: updates.nickname,
            imageLink: updates.image_link,
          }),
        },
      );

      const result = (await response.json()) as {
        error?: string;
        details?: string[];
        message?: string;
        player?: Player;
      };

      if (!response.ok) {
        const details = result.details?.join(" ");
        setSavePlayerError(
          details || result.error || "Failed to update player.",
        );
        return;
      }

      const updated = result.player;
      if (!updated) {
        setSavePlayerError("Player not found.");
        return;
      }

      setSelectedPlayer(updated);
      setPlayers((current) =>
        current.map((p) =>
          String(p.player_id) === String(updated.player_id) ? updated : p,
        ),
      );
      setSavePlayerSuccess(result.message || "Player updated successfully.");
    } catch {
      setSavePlayerError("Unexpected error while updating player.");
    } finally {
      setSavingPlayer(false);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
        Player Lookup
      </h3>

      <PlayerSearchBox
        value={search}
        suggestions={filtered}
        maxSuggestions={7}
        selectedPlayerName={selectedPlayer?.name || null}
        onValueChange={setSearch}
        onSelectPlayer={selectPlayerFromSearch}
        onClear={() => {
          setSearch("");
          setSelectedPlayer(null);
          setSavePlayerError(null);
          setSavePlayerSuccess(null);
        }}
      />

      {playersLoading && (
        <div className="text-sm text-slate-500 dark:text-slate-400">
          Loading players...
        </div>
      )}

      {playersError && (
        <div className="text-sm text-rose-600 dark:text-rose-400">
          Error loading players: {playersError}
        </div>
      )}

      {selectedPlayer && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-4 text-sm">
          <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Player Details
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <div>
              <label className="text-slate-500 dark:text-slate-400">
                name:
              </label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="text-slate-500 dark:text-slate-400">
                nickname:
              </label>
              <input
                type="text"
                value={editNickname}
                onChange={(e) => setEditNickname(e.target.value)}
                className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div className="xl:col-span-2">
              <label className="text-slate-500 dark:text-slate-400">
                image_link:
              </label>
              <input
                type="text"
                value={editImageLink}
                onChange={(e) => setEditImageLink(e.target.value)}
                className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                placeholder="https://..."
              />
            </div>
          </div>

          <div className="rounded-md bg-slate-50 dark:bg-slate-800/40 p-3 grid gap-3 xl:grid-cols-4">
            <div>
              <span className="text-slate-500 dark:text-slate-400">
                player_id:
              </span>{" "}
              <span className="font-medium text-slate-900 dark:text-slate-100 break-all">
                {selectedPlayer.player_id}
              </span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">
                initial_rating:
              </span>{" "}
              <span className="font-medium text-slate-900 dark:text-slate-100 break-all">
                {typeof selectedPlayer.initial_rating === "number"
                  ? selectedPlayer.initial_rating
                  : "N/A"}
              </span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">
                created_at:
              </span>{" "}
              <span className="font-medium text-slate-900 dark:text-slate-100 break-all">
                {selectedPlayer.created_at || "N/A"}
              </span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">
                updated_at:
              </span>{" "}
              <span className="font-medium text-slate-900 dark:text-slate-100 break-all">
                {selectedPlayer.updated_at || "N/A"}
              </span>
            </div>
          </div>

          {savePlayerError && (
            <div className="rounded bg-rose-50 dark:bg-rose-900/20 px-2.5 py-2 text-rose-700 dark:text-rose-300">
              {savePlayerError}
            </div>
          )}

          {savePlayerSuccess && (
            <div className="rounded bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-2 text-emerald-700 dark:text-emerald-300">
              {savePlayerSuccess}
            </div>
          )}

          <div>
            <button
              type="button"
              onClick={() => void handleSavePlayer()}
              disabled={savingPlayer}
              className="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {savingPlayer ? "Saving..." : "Save Player"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
