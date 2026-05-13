"use client";

import { useEffect, useState } from "react";
import PlayerSearchBox from "@/components/PlayerSearchBox";
import { useAdminDataContext } from "@/components/admin/AdminDataContext";
import { supabase } from "@/lib/supabase";
import { Player } from "@/lib/types";
import { usePlayerSearch } from "@/lib/usePlayerSearch";

const labelCls =
  "block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5";
const inputCls =
  "block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#00C8DC]/40";

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
        setSavePlayerError(
          result.details?.join(" ") ||
            result.error ||
            "Failed to update player.",
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
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Edit Player
        </h2>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Search for a player to update their name, nickname, or profile image.
        </p>
      </div>

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
        <p className="text-sm text-slate-400 dark:text-slate-500">
          Loading players…
        </p>
      )}
      {playersError && (
        <p className="text-sm text-rose-500">
          Error loading players: {playersError}
        </p>
      )}

      {selectedPlayer && (
        <div className="space-y-4">
          <section className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-4">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
              Edit Fields
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls} htmlFor="edit-player-name">
                  Name
                </label>
                <input
                  id="edit-player-name"
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="edit-player-nickname">
                  Nickname
                </label>
                <input
                  id="edit-player-nickname"
                  type="text"
                  value={editNickname}
                  onChange={(e) => setEditNickname(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls} htmlFor="edit-player-image-link">
                  Image URL{" "}
                  <span className="normal-case tracking-normal font-normal text-slate-400">
                    (optional)
                  </span>
                </label>
                <input
                  id="edit-player-image-link"
                  type="text"
                  value={editImageLink}
                  onChange={(e) => setEditImageLink(e.target.value)}
                  className={inputCls}
                  placeholder="https://…"
                />
              </div>
            </div>
          </section>

          <section className="rounded-md bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 p-3">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3">
              Record Info
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
              <div>
                <span className={labelCls}>Player ID</span>
                <span className="font-medium text-slate-900 dark:text-slate-100 break-all">
                  {selectedPlayer.player_id}
                </span>
              </div>
              <div>
                <span className={labelCls}>Initial Rating</span>
                <span className="font-medium text-slate-900 dark:text-slate-100 break-all">
                  {typeof selectedPlayer.initial_rating === "number"
                    ? selectedPlayer.initial_rating
                    : "N/A"}
                </span>
              </div>
              <div>
                <span className={labelCls}>Created</span>
                <span className="font-medium text-slate-900 dark:text-slate-100 break-all">
                  {selectedPlayer.created_at
                    ? new Date(selectedPlayer.created_at).toLocaleDateString(
                        "en-PH",
                        { month: "short", day: "numeric", year: "numeric" },
                      )
                    : "N/A"}
                </span>
              </div>
              <div>
                <span className={labelCls}>Updated</span>
                <span className="font-medium text-slate-900 dark:text-slate-100 break-all">
                  {selectedPlayer.updated_at
                    ? new Date(selectedPlayer.updated_at).toLocaleDateString(
                        "en-PH",
                        { month: "short", day: "numeric", year: "numeric" },
                      )
                    : "N/A"}
                </span>
              </div>
            </div>
          </section>

          {savePlayerError && (
            <div className="rounded-md border border-rose-200 dark:border-rose-800/40 bg-rose-50 dark:bg-rose-900/20 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
              {savePlayerError}
            </div>
          )}
          {savePlayerSuccess && (
            <div className="rounded-md border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
              {savePlayerSuccess}
            </div>
          )}

          <div>
            <button
              type="button"
              onClick={() => void handleSavePlayer()}
              disabled={savingPlayer}
              className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {savingPlayer ? "Saving…" : "Save Player"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
