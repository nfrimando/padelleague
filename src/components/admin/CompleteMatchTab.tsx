"use client";

import { useEffect, useState } from "react";
import { useAdminDataContext } from "@/components/admin/AdminDataContext";
import { supabase } from "@/lib/supabase";
import { useLoadedMatchDetails } from "@/lib/useLoadedMatchDetails";
import { useMatchRatingPreview } from "@/lib/useMatchRatingPreview";

const labelCls =
  "block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5";
const inputCls =
  "block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#00C8DC]/40";

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

  useEffect(() => {
    setCompleteMatchCalculated(false);
  }, [matchId]);

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
        setCompleteMatchError("Invalid match ID.");
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
        setCompleteMatchError(
          result.details?.join(" ") ||
            result.error ||
            "Failed to update match.",
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
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Complete Match
        </h2>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Enter set scores for a scheduled match and finalise ratings.
        </p>
      </div>

      <div className="rounded-md border border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
        Enter matches in chronological order. Rating changes depend on the order
        matches are completed, especially for players who share multiple matches.
      </div>

      {/* Match selector */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-4">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Select Match
        </h3>
        <div>
          <label className={labelCls} htmlFor="complete-match-select">
            Scheduled Match
          </label>
          <select
            id="complete-match-select"
            value={matchId}
            onChange={(e) => {
              setMatchId(e.target.value);
              setCompleteMatchCalculated(false);
            }}
            className={inputCls}
          >
            <option value="">Select a scheduled match</option>
            {scheduledMatches.map((match) => {
              const datePart = match.date_local || "No date";
              const typePart = match.type || "No type";
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
                  #{match.match_id} · {t1} vs {t2} · {datePart} · {typePart}
                </option>
              );
            })}
          </select>
        </div>

        {scheduledMatchesLoading && (
          <p className="text-sm text-slate-400 dark:text-slate-500">
            Loading scheduled matches…
          </p>
        )}
        {scheduledMatchesError && (
          <p className="text-sm text-rose-500">{scheduledMatchesError}</p>
        )}
        {!scheduledMatchesLoading &&
          !scheduledMatchesError &&
          scheduledMatches.length === 0 && (
            <p className="text-sm text-slate-400 dark:text-slate-500">
              No scheduled matches found.
            </p>
          )}
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
                {winnerTeamDisplay != null
                  ? `Team ${winnerTeamDisplay}`
                  : "TBD"}
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

      {/* Set Scores */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-3">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Set Scores
        </h3>
        <div className="grid grid-cols-3 gap-3">
          <div />
          <div className={labelCls}>Team 1</div>
          <div className={labelCls}>Team 2</div>

          <div className="flex items-center text-sm text-slate-500 dark:text-slate-400">
            Set 1
          </div>
          <input
            type="number"
            value={updateSet1Team1}
            onChange={(e) => {
              setUpdateSet1Team1(e.target.value);
              setCompleteMatchCalculated(false);
            }}
            className={inputCls}
            placeholder="0"
            min="0"
          />
          <input
            type="number"
            value={updateSet1Team2}
            onChange={(e) => {
              setUpdateSet1Team2(e.target.value);
              setCompleteMatchCalculated(false);
            }}
            className={inputCls}
            placeholder="0"
            min="0"
          />

          <div className="flex items-center text-sm text-slate-500 dark:text-slate-400">
            Set 2
          </div>
          <input
            type="number"
            value={updateSet2Team1}
            onChange={(e) => {
              setUpdateSet2Team1(e.target.value);
              setCompleteMatchCalculated(false);
            }}
            className={inputCls}
            placeholder="0"
            min="0"
          />
          <input
            type="number"
            value={updateSet2Team2}
            onChange={(e) => {
              setUpdateSet2Team2(e.target.value);
              setCompleteMatchCalculated(false);
            }}
            className={inputCls}
            placeholder="0"
            min="0"
          />

          <div className="flex items-center text-sm text-slate-500 dark:text-slate-400">
            Set 3{" "}
            <span className="ml-1 text-xs text-slate-400">(optional)</span>
          </div>
          <input
            type="number"
            value={updateSet3Team1}
            onChange={(e) => {
              setUpdateSet3Team1(e.target.value);
              setCompleteMatchCalculated(false);
            }}
            className={inputCls}
            placeholder="0"
            min="0"
          />
          <input
            type="number"
            value={updateSet3Team2}
            onChange={(e) => {
              setUpdateSet3Team2(e.target.value);
              setCompleteMatchCalculated(false);
            }}
            className={inputCls}
            placeholder="0"
            min="0"
          />
        </div>
      </section>

      <div>
        <button
          type="button"
          onClick={handleCalculateOutcome}
          disabled={!loadedMatchDetails}
          className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          Calculate Outcome
        </button>
      </div>

      {/* Rating preview */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-3">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Rating Effect Preview (v3)
        </h3>

        {!completeMatchCalculated ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">
            Click Calculate Outcome to preview winner and rating changes.
          </p>
        ) : !loadedMatchDetails ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">
            Select a valid match to preview ratings.
          </p>
        ) : ratingPreviewError ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">
            {ratingPreviewError}
          </p>
        ) : ratingPreviewWithRows ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Winner: Team {ratingPreviewWithRows.winnerTeam}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left">
                    <th className={`${labelCls} py-1 pr-3`}>Player</th>
                    <th className={`${labelCls} py-1 pr-3`}>Team</th>
                    <th className={`${labelCls} py-1 pr-3`}>Before</th>
                    <th className={`${labelCls} py-1 pr-3`}>After</th>
                    <th className={`${labelCls} py-1`}>Delta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {ratingPreviewRows.map((row) => (
                    <tr key={row.player.player_id}>
                      <td className="py-2 pr-3 text-slate-900 dark:text-slate-100">
                        {row.player.nickname ||
                          row.player.name ||
                          row.player.player_id}
                      </td>
                      <td className="py-2 pr-3 text-slate-600 dark:text-slate-400">
                        {row.team}
                      </td>
                      <td className="py-2 pr-3 text-slate-600 dark:text-slate-400 tabular-nums">
                        {row.before.toFixed(4)}
                      </td>
                      <td className="py-2 pr-3 text-slate-900 dark:text-slate-100 tabular-nums">
                        {row.after.toFixed(4)}
                      </td>
                      <td
                        className={`py-2 tabular-nums font-medium ${
                          row.delta >= 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-rose-600 dark:text-rose-400"
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
      </section>

      {/* Feedback */}
      {completeMatchError && (
        <div className="rounded-md border border-rose-200 dark:border-rose-800/40 bg-rose-50 dark:bg-rose-900/20 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
          {completeMatchError}
        </div>
      )}
      {completeMatchSuccess && (
        <div className="rounded-md border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
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
          className="inline-flex items-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {completingMatch ? "Completing…" : "Complete Match"}
        </button>
      </div>
    </div>
  );
}
