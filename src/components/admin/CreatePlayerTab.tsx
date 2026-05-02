"use client";

import { useState } from "react";
import { useAdminDataContext } from "@/components/admin/AdminDataContext";
import { supabase } from "@/lib/supabase";
import { Player } from "@/lib/types";

export function CreatePlayerTab() {
  const { handlePlayerCreated } = useAdminDataContext();
  const [createName, setCreateName] = useState("");
  const [createNickname, setCreateNickname] = useState("");
  const [createImageLink, setCreateImageLink] = useState("");
  const [createInitialRating, setCreateInitialRating] = useState("");
  const [creatingPlayer, setCreatingPlayer] = useState(false);
  const [createPlayerError, setCreatePlayerError] = useState<string | null>(
    null,
  );
  const [createPlayerSuccess, setCreatePlayerSuccess] = useState<string | null>(
    null,
  );

  const handleCreatePlayer = async () => {
    setCreatingPlayer(true);
    setCreatePlayerError(null);
    setCreatePlayerSuccess(null);

    try {
      const payload = {
        name: createName.trim(),
        nickname: createNickname.trim(),
        image_link: createImageLink.trim() || null,
        initial_rating: createInitialRating.trim()
          ? Number(createInitialRating.trim())
          : null,
      };

      if (!payload.name || !payload.nickname) {
        setCreatePlayerError("Name and nickname cannot be empty.");
        return;
      }

      if (
        payload.initial_rating !== null &&
        (!Number.isFinite(payload.initial_rating) || payload.initial_rating < 0)
      ) {
        setCreatePlayerError("initial_rating must be a non-negative number.");
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        setCreatePlayerError("No active session found. Please sign in again.");
        return;
      }

      const response = await fetch("/api/admin/players/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          name: payload.name,
          nickname: payload.nickname,
          imageLink: payload.image_link,
          initialRating: payload.initial_rating,
        }),
      });

      const result = (await response.json()) as {
        error?: string;
        details?: string[];
        message?: string;
        player?: Player;
      };

      if (!response.ok) {
        const details = result.details?.join(" ");
        setCreatePlayerError(
          details || result.error || "Failed to create player.",
        );
        return;
      }

      const created = result.player;
      if (!created) {
        setCreatePlayerError("Player was not created.");
        return;
      }

      setCreateName("");
      setCreateNickname("");
      setCreateImageLink("");
      setCreateInitialRating("");
      setCreatePlayerSuccess(result.message || "Player created successfully.");
      handlePlayerCreated(created);
    } catch {
      setCreatePlayerError("Unexpected error while creating player.");
    } finally {
      setCreatingPlayer(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-4 text-sm">
      <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
        Create New Player
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div>
          <label
            className="text-slate-500 dark:text-slate-400"
            htmlFor="create-player-name"
          >
            name:
          </label>
          <input
            id="create-player-name"
            type="text"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
          />
        </div>
        <div>
          <label
            className="text-slate-500 dark:text-slate-400"
            htmlFor="create-player-nickname"
          >
            nickname:
          </label>
          <input
            id="create-player-nickname"
            type="text"
            value={createNickname}
            onChange={(e) => setCreateNickname(e.target.value)}
            className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
          />
        </div>
        <div className="xl:col-span-2">
          <label
            className="text-slate-500 dark:text-slate-400"
            htmlFor="create-player-image-link"
          >
            image_link:
          </label>
          <input
            id="create-player-image-link"
            type="text"
            value={createImageLink}
            onChange={(e) => setCreateImageLink(e.target.value)}
            className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
            placeholder="https://..."
          />
        </div>
        <div>
          <label
            className="text-slate-500 dark:text-slate-400"
            htmlFor="create-player-initial-rating"
          >
            initial_rating:
          </label>
          <input
            id="create-player-initial-rating"
            type="number"
            step="0.0001"
            min="0"
            value={createInitialRating}
            onChange={(e) => setCreateInitialRating(e.target.value)}
            className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
            placeholder="e.g. 3.5"
          />
        </div>
      </div>

      {createPlayerError && (
        <div className="rounded bg-rose-50 dark:bg-rose-900/20 px-2.5 py-2 text-rose-700 dark:text-rose-300">
          {createPlayerError}
        </div>
      )}

      {createPlayerSuccess && (
        <div className="rounded bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-2 text-emerald-700 dark:text-emerald-300">
          {createPlayerSuccess}
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={() => void handleCreatePlayer()}
          disabled={creatingPlayer}
          className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {creatingPlayer ? "Creating..." : "Create Player"}
        </button>
      </div>
    </div>
  );
}
