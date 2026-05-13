"use client";

import { useState } from "react";
import { useAdminDataContext } from "@/components/admin/AdminDataContext";
import { supabase } from "@/lib/supabase";
import { Player } from "@/lib/types";

const labelCls =
  "block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5";
const inputCls =
  "block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#00C8DC]/40";

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
        setCreatePlayerError("Initial rating must be a non-negative number.");
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
        setCreatePlayerError(
          result.details?.join(" ") ||
            result.error ||
            "Failed to create player.",
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
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Create Player
        </h2>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Add a new player to the league. You'll be taken to Edit Player to
          review the record after creation.
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-4">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Player Details
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="create-player-name">
              Name
            </label>
            <input
              id="create-player-name"
              type="text"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              className={inputCls}
              placeholder="Full name"
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="create-player-nickname">
              Nickname
            </label>
            <input
              id="create-player-nickname"
              type="text"
              value={createNickname}
              onChange={(e) => setCreateNickname(e.target.value)}
              className={inputCls}
              placeholder="Display name"
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="create-player-image-link">
              Image URL{" "}
              <span className="normal-case tracking-normal font-normal text-slate-400">
                (optional)
              </span>
            </label>
            <input
              id="create-player-image-link"
              type="text"
              value={createImageLink}
              onChange={(e) => setCreateImageLink(e.target.value)}
              className={inputCls}
              placeholder="https://…"
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="create-player-initial-rating">
              Initial Rating{" "}
              <span className="normal-case tracking-normal font-normal text-slate-400">
                (optional)
              </span>
            </label>
            <input
              id="create-player-initial-rating"
              type="number"
              step="0.0001"
              min="0"
              value={createInitialRating}
              onChange={(e) => setCreateInitialRating(e.target.value)}
              className={inputCls}
              placeholder="e.g. 3.5"
            />
          </div>
        </div>
      </section>

      {createPlayerError && (
        <div className="rounded-md border border-rose-200 dark:border-rose-800/40 bg-rose-50 dark:bg-rose-900/20 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
          {createPlayerError}
        </div>
      )}
      {createPlayerSuccess && (
        <div className="rounded-md border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          {createPlayerSuccess}
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={() => void handleCreatePlayer()}
          disabled={creatingPlayer}
          className="inline-flex items-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {creatingPlayer ? "Creating…" : "Create Player"}
        </button>
      </div>
    </div>
  );
}
