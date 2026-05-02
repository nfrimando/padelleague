"use client";

import { useEffect, useState } from "react";
import { useAdminDataContext } from "@/components/admin/AdminDataContext";
import { supabase } from "@/lib/supabase";
import { useLoadedMatchDetails } from "@/lib/useLoadedMatchDetails";
import { useMatchRatingPreview } from "@/lib/useMatchRatingPreview";

export function CompleteMatchTab() {
  const {
    scheduledMatches,
    scheduledMatchesLoading,
    scheduledMatchesError,
    playerNameById,
    refreshScheduledMatches,
  } = useAdminDataContext();
  const [matchId, setMatchId] = useState("");
  const [updateSet1Team1, setUpdateSet1Team1] = useState("");
  const [updateSet1Team2, setUpdateSet1Team2] = useState("");
  const [updateSet2Team1, setUpdateSet2Team1] = useState("");
  const [updateSet2Team2, setUpdateSet2Team2] = useState("");
  const [updateSet3Team1, setUpdateSet3Team1] = useState("");
  const [updateSet3Team2, setUpdateSet3Team2] = useState("");
  const [completingMatch, setCompletingMatch] = useState(false);
  const [completeMatchError, setCompleteMatchError] = useState<string | null>(
    null,
  );
  const [completeMatchSuccess, setCompleteMatchSuccess] = useState<
    string | null
  >(null);
  const [completeMatchCalculated, setCompleteMatchCalculated] = useState(false);

  const {
    loadedMatchDetails,
    loading: loadingDetails,
    error: detailsError,
  } = useLoadedMatchDetails({ matchId, enabled: true });

  const ratingPreview = useMatchRatingPreview({
    loadedMatchDetails,
    updateSet1Team1,
    updateSet1Team2,
    updateSet2Team1,
    updateSet2Team2,
    updateSet3Team1,
    updateSet3Team2,
  });
  const ratingPreviewError =
    ratingPreview && "error" in ratingPreview ? ratingPreview.error : null;
  const ratingPreviewWithRows =
    ratingPreview && "rows" in ratingPreview ? ratingPreview : null;
  const ratingPreviewRows = ratingPreviewWithRows?.rows ?? [];

  const winnerTeamDisplay =
    (completeMatchCalculated ? ratingPreviewWithRows?.winnerTeam : null) ??
    loadedMatchDetails?.winnerTeam;

  // Reset calculated flag when selection changes.
  useEffect(() => {
    setCompleteMatchCalculated(false);
  }, [matchId]);

  // Guard: clear selection if match no longer appears in the scheduled list.
  useEffect(() => {
    if (
      matchId &&
      !scheduledMatches.some((m) => String(m.match_id) === matchId)
    ) {
      setMatchId("");
    }
  }, [scheduledMatches, matchId]);

  const handleCalculateOutcome = () => {
    setCompleteMatchError(null);
    setCompleteMatchSuccess(null);

    if (!loadedMatchDetails) {
      setCompleteMatchCalculated(false);
      setCompleteMatchError("Select a scheduled match first.");
      return;
    }

    if (ratingPreviewError || !ratingPreviewWithRows) {
      setCompleteMatchCalculated(false);
      setCompleteMatchError(
        ratingPreviewError ||
          "Unable to calculate outcome from current set scores.",
      );
      return;
    }

    setCompleteMatchCalculated(true);
  };

  const handleCompleteMatch = async () => {
    setCompletingMatch(true);
    setCompleteMatchError(null);
    setCompleteMatchSuccess(null);

    try {
      if (!completeMatchCalculated) {
        setCompleteMatchError(
          "Click Calculate Outcome first before completing the match.",
        );
        return;
      }

      if (!ratingPreviewWithRows) {
        setCompleteMatchError(
          ratingPreviewError ||
            "Unable to complete. Please calculate outcome again.",
        );
        return;
      }

      const parsedId = Number.parseInt(matchId, 10);
      if (!Number.isInteger(parsedId) || parsedId <= 0) {
        setCompleteMatchError("match_id must be a positive integer.");
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        setCompleteMatchError("No active session found. Please sign in again.");
        return;
      }

      const rawSetPairs = [
        { team1: updateSet1Team1, team2: updateSet1Team2 },
        { team1: updateSet2Team1, team2: updateSet2Team2 },
        { team1: updateSet3Team1, team2: updateSet3Team2 },
      ];

      const sets: Array<{ team1Games: number; team2Games: number }> = [];
      for (const pair of rawSetPairs) {
        const t1 = pair.team1.trim();
        const t2 = pair.team2.trim();
        if (!t1 && !t2) continue;
        if (!t1 || !t2) {
          setCompleteMatchError("Each set row must have both team scores.");
          return;
        }
        const t1Games = Number.parseInt(t1, 10);
        const t2Games = Number.parseInt(t2, 10);
        if (
          !Number.isInteger(t1Games) ||
          !Number.isInteger(t2Games) ||
          t1Games < 0 ||
          t2Games < 0
        ) {
          setCompleteMatchError("Set scores must be whole numbers >= 0.");
          return;
        }
        sets.push({ team1Games: t1Games, team2Games: t2Games });
      }

      if (sets.length === 0) {
        setCompleteMatchError(
          "At least one set score is required for completed matches.",
        );
        return;
      }

      let team1SetsWon = 0;
      let team2SetsWon = 0;
      for (const set of sets) {
        if (set.team1Games > set.team2Games) team1SetsWon += 1;
        else team2SetsWon += 1;
      }
      if (team1SetsWon === team2SetsWon) {
        setCompleteMatchError(
          "Set scores must produce a clear winner (no tied sets won).",
        );
        return;
      }

      const response = await fetch(`/api/admin/matches/${parsedId}/update`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ status: "completed", sets }),
      });

      const result = (await response.json()) as {
        error?: string;
        details?: string[];
        message?: string;
      };

      if (!response.ok) {
        const details = result.details?.join(" ");
        setCompleteMatchError(
          details || result.error || "Failed to update match.",
        );
        return;
      }

      setUpdateSet1Team1("");
      setUpdateSet1Team2("");
      setUpdateSet2Team1("");
      setUpdateSet2Team2("");
      setUpdateSet3Team1("");
      setUpdateSet3Team2("");
      setCompleteMatchCalculated(false);
      setCompleteMatchSuccess(
        result.message || "Match completed successfully.",
      );
      refreshScheduledMatches();
    } catch {
      setCompleteMatchError("Unexpected error while completing match.");
    } finally {
      setCompletingMatch(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-4 text-sm">
      <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
        Complete Match
      </div>

      <div className="rounded bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-amber-800 dark:text-amber-300">
        Note that rating changes are dependent on when matches are inputted as
        completed. Make sure to input matches chronologicaly especially when
        updating matches with similar players.
      </div>

      <div>
        <label
          className="text-slate-500 dark:text-slate-400"
          htmlFor="complete-match-select"
        >
          Scheduled match:
        </label>
        <select
          id="complete-match-select"
          value={matchId}
          onChange={(e) => {
            setMatchId(e.target.value);
            setCompleteMatchCalculated(false);
          }}
          className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
        >
          <option value="">Select a scheduled match</option>
          {scheduledMatches.map((match) => {
            const datePart = match.date_local || "No date";
            const timePart = match.time_local || "No time";
            const typePart = match.type || "No type";
            const venuePart = match.venue || "No venue";
            const t1 = `${
              (match.team1Player1Id &&
                playerNameById.get(String(match.team1Player1Id))) ||
              (match.team1Player1Id ? `#${match.team1Player1Id}` : "?")
            } / ${
              (match.team1Player2Id &&
                playerNameById.get(String(match.team1Player2Id))) ||
              (match.team1Player2Id ? `#${match.team1Player2Id}` : "?")
            }`;
            const t2 = `${
              (match.team2Player1Id &&
                playerNameById.get(String(match.team2Player1Id))) ||
              (match.team2Player1Id ? `#${match.team2Player1Id}` : "?")
            } / ${
              (match.team2Player2Id &&
                playerNameById.get(String(match.team2Player2Id))) ||
              (match.team2Player2Id ? `#${match.team2Player2Id}` : "?")
            }`;
            return (
              <option key={match.match_id} value={String(match.match_id)}>
                #{match.match_id} - {t1} vs {t2} - {datePart} {timePart} -{" "}
                {typePart} - {venuePart}
              </option>
            );
          })}
        </select>
      </div>

      {scheduledMatchesLoading && (
        <div className="rounded bg-slate-50 dark:bg-slate-800/40 px-3 py-2 text-slate-600 dark:text-slate-300">
          Loading scheduled matches...
        </div>
      )}

      {scheduledMatchesError && (
        <div className="rounded bg-rose-50 dark:bg-rose-900/20 px-3 py-2 text-rose-700 dark:text-rose-300">
          {scheduledMatchesError}
        </div>
      )}

      {!scheduledMatchesLoading &&
        !scheduledMatchesError &&
        scheduledMatches.length === 0 && (
          <div className="rounded bg-slate-50 dark:bg-slate-800/40 px-3 py-2 text-slate-600 dark:text-slate-300">
            No scheduled matches found.
          </div>
        )}

      {loadingDetails && (
        <div className="rounded bg-slate-50 dark:bg-slate-800/40 px-3 py-2 text-slate-600 dark:text-slate-300">
          Loading match details...
        </div>
      )}

      {detailsError && (
        <div className="rounded bg-rose-50 dark:bg-rose-900/20 px-3 py-2 text-rose-700 dark:text-rose-300">
          {detailsError}
        </div>
      )}

      {loadedMatchDetails && (
        <div className="rounded-md bg-slate-50 dark:bg-slate-800/40 p-3 space-y-3">
          <div className="font-medium text-slate-900 dark:text-slate-100">
            Match Details
          </div>
          <div className="grid gap-3 xl:grid-cols-4 text-sm">
            <div>
              <span className="text-slate-500 dark:text-slate-400">
                current status:
              </span>{" "}
              <span className="font-medium text-slate-900 dark:text-slate-100">
                {loadedMatchDetails.status}
              </span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">
                winner_team:
              </span>{" "}
              <span className="font-medium text-slate-900 dark:text-slate-100">
                {winnerTeamDisplay ?? "N/A"}
              </span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">
                team 1:
              </span>{" "}
              <span className="font-medium text-slate-900 dark:text-slate-100">
                {loadedMatchDetails.team1.player1?.nickname ||
                  loadedMatchDetails.team1.player1?.name ||
                  "?"}
                {" / "}
                {loadedMatchDetails.team1.player2?.nickname ||
                  loadedMatchDetails.team1.player2?.name ||
                  "?"}
              </span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">
                team 2:
              </span>{" "}
              <span className="font-medium text-slate-900 dark:text-slate-100">
                {loadedMatchDetails.team2.player1?.nickname ||
                  loadedMatchDetails.team2.player1?.name ||
                  "?"}
                {" / "}
                {loadedMatchDetails.team2.player2?.nickname ||
                  loadedMatchDetails.team2.player2?.name ||
                  "?"}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-md bg-slate-50 dark:bg-slate-800/40 p-3 space-y-3">
        <div className="font-medium text-slate-900 dark:text-slate-100">
          Set Scores
        </div>
        <div className="grid gap-3 xl:grid-cols-3">
          <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Set 1
          </div>
          <input
            type="number"
            value={updateSet1Team1}
            onChange={(e) => {
              setUpdateSet1Team1(e.target.value);
              setCompleteMatchCalculated(false);
            }}
            className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
            placeholder="Team 1 games"
          />
          <input
            type="number"
            value={updateSet1Team2}
            onChange={(e) => {
              setUpdateSet1Team2(e.target.value);
              setCompleteMatchCalculated(false);
            }}
            className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
            placeholder="Team 2 games"
          />

          <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Set 2
          </div>
          <input
            type="number"
            value={updateSet2Team1}
            onChange={(e) => {
              setUpdateSet2Team1(e.target.value);
              setCompleteMatchCalculated(false);
            }}
            className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
            placeholder="Team 1 games"
          />
          <input
            type="number"
            value={updateSet2Team2}
            onChange={(e) => {
              setUpdateSet2Team2(e.target.value);
              setCompleteMatchCalculated(false);
            }}
            className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
            placeholder="Team 2 games"
          />

          <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Set 3 (optional)
          </div>
          <input
            type="number"
            value={updateSet3Team1}
            onChange={(e) => {
              setUpdateSet3Team1(e.target.value);
              setCompleteMatchCalculated(false);
            }}
            className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
            placeholder="Team 1 games"
          />
          <input
            type="number"
            value={updateSet3Team2}
            onChange={(e) => {
              setUpdateSet3Team2(e.target.value);
              setCompleteMatchCalculated(false);
            }}
            className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
            placeholder="Team 2 games"
          />
        </div>
      </div>

      <div>
        <button
          type="button"
          onClick={handleCalculateOutcome}
          disabled={!loadedMatchDetails}
          className="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          Calculate Outcome
        </button>
      </div>

      <div className="rounded-md border border-slate-200 dark:border-slate-700 p-3 space-y-3">
        <div className="font-medium text-slate-900 dark:text-slate-100">
          Rating Effect Preview (v3)
        </div>

        {!completeMatchCalculated ? (
          <div className="text-sm text-slate-500 dark:text-slate-400">
            Click Calculate Outcome to preview winner and rating changes.
          </div>
        ) : !loadedMatchDetails ? (
          <div className="text-sm text-slate-500 dark:text-slate-400">
            Enter a valid match_id to preview ratings.
          </div>
        ) : ratingPreviewError ? (
          <div className="text-sm text-slate-500 dark:text-slate-400">
            {ratingPreviewError}
          </div>
        ) : ratingPreviewWithRows ? (
          <div className="space-y-2">
            <div className="text-sm text-slate-600 dark:text-slate-300">
              Winner preview: Team {ratingPreviewWithRows.winnerTeam}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 dark:text-slate-400">
                    <th className="py-1 pr-3">Player</th>
                    <th className="py-1 pr-3">Team</th>
                    <th className="py-1 pr-3">Before</th>
                    <th className="py-1 pr-3">After</th>
                    <th className="py-1">Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {ratingPreviewRows.map((row) => (
                    <tr key={row.player.player_id}>
                      <td className="py-1 pr-3 text-slate-900 dark:text-slate-100">
                        {row.player.nickname ||
                          row.player.name ||
                          row.player.player_id}
                      </td>
                      <td className="py-1 pr-3 text-slate-700 dark:text-slate-300">
                        {row.team}
                      </td>
                      <td className="py-1 pr-3 text-slate-700 dark:text-slate-300">
                        {row.before.toFixed(4)}
                      </td>
                      <td className="py-1 pr-3 text-slate-900 dark:text-slate-100">
                        {row.after.toFixed(4)}
                      </td>
                      <td
                        className={`py-1 ${
                          row.delta >= 0
                            ? "text-emerald-700 dark:text-emerald-300"
                            : "text-rose-700 dark:text-rose-300"
                        }`}
                      >
                        {row.delta >= 0 ? "+" : ""}
                        {row.delta.toFixed(4)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>

      {completeMatchError && (
        <div className="rounded bg-rose-50 dark:bg-rose-900/20 px-2.5 py-2 text-rose-700 dark:text-rose-300">
          {completeMatchError}
        </div>
      )}

      {completeMatchSuccess && (
        <div className="rounded bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-2 text-emerald-700 dark:text-emerald-300">
          {completeMatchSuccess}
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={() => void handleCompleteMatch()}
          disabled={
            completingMatch ||
            !completeMatchCalculated ||
            !ratingPreviewWithRows
          }
          className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {completingMatch ? "Completing..." : "Complete Match"}
        </button>
      </div>
    </div>
  );
}
