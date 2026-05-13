"use client";

import { useEffect, useState } from "react";
import { useAdminDataContext } from "@/components/admin/AdminDataContext";
import { Modal } from "@/components/Modal";
import { supabase } from "@/lib/supabase";
import { useLoadedMatchDetails } from "@/lib/useLoadedMatchDetails";
import { useMatchRatingPreview } from "@/lib/useMatchRatingPreview";
import { ScheduledMatchOption } from "@/lib/useScheduledMatches";

const labelCls =
  "block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5";
const inputCls =
  "block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#00C8DC]/40";

function resolvePlayerName(
  id: number | null,
  nameById: Map<string, string>,
): string {
  if (!id) return "?";
  return nameById.get(String(id)) ?? `#${id}`;
}

function IconCheck() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-4 w-4"
    >
      <path
        fillRule="evenodd"
        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function CompleteMatchTab() {
  const {
    scheduledMatches,
    scheduledMatchesLoading,
    scheduledMatchesError,
    playerNameById,
    refreshScheduledMatches,
  } = useAdminDataContext();

  // Modal state
  const [completeTarget, setCompleteTarget] =
    useState<ScheduledMatchOption | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Form state
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

  const matchId = completeTarget ? String(completeTarget.match_id) : "";

  const {
    loadedMatchDetails,
    loading: loadingDetails,
    error: detailsError,
  } = useLoadedMatchDetails({ matchId, enabled: !!completeTarget });

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

  // Reset calculated state when target changes
  useEffect(() => {
    setCompleteMatchCalculated(false);
  }, [matchId]);

  const resetForm = () => {
    setUpdateSet1Team1("");
    setUpdateSet1Team2("");
    setUpdateSet2Team1("");
    setUpdateSet2Team2("");
    setUpdateSet3Team1("");
    setUpdateSet3Team2("");
    setCompleteMatchCalculated(false);
    setCompleteMatchError(null);
    setCompleteMatchSuccess(null);
  };

  const openModal = (match: ScheduledMatchOption) => {
    resetForm();
    setCompleteTarget(match);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setCompleteTarget(null);
    resetForm();
  };

  const handleCalculateOutcome = () => {
    setCompleteMatchError(null);
    setCompleteMatchSuccess(null);

    if (!loadedMatchDetails) {
      setCompleteMatchCalculated(false);
      setCompleteMatchError("Match details are still loading.");
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

      {/* Scheduled match list */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
            Scheduled Matches
          </h3>
          {scheduledMatchesLoading && (
            <span className="text-xs text-slate-400 dark:text-slate-500">
              Loading…
            </span>
          )}
        </div>
        {scheduledMatchesError && (
          <p className="px-4 py-3 text-sm text-rose-500">
            {scheduledMatchesError}
          </p>
        )}
        <div className="overflow-y-auto max-h-72 divide-y divide-slate-100 dark:divide-slate-800">
          {scheduledMatches.map((match) => {
            const t1 = `${resolvePlayerName(match.team1Player1Id, playerNameById)} & ${resolvePlayerName(match.team1Player2Id, playerNameById)}`;
            const t2 = `${resolvePlayerName(match.team2Player1Id, playerNameById)} & ${resolvePlayerName(match.team2Player2Id, playerNameById)}`;
            return (
              <div
                key={match.match_id}
                className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
              >
                <span className="shrink-0 w-10 font-mono text-xs font-bold text-slate-500 dark:text-slate-400">
                  #{match.match_id}
                </span>
                <span className="flex-1 min-w-0 text-sm text-slate-800 dark:text-slate-200 truncate">
                  {t1}{" "}
                  <span className="text-slate-400 dark:text-slate-500">vs</span>{" "}
                  {t2}
                </span>
                <span className="shrink-0 hidden sm:block text-xs text-slate-400 dark:text-slate-500 tabular-nums">
                  {match.date_local ?? "—"}
                  {match.type ? ` · ${match.type}` : ""}
                </span>
                <button
                  type="button"
                  onClick={() => openModal(match)}
                  title="Complete match"
                  className="shrink-0 rounded p-1.5 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                >
                  <IconCheck />
                </button>
              </div>
            );
          })}
          {!scheduledMatchesLoading &&
            !scheduledMatchesError &&
            scheduledMatches.length === 0 && (
              <p className="px-4 py-6 text-sm text-slate-400 dark:text-slate-500 text-center">
                No scheduled matches found.
              </p>
            )}
        </div>
      </section>

      {/* Complete match modal */}
      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={`Complete Match #${matchId}`}
        maxWidth="lg"
      >
        <div className="space-y-5">
          {loadingDetails && (
            <p className="text-sm text-slate-400 dark:text-slate-500">
              Loading match details…
            </p>
          )}
          {detailsError && (
            <p className="text-sm text-rose-500">{detailsError}</p>
          )}

          {/* Match summary */}
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

          {/* Set scores */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-3">
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
          </div>

          <div>
            <button
              type="button"
              onClick={handleCalculateOutcome}
              disabled={!loadedMatchDetails || loadingDetails}
              className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              Calculate Outcome
            </button>
          </div>

          {/* Rating preview */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-3">
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
          </div>

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

          <div className="flex gap-3 pt-1">
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
            <button
              type="button"
              onClick={closeModal}
              disabled={completingMatch}
              className="inline-flex items-center rounded-md border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
