"use client";

import { useEffect, useState } from "react";
import { useAdminDataContext } from "@/components/admin/AdminDataContext";
import { supabase } from "@/lib/supabase";
import { useLoadedMatchDetails } from "@/lib/useLoadedMatchDetails";
import {
  SCHEDULE_MATCH_TYPE_OPTIONS,
  SCHEDULE_MATCH_VENUE_OPTIONS,
  UPDATE_MATCH_STATUS_OPTIONS,
  MatchStatusValue,
} from "./constants";

const labelCls =
  "block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5";
const inputCls =
  "block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#00C8DC]/40";

export function UpdateMatchTab() {
  const { players, matchSeasons, matchSeasonsLoading, matchSeasonsError } =
    useAdminDataContext();
  const [matchId, setMatchId] = useState("");
  const [updateMatchStatus, setUpdateMatchStatus] =
    useState<MatchStatusValue>("scheduled");
  const [updateMatchSeasonId, setUpdateMatchSeasonId] = useState("");
  const [updateMatchDateLocal, setUpdateMatchDateLocal] = useState("");
  const [updateMatchTimeLocal, setUpdateMatchTimeLocal] = useState("");
  const [updateMatchVenue, setUpdateMatchVenue] = useState("");
  const [updateMatchType, setUpdateMatchType] = useState("");
  const [updateMatchTeam1Player1, setUpdateMatchTeam1Player1] = useState("");
  const [updateMatchTeam1Player2, setUpdateMatchTeam1Player2] = useState("");
  const [updateMatchTeam2Player1, setUpdateMatchTeam2Player1] = useState("");
  const [updateMatchTeam2Player2, setUpdateMatchTeam2Player2] = useState("");
  const [updatingMatch, setUpdatingMatch] = useState(false);
  const [updateMatchError, setUpdateMatchError] = useState<string | null>(null);
  const [updateMatchSuccess, setUpdateMatchSuccess] = useState<string | null>(
    null,
  );

  const {
    loadedMatchDetails,
    loading: loadingDetails,
    error: detailsError,
  } = useLoadedMatchDetails({ matchId, enabled: true });

  useEffect(() => {
    const parsedId = Number.parseInt(matchId, 10);
    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      setUpdateMatchTeam1Player1("");
      setUpdateMatchTeam1Player2("");
      setUpdateMatchTeam2Player1("");
      setUpdateMatchTeam2Player2("");
    }
  }, [matchId]);

  useEffect(() => {
    if (!loadedMatchDetails) return;
    const { team1, team2, sets } = loadedMatchDetails;
    setUpdateMatchStatus(loadedMatchDetails.status);
    setUpdateMatchSeasonId(
      loadedMatchDetails.eventId ? String(loadedMatchDetails.eventId) : "",
    );
    setUpdateMatchDateLocal(loadedMatchDetails.dateLocal || "");
    setUpdateMatchTimeLocal(loadedMatchDetails.timeLocal || "");
    setUpdateMatchVenue(loadedMatchDetails.venue || "");
    setUpdateMatchType(loadedMatchDetails.type || "");
    setUpdateMatchTeam1Player1(
      team1.player1 ? String(team1.player1.player_id) : "",
    );
    setUpdateMatchTeam1Player2(
      team1.player2 ? String(team1.player2.player_id) : "",
    );
    setUpdateMatchTeam2Player1(
      team2.player1 ? String(team2.player1.player_id) : "",
    );
    setUpdateMatchTeam2Player2(
      team2.player2 ? String(team2.player2.player_id) : "",
    );
    void sets;
  }, [loadedMatchDetails]);

  const resolvedTeam1P1 =
    updateMatchTeam1Player1 ||
    (loadedMatchDetails?.team1.player1
      ? String(loadedMatchDetails.team1.player1.player_id)
      : "");
  const resolvedTeam1P2 =
    updateMatchTeam1Player2 ||
    (loadedMatchDetails?.team1.player2
      ? String(loadedMatchDetails.team1.player2.player_id)
      : "");
  const resolvedTeam2P1 =
    updateMatchTeam2Player1 ||
    (loadedMatchDetails?.team2.player1
      ? String(loadedMatchDetails.team2.player1.player_id)
      : "");
  const resolvedTeam2P2 =
    updateMatchTeam2Player2 ||
    (loadedMatchDetails?.team2.player2
      ? String(loadedMatchDetails.team2.player2.player_id)
      : "");

  const handleUpdateMatch = async () => {
    setUpdatingMatch(true);
    setUpdateMatchError(null);
    setUpdateMatchSuccess(null);

    try {
      const parsedId = Number.parseInt(matchId, 10);
      if (!Number.isInteger(parsedId) || parsedId <= 0) {
        setUpdateMatchError("Invalid match ID.");
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        setUpdateMatchError("No active session found. Please sign in again.");
        return;
      }

      const payload: Record<string, unknown> = {
        status: updateMatchStatus,
      };

      const participantInputs = [
        resolvedTeam1P1.trim(),
        resolvedTeam1P2.trim(),
        resolvedTeam2P1.trim(),
        resolvedTeam2P2.trim(),
      ];
      const hasAnyParticipantInput = participantInputs.some(Boolean);

      if (hasAnyParticipantInput) {
        if (participantInputs.some((value) => !value)) {
          setUpdateMatchError("All four participant player IDs are required.");
          return;
        }

        const parsedParticipantIds = participantInputs.map((value) =>
          Number.parseInt(value, 10),
        );

        if (
          parsedParticipantIds.some(
            (playerId) => !Number.isInteger(playerId) || playerId <= 0,
          )
        ) {
          setUpdateMatchError(
            "Participant player IDs must be positive integers.",
          );
          return;
        }

        if (new Set(parsedParticipantIds).size !== 4) {
          setUpdateMatchError("All four participants must be unique.");
          return;
        }

        const teamsResponse = await fetch(
          `/api/admin/matches/${parsedId}/teams`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              team1: {
                player1Id: parsedParticipantIds[0],
                player2Id: parsedParticipantIds[1],
                setsWon: loadedMatchDetails?.team1SetsWon ?? null,
              },
              team2: {
                player1Id: parsedParticipantIds[2],
                player2Id: parsedParticipantIds[3],
                setsWon: loadedMatchDetails?.team2SetsWon ?? null,
              },
            }),
          },
        );

        const teamsResult = (await teamsResponse.json()) as {
          error?: string;
          details?: string[];
        };

        if (!teamsResponse.ok) {
          setUpdateMatchError(
            teamsResult.details?.join(" ") ||
              teamsResult.error ||
              "Failed to update match participants.",
          );
          return;
        }
      }

      if (updateMatchSeasonId.trim()) {
        const seasonId = Number.parseInt(updateMatchSeasonId.trim(), 10);
        if (!Number.isInteger(seasonId) || seasonId <= 0) {
          setUpdateMatchError("Invalid event ID.");
          return;
        }
        payload.eventId = seasonId;
      }

      if (updateMatchDateLocal) payload.dateLocal = updateMatchDateLocal;
      if (updateMatchTimeLocal) payload.timeLocal = updateMatchTimeLocal;
      if (updateMatchVenue.trim()) payload.venue = updateMatchVenue.trim();
      if (updateMatchType.trim()) payload.type = updateMatchType.trim();

      const response = await fetch(`/api/admin/matches/${parsedId}/update`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });

      const result = (await response.json()) as {
        error?: string;
        details?: string[];
        message?: string;
      };

      if (!response.ok) {
        setUpdateMatchError(
          result.details?.join(" ") ||
            result.error ||
            "Failed to update match.",
        );
        return;
      }

      setUpdateMatchSuccess(result.message || "Match updated successfully.");
    } catch {
      setUpdateMatchError("Unexpected error while updating match.");
    } finally {
      setUpdatingMatch(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Update Match
        </h2>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Edit status, details, or reassign players for a match by ID.
        </p>
      </div>

      {/* Match ID + Status */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-4">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Match
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="update-match-id">
              Match ID
            </label>
            <input
              id="update-match-id"
              type="number"
              value={matchId}
              onChange={(e) => setMatchId(e.target.value)}
              className={inputCls}
              placeholder="e.g. 15"
            />
          </div>

          <div>
            <label className={labelCls} htmlFor="update-match-status">
              Status
            </label>
            <select
              id="update-match-status"
              value={updateMatchStatus}
              onChange={(e) =>
                setUpdateMatchStatus(e.target.value as MatchStatusValue)
              }
              disabled={loadingDetails}
              className={`${inputCls} ${
                loadingDetails
                  ? "opacity-60 cursor-not-allowed"
                  : ""
              }`}
            >
              {updateMatchStatus === "completed" && (
                <option value="completed" disabled>
                  completed (set via Complete Match tab)
                </option>
              )}
              {UPDATE_MATCH_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loadingDetails && (
          <p className="text-sm text-slate-400 dark:text-slate-500">
            Loading match details…
          </p>
        )}
        {detailsError && (
          <p className="text-sm text-rose-500">{detailsError}</p>
        )}

        {loadedMatchDetails && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 rounded-md bg-slate-50 dark:bg-slate-800/40 p-3 text-sm">
            <div>
              <span className={labelCls}>Status</span>
              <span className="font-medium text-slate-900 dark:text-slate-100">
                {loadedMatchDetails.status}
              </span>
            </div>
            <div>
              <span className={labelCls}>Winner</span>
              <span className="font-medium text-slate-900 dark:text-slate-100">
                {loadedMatchDetails.winnerTeam != null
                  ? `Team ${loadedMatchDetails.winnerTeam}`
                  : "N/A"}
              </span>
            </div>
            <div>
              <span className={labelCls}>Team 1</span>
              <span className="font-medium text-slate-900 dark:text-slate-100">
                {loadedMatchDetails.team1.player1?.nickname ||
                  loadedMatchDetails.team1.player1?.name ||
                  "?"}{" "}
                /{" "}
                {loadedMatchDetails.team1.player2?.nickname ||
                  loadedMatchDetails.team1.player2?.name ||
                  "?"}
              </span>
            </div>
            <div>
              <span className={labelCls}>Team 2</span>
              <span className="font-medium text-slate-900 dark:text-slate-100">
                {loadedMatchDetails.team2.player1?.nickname ||
                  loadedMatchDetails.team2.player1?.name ||
                  "?"}{" "}
                /{" "}
                {loadedMatchDetails.team2.player2?.nickname ||
                  loadedMatchDetails.team2.player2?.name ||
                  "?"}
              </span>
            </div>
          </div>
        )}
      </section>

      {/* Editable fields */}
      <fieldset
        disabled={loadingDetails}
        className={`rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-4 transition-opacity ${
          loadingDetails ? "opacity-60" : ""
        }`}
      >
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Edit Fields
        </h3>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={labelCls} htmlFor="update-match-season-id">
              Event
            </label>
            <select
              id="update-match-season-id"
              value={updateMatchSeasonId}
              onChange={(e) => setUpdateMatchSeasonId(e.target.value)}
              className={inputCls}
            >
              <option value="">Keep existing</option>
              {matchSeasons
                .slice()
                .sort((a, b) => b.id - a.id)
                .map((season) => (
                  <option key={season.id} value={String(season.id)}>
                    {season.label}
                  </option>
                ))}
            </select>
            {matchSeasonsLoading && (
              <p className="mt-1 text-xs text-slate-400">Loading events…</p>
            )}
            {matchSeasonsError && (
              <p className="mt-1 text-xs text-rose-500">{matchSeasonsError}</p>
            )}
          </div>

          <div>
            <label className={labelCls} htmlFor="update-match-date-local">
              Date
            </label>
            <input
              id="update-match-date-local"
              type="date"
              value={updateMatchDateLocal}
              onChange={(e) => setUpdateMatchDateLocal(e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls} htmlFor="update-match-time-local">
              Time
            </label>
            <input
              id="update-match-time-local"
              type="time"
              value={updateMatchTimeLocal}
              onChange={(e) => setUpdateMatchTimeLocal(e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls} htmlFor="update-match-type">
              Match Type
            </label>
            <select
              id="update-match-type"
              value={updateMatchType}
              onChange={(e) => setUpdateMatchType(e.target.value)}
              className={inputCls}
            >
              <option value="">Keep existing</option>
              {SCHEDULE_MATCH_TYPE_OPTIONS.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-2">
            <label className={labelCls} htmlFor="update-match-venue">
              Venue
            </label>
            <select
              id="update-match-venue"
              value={updateMatchVenue}
              onChange={(e) => setUpdateMatchVenue(e.target.value)}
              className={inputCls}
            >
              <option value="">Keep existing</option>
              {SCHEDULE_MATCH_VENUE_OPTIONS.map((venue) => (
                <option key={venue} value={venue}>
                  {venue}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Players */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-md bg-slate-50 dark:bg-slate-800/40 p-3 space-y-3">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
              Team 1
            </h4>
            <div>
              <label
                className={labelCls}
                htmlFor="update-match-team1-player1"
              >
                Player 1
              </label>
              <select
                id="update-match-team1-player1"
                value={resolvedTeam1P1}
                onChange={(e) => setUpdateMatchTeam1Player1(e.target.value)}
                className={inputCls}
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
                className={labelCls}
                htmlFor="update-match-team1-player2"
              >
                Player 2
              </label>
              <select
                id="update-match-team1-player2"
                value={resolvedTeam1P2}
                onChange={(e) => setUpdateMatchTeam1Player2(e.target.value)}
                className={inputCls}
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
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
              Team 2
            </h4>
            <div>
              <label
                className={labelCls}
                htmlFor="update-match-team2-player1"
              >
                Player 1
              </label>
              <select
                id="update-match-team2-player1"
                value={resolvedTeam2P1}
                onChange={(e) => setUpdateMatchTeam2Player1(e.target.value)}
                className={inputCls}
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
                className={labelCls}
                htmlFor="update-match-team2-player2"
              >
                Player 2
              </label>
              <select
                id="update-match-team2-player2"
                value={resolvedTeam2P2}
                onChange={(e) => setUpdateMatchTeam2Player2(e.target.value)}
                className={inputCls}
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
      </fieldset>

      {/* Feedback */}
      {updateMatchError && (
        <div className="rounded-md border border-rose-200 dark:border-rose-800/40 bg-rose-50 dark:bg-rose-900/20 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
          {updateMatchError}
        </div>
      )}
      {updateMatchSuccess && (
        <div className="rounded-md border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          {updateMatchSuccess}
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={() => void handleUpdateMatch()}
          disabled={updatingMatch || loadingDetails}
          className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {updatingMatch ? "Updating…" : "Update Match"}
        </button>
      </div>
    </div>
  );
}
