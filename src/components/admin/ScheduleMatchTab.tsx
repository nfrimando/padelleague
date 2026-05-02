"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Player } from "@/lib/types";
import {
  SCHEDULE_MATCH_TYPE_OPTIONS,
  SCHEDULE_MATCH_VENUE_OPTIONS,
} from "./constants";

type Props = {
  players: Player[];
  playersLoading: boolean;
  playersError: string | null;
  matchSeasons: number[];
  matchSeasonsLoading: boolean;
  matchSeasonsError: string | null;
  onMatchScheduled: () => void;
};

export function ScheduleMatchTab({
  players,
  playersLoading,
  playersError,
  matchSeasons,
  matchSeasonsLoading,
  matchSeasonsError,
  onMatchScheduled,
}: Props) {
  const [createMatchSeasonId, setCreateMatchSeasonId] = useState("");
  const [createMatchDateLocal, setCreateMatchDateLocal] = useState("");
  const [createMatchTimeLocal, setCreateMatchTimeLocal] = useState("");
  const [createMatchVenue, setCreateMatchVenue] = useState("");
  const [createMatchType, setCreateMatchType] = useState("");
  const [createMatchTeam1Player1, setCreateMatchTeam1Player1] = useState("");
  const [createMatchTeam1Player2, setCreateMatchTeam1Player2] = useState("");
  const [createMatchTeam2Player1, setCreateMatchTeam2Player1] = useState("");
  const [createMatchTeam2Player2, setCreateMatchTeam2Player2] = useState("");
  const [creatingMatch, setCreatingMatch] = useState(false);
  const [createMatchError, setCreateMatchError] = useState<string | null>(null);
  const [createMatchSuccess, setCreateMatchSuccess] = useState<string | null>(
    null,
  );

  // Seed season id when seasons load.
  useEffect(() => {
    if (createMatchSeasonId || matchSeasons.length === 0) return;
    setCreateMatchSeasonId(String(matchSeasons[0]));
  }, [createMatchSeasonId, matchSeasons]);

  const handleCreateMatch = async () => {
    setCreatingMatch(true);
    setCreateMatchError(null);
    setCreateMatchSuccess(null);

    try {
      const selectedPlayerIds = [
        createMatchTeam1Player1,
        createMatchTeam1Player2,
        createMatchTeam2Player1,
        createMatchTeam2Player2,
      ];

      if (selectedPlayerIds.some((id) => !id)) {
        setCreateMatchError("All four player slots are required.");
        return;
      }

      if (new Set(selectedPlayerIds).size !== 4) {
        setCreateMatchError("All four players must be unique.");
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        setCreateMatchError("No active session found. Please sign in again.");
        return;
      }

      const response = await fetch("/api/admin/matches/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          seasonId: createMatchSeasonId
            ? Number.parseInt(createMatchSeasonId, 10)
            : null,
          dateLocal: createMatchDateLocal || null,
          timeLocal: createMatchTimeLocal || null,
          venue: createMatchVenue.trim() || null,
          type: createMatchType.trim() || null,
          team1: {
            player1Id: createMatchTeam1Player1,
            player2Id: createMatchTeam1Player2,
          },
          team2: {
            player1Id: createMatchTeam2Player1,
            player2Id: createMatchTeam2Player2,
          },
        }),
      });

      const result = (await response.json()) as {
        error?: string;
        details?: string[];
        match?: { match_id: number };
        message?: string;
      };

      if (!response.ok) {
        const details = result.details?.join(" ");
        setCreateMatchError(
          details || result.error || "Failed to create match.",
        );
        return;
      }

      setCreateMatchSeasonId(
        matchSeasons.length > 0 ? String(matchSeasons[0]) : "",
      );
      setCreateMatchDateLocal("");
      setCreateMatchTimeLocal("");
      setCreateMatchVenue("");
      setCreateMatchType("");
      setCreateMatchTeam1Player1("");
      setCreateMatchTeam1Player2("");
      setCreateMatchTeam2Player1("");
      setCreateMatchTeam2Player2("");
      setCreateMatchSuccess(
        result.message ||
          `Match #${result.match?.match_id ?? ""} created successfully.`,
      );
      onMatchScheduled();
    } catch {
      setCreateMatchError("Unexpected error while creating match.");
    } finally {
      setCreatingMatch(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-4 text-sm">
      <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
        Schedule a Match
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div>
          <label
            className="text-slate-500 dark:text-slate-400"
            htmlFor="create-match-season-id"
          >
            season_id:
          </label>
          <input
            id="create-match-season-id"
            type="number"
            value={createMatchSeasonId}
            onChange={(e) => setCreateMatchSeasonId(e.target.value)}
            list="create-match-season-options"
            className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
            placeholder={
              matchSeasonsLoading ? "Loading seasons..." : "Enter season id"
            }
          />
          <datalist id="create-match-season-options">
            {matchSeasons
              .slice()
              .sort((a, b) => b - a)
              .map((season) => (
                <option key={season} value={String(season)} />
              ))}
          </datalist>
        </div>
        <div>
          <label
            className="text-slate-500 dark:text-slate-400"
            htmlFor="create-match-date-local"
          >
            date_local:
          </label>
          <input
            id="create-match-date-local"
            type="date"
            value={createMatchDateLocal}
            onChange={(e) => setCreateMatchDateLocal(e.target.value)}
            className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
          />
        </div>
        <div>
          <label
            className="text-slate-500 dark:text-slate-400"
            htmlFor="create-match-time-local"
          >
            time_local:
          </label>
          <input
            id="create-match-time-local"
            type="time"
            value={createMatchTimeLocal}
            onChange={(e) => setCreateMatchTimeLocal(e.target.value)}
            className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
          />
        </div>
        <div>
          <label
            className="text-slate-500 dark:text-slate-400"
            htmlFor="create-match-venue"
          >
            venue:
          </label>
          <select
            id="create-match-venue"
            value={createMatchVenue}
            onChange={(e) => setCreateMatchVenue(e.target.value)}
            className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
          >
            <option value="">Select venue</option>
            {SCHEDULE_MATCH_VENUE_OPTIONS.map((venue) => (
              <option key={venue} value={venue}>
                {venue}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            className="text-slate-500 dark:text-slate-400"
            htmlFor="create-match-type"
          >
            type:
          </label>
          <select
            id="create-match-type"
            value={createMatchType}
            onChange={(e) => setCreateMatchType(e.target.value)}
            className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
          >
            <option value="">Select type</option>
            {SCHEDULE_MATCH_TYPE_OPTIONS.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
      </div>

      {matchSeasonsError && (
        <div className="text-sm text-rose-600 dark:text-rose-400">
          Error loading seasons: {matchSeasonsError}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-md bg-slate-50 dark:bg-slate-800/40 p-3 space-y-3">
          <div className="font-medium text-slate-900 dark:text-slate-100">
            Team 1
          </div>
          <div>
            <label
              className="text-slate-500 dark:text-slate-400"
              htmlFor="create-match-team1-player1"
            >
              player_1_id:
            </label>
            <select
              id="create-match-team1-player1"
              value={createMatchTeam1Player1}
              onChange={(e) => setCreateMatchTeam1Player1(e.target.value)}
              className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
            >
              <option value="">Select player</option>
              {players.map((player) => (
                <option key={player.player_id} value={player.player_id}>
                  {player.name} ({player.nickname})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              className="text-slate-500 dark:text-slate-400"
              htmlFor="create-match-team1-player2"
            >
              player_2_id:
            </label>
            <select
              id="create-match-team1-player2"
              value={createMatchTeam1Player2}
              onChange={(e) => setCreateMatchTeam1Player2(e.target.value)}
              className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
            >
              <option value="">Select player</option>
              {players.map((player) => (
                <option key={player.player_id} value={player.player_id}>
                  {player.name} ({player.nickname})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="rounded-md bg-slate-50 dark:bg-slate-800/40 p-3 space-y-3">
          <div className="font-medium text-slate-900 dark:text-slate-100">
            Team 2
          </div>
          <div>
            <label
              className="text-slate-500 dark:text-slate-400"
              htmlFor="create-match-team2-player1"
            >
              player_1_id:
            </label>
            <select
              id="create-match-team2-player1"
              value={createMatchTeam2Player1}
              onChange={(e) => setCreateMatchTeam2Player1(e.target.value)}
              className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
            >
              <option value="">Select player</option>
              {players.map((player) => (
                <option key={player.player_id} value={player.player_id}>
                  {player.name} ({player.nickname})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              className="text-slate-500 dark:text-slate-400"
              htmlFor="create-match-team2-player2"
            >
              player_2_id:
            </label>
            <select
              id="create-match-team2-player2"
              value={createMatchTeam2Player2}
              onChange={(e) => setCreateMatchTeam2Player2(e.target.value)}
              className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
            >
              <option value="">Select player</option>
              {players.map((player) => (
                <option key={player.player_id} value={player.player_id}>
                  {player.name} ({player.nickname})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

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

      {createMatchError && (
        <div className="rounded bg-rose-50 dark:bg-rose-900/20 px-2.5 py-2 text-rose-700 dark:text-rose-300">
          {createMatchError}
        </div>
      )}

      {createMatchSuccess && (
        <div className="rounded bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-2 text-emerald-700 dark:text-emerald-300">
          {createMatchSuccess}
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={() => void handleCreateMatch()}
          disabled={creatingMatch || playersLoading}
          className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {creatingMatch ? "Scheduling..." : "Schedule Match"}
        </button>
      </div>
    </div>
  );
}
