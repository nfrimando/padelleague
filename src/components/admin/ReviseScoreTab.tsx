"use client";

import { useEffect, useState } from "react";
import { useAdminDataContext } from "@/components/admin/AdminDataContext";
import { Modal } from "@/components/Modal";
import { supabase } from "@/lib/supabase";
import { useLoadedMatchDetails } from "@/lib/useLoadedMatchDetails";
import { useMatchRatingPreview } from "@/lib/useMatchRatingPreview";
import {
  ReviseableMatchOption,
  useReviseableMatches,
} from "@/lib/useReviseableMatches";

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

function toPriority(formulaName: unknown): number {
  const formula = String(formulaName || "").toLowerCase();
  return formula === "v3" ? 2 : formula === "v2" ? 1 : 0;
}

type CurrentRatingRow = {
  player_id: number;
  rating_pre: number;
  rating_post: number;
  result: "win" | "loss";
  formula_name: string;
};

function IconPencil() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-4 w-4"
    >
      <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
    </svg>
  );
}

export function ReviseScoreTab() {
  const { playerNameById } = useAdminDataContext();

  const { matches, loading: listLoading, error: listError } = useReviseableMatches({
    enabled: true,
  });

  const [refreshKey, setRefreshKey] = useState(0);
  const [target, setTarget] = useState<ReviseableMatchOption | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Form state
  const [set1T1, setSet1T1] = useState("");
  const [set1T2, setSet1T2] = useState("");
  const [set2T1, setSet2T1] = useState("");
  const [set2T2, setSet2T2] = useState("");
  const [set3T1, setSet3T1] = useState("");
  const [set3T2, setSet3T2] = useState("");
  const [calculated, setCalculated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  // Current ratings (fetched from DB for the selected match)
  const [currentRatings, setCurrentRatings] = useState<CurrentRatingRow[]>([]);
  const [currentRatingsLoading, setCurrentRatingsLoading] = useState(false);

  const matchId = target ? String(target.match_id) : "";

  const {
    loadedMatchDetails,
    loading: loadingDetails,
    error: detailsError,
  } = useLoadedMatchDetails({ matchId, enabled: !!target });

  const ratingPreview = useMatchRatingPreview({
    loadedMatchDetails,
    updateSet1Team1: set1T1,
    updateSet1Team2: set1T2,
    updateSet2Team1: set2T1,
    updateSet2Team2: set2T2,
    updateSet3Team1: set3T1,
    updateSet3Team2: set3T2,
  });
  const ratingPreviewError =
    ratingPreview && "error" in ratingPreview ? ratingPreview.error : null;
  const ratingPreviewWithRows =
    ratingPreview && "rows" in ratingPreview ? ratingPreview : null;

  // Pre-populate score inputs when match details load
  useEffect(() => {
    if (!loadedMatchDetails) return;
    const s = loadedMatchDetails.sets;
    setSet1T1(s[0] ? String(s[0].team_1_games) : "");
    setSet1T2(s[0] ? String(s[0].team_2_games) : "");
    setSet2T1(s[1] ? String(s[1].team_1_games) : "");
    setSet2T2(s[1] ? String(s[1].team_2_games) : "");
    setSet3T1(s[2] ? String(s[2].team_1_games) : "");
    setSet3T2(s[2] ? String(s[2].team_2_games) : "");
    setCalculated(false);
  }, [loadedMatchDetails]);

  // Fetch current ratings from DB for the selected match
  useEffect(() => {
    if (!target) {
      setCurrentRatings([]);
      return;
    }
    let cancelled = false;
    setCurrentRatingsLoading(true);

    const fetchCurrentRatings = async () => {
      const { data, error } = await supabase
        .from("match_player_ratings")
        .select("player_id, rating_pre, rating_post, result, formula_name")
        .eq("match_id", target.match_id);

      if (cancelled) return;

      if (error || !data) {
        setCurrentRatings([]);
        setCurrentRatingsLoading(false);
        return;
      }

      // For each player, keep only the highest-priority formula row
      const bestByPlayer = new Map<
        number,
        { row: CurrentRatingRow; priority: number }
      >();
      for (const row of data as Array<{
        player_id: number | null;
        rating_pre: number | null;
        rating_post: number | null;
        result: string | null;
        formula_name: string | null;
      }>) {
        const pid = typeof row.player_id === "number" ? row.player_id : null;
        const rPre = typeof row.rating_pre === "number" ? row.rating_pre : null;
        const rPost = typeof row.rating_post === "number" ? row.rating_post : null;
        if (pid === null || rPre === null || rPost === null) continue;
        if (row.result !== "win" && row.result !== "loss") continue;

        const priority = toPriority(row.formula_name);
        const existing = bestByPlayer.get(pid);
        if (!existing || priority >= existing.priority) {
          bestByPlayer.set(pid, {
            row: {
              player_id: pid,
              rating_pre: rPre,
              rating_post: rPost,
              result: row.result,
              formula_name: row.formula_name ?? "",
            },
            priority,
          });
        }
      }

      setCurrentRatings(Array.from(bestByPlayer.values()).map((v) => v.row));
      setCurrentRatingsLoading(false);
    };

    void fetchCurrentRatings();
    return () => {
      cancelled = true;
    };
  }, [target]);

  const resetForm = () => {
    setSet1T1("");
    setSet1T2("");
    setSet2T1("");
    setSet2T2("");
    setSet3T1("");
    setSet3T2("");
    setCalculated(false);
    setSubmitError(null);
    setSubmitSuccess(null);
    setCurrentRatings([]);
  };

  const openModal = (match: ReviseableMatchOption) => {
    resetForm();
    setTarget(match);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setTarget(null);
    resetForm();
  };

  const handlePreview = () => {
    setSubmitError(null);
    setSubmitSuccess(null);
    if (!loadedMatchDetails) {
      setCalculated(false);
      setSubmitError("Match details are still loading.");
      return;
    }
    if (ratingPreviewError || !ratingPreviewWithRows) {
      setCalculated(false);
      setSubmitError(
        ratingPreviewError || "Unable to calculate outcome from current set scores.",
      );
      return;
    }
    setCalculated(true);
  };

  const handleApply = async () => {
    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    try {
      if (!calculated || !ratingPreviewWithRows) {
        setSubmitError("Click Preview New Effect first.");
        return;
      }

      const parsedId = Number.parseInt(matchId, 10);
      if (!Number.isInteger(parsedId) || parsedId <= 0) {
        setSubmitError("Invalid match ID.");
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        setSubmitError("No active session. Please sign in again.");
        return;
      }

      const rawPairs = [
        { t1: set1T1, t2: set1T2 },
        { t1: set2T1, t2: set2T2 },
        { t1: set3T1, t2: set3T2 },
      ];

      const sets: Array<{ team1Games: number; team2Games: number }> = [];
      for (const pair of rawPairs) {
        const t1 = pair.t1.trim();
        const t2 = pair.t2.trim();
        if (!t1 && !t2) continue;
        if (!t1 || !t2) {
          setSubmitError("Each set row must have both team scores.");
          return;
        }
        const t1g = Number.parseInt(t1, 10);
        const t2g = Number.parseInt(t2, 10);
        if (
          !Number.isInteger(t1g) ||
          !Number.isInteger(t2g) ||
          t1g < 0 ||
          t2g < 0
        ) {
          setSubmitError("Set scores must be whole numbers >= 0.");
          return;
        }
        sets.push({ team1Games: t1g, team2Games: t2g });
      }

      if (sets.length === 0) {
        setSubmitError("At least one set score is required.");
        return;
      }

      let t1w = 0;
      let t2w = 0;
      for (const s of sets) {
        if (s.team1Games > s.team2Games) t1w++;
        else t2w++;
      }
      if (t1w === t2w) {
        setSubmitError("Set scores must produce a clear winner.");
        return;
      }

      const response = await fetch(`/api/admin/matches/${parsedId}/revise`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ sets }),
      });

      const result = (await response.json()) as {
        error?: string;
        details?: string[];
        message?: string;
      };

      if (!response.ok) {
        setSubmitError(
          result.details?.join(" ") || result.error || "Failed to revise match.",
        );
        return;
      }

      setSubmitSuccess(result.message || "Match score revised successfully.");
      setCalculated(false);
      // Refresh the list (re-mount the hook by bumping the key)
      setRefreshKey((k) => k + 1);
    } catch {
      setSubmitError("Unexpected error while applying revision.");
    } finally {
      setSubmitting(false);
    }
  };

  // Build a name lookup for current-ratings table
  const ratingPlayerName = (id: number) => {
    const details = loadedMatchDetails;
    if (details) {
      const all = [
        details.team1.player1,
        details.team1.player2,
        details.team2.player1,
        details.team2.player2,
      ];
      const found = all.find((p) => p?.player_id === id);
      if (found) return found.nickname || found.name || `#${id}`;
    }
    return playerNameById.get(String(id)) ?? `#${id}`;
  };

  const ratingPlayerTeam = (id: number): 1 | 2 | null => {
    const details = loadedMatchDetails;
    if (!details) return null;
    const t1 = [details.team1.player1?.player_id, details.team1.player2?.player_id];
    if (t1.includes(id)) return 1;
    return 2;
  };

  // The refreshKey is used as a key on the list section to force re-fetch
  void refreshKey;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Revise Score
        </h2>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Correct a completed match score and recalculate ratings in place.
        </p>
      </div>

      <div className="rounded-md border border-rose-200 dark:border-rose-800/40 bg-rose-50 dark:bg-rose-900/20 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
        <span className="font-semibold">Danger zone.</span> Only matches that are
        the latest completed match for all four involved players are listed here.
        Revising a score permanently updates sets, the winning team, and all four
        player ratings for this match.
      </div>

      {/* Eligible match list */}
      <section
        key={refreshKey}
        className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden"
      >
        <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
            Reviseable Matches
          </h3>
          {listLoading && (
            <span className="text-xs text-slate-400 dark:text-slate-500">
              Loading…
            </span>
          )}
        </div>

        {listError && (
          <p className="px-4 py-3 text-sm text-rose-500">{listError}</p>
        )}

        <div className="overflow-y-auto max-h-72 divide-y divide-slate-100 dark:divide-slate-800">
          {matches.map((match) => {
            const t1 = `${resolvePlayerName(match.team1Player1Id, playerNameById)} & ${resolvePlayerName(match.team1Player2Id, playerNameById)}`;
            const t2 = `${resolvePlayerName(match.team2Player1Id, playerNameById)} & ${resolvePlayerName(match.team2Player2Id, playerNameById)}`;
            const winnerLabel =
              match.winner_team === 1
                ? ` · Team 1 won`
                : match.winner_team === 2
                  ? ` · Team 2 won`
                  : "";
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
                  {winnerLabel}
                </span>
                <button
                  type="button"
                  onClick={() => openModal(match)}
                  title="Revise score"
                  className="shrink-0 rounded p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors focus:outline-none focus:ring-2 focus:ring-rose-500/40"
                >
                  <IconPencil />
                </button>
              </div>
            );
          })}
          {!listLoading && !listError && matches.length === 0 && (
            <p className="px-4 py-6 text-sm text-slate-400 dark:text-slate-500 text-center">
              No reviseable matches found. A match is eligible only when it is
              the latest completed match for all four involved players.
            </p>
          )}
        </div>
      </section>

      {/* Revise modal */}
      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={`Revise Match #${matchId}`}
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
                <span className={labelCls}>Date</span>
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {loadedMatchDetails.dateLocal ?? "—"}
                </span>
              </div>
              <div>
                <span className={labelCls}>Current Winner</span>
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {loadedMatchDetails.winnerTeam != null
                    ? `Team ${loadedMatchDetails.winnerTeam}`
                    : "—"}
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

          {/* Current ratings effect */}
          {(currentRatingsLoading || currentRatings.length > 0) && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-3">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                Current Ratings Effect
              </h3>
              {currentRatingsLoading ? (
                <p className="text-sm text-slate-400 dark:text-slate-500">
                  Loading…
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left">
                        <th className={`${labelCls} py-1 pr-3`}>Player</th>
                        <th className={`${labelCls} py-1 pr-3`}>Team</th>
                        <th className={`${labelCls} py-1 pr-3`}>Pre</th>
                        <th className={`${labelCls} py-1 pr-3`}>Post</th>
                        <th className={`${labelCls} py-1`}>Delta</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {currentRatings.map((row) => {
                        const delta = row.rating_post - row.rating_pre;
                        return (
                          <tr key={row.player_id}>
                            <td className="py-2 pr-3 text-slate-900 dark:text-slate-100">
                              {ratingPlayerName(row.player_id)}
                            </td>
                            <td className="py-2 pr-3 text-slate-600 dark:text-slate-400">
                              {ratingPlayerTeam(row.player_id) ?? "—"}
                            </td>
                            <td className="py-2 pr-3 text-slate-600 dark:text-slate-400 tabular-nums">
                              {row.rating_pre.toFixed(4)}
                            </td>
                            <td className="py-2 pr-3 text-slate-900 dark:text-slate-100 tabular-nums">
                              {row.rating_post.toFixed(4)}
                            </td>
                            <td
                              className={`py-2 tabular-nums font-medium ${
                                delta >= 0
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-rose-600 dark:text-rose-400"
                              }`}
                            >
                              {delta >= 0 ? "+" : ""}
                              {delta.toFixed(4)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* New score inputs */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-3">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
              Revised Score
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
                value={set1T1}
                onChange={(e) => {
                  setSet1T1(e.target.value);
                  setCalculated(false);
                }}
                className={inputCls}
                placeholder="0"
                min="0"
              />
              <input
                type="number"
                value={set1T2}
                onChange={(e) => {
                  setSet1T2(e.target.value);
                  setCalculated(false);
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
                value={set2T1}
                onChange={(e) => {
                  setSet2T1(e.target.value);
                  setCalculated(false);
                }}
                className={inputCls}
                placeholder="0"
                min="0"
              />
              <input
                type="number"
                value={set2T2}
                onChange={(e) => {
                  setSet2T2(e.target.value);
                  setCalculated(false);
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
                value={set3T1}
                onChange={(e) => {
                  setSet3T1(e.target.value);
                  setCalculated(false);
                }}
                className={inputCls}
                placeholder="0"
                min="0"
              />
              <input
                type="number"
                value={set3T2}
                onChange={(e) => {
                  setSet3T2(e.target.value);
                  setCalculated(false);
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
              onClick={handlePreview}
              disabled={!loadedMatchDetails || loadingDetails}
              className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              Preview New Effect
            </button>
          </div>

          {/* New ratings preview */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-3">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
              New Ratings Effect (preview)
            </h3>
            {!calculated ? (
              <p className="text-sm text-slate-400 dark:text-slate-500">
                Click Preview New Effect to see the updated rating impact.
              </p>
            ) : ratingPreviewError ? (
              <p className="text-sm text-slate-400 dark:text-slate-500">
                {ratingPreviewError}
              </p>
            ) : ratingPreviewWithRows ? (
              <div className="space-y-3">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  New winner: Team {ratingPreviewWithRows.winnerTeam}
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left">
                        <th className={`${labelCls} py-1 pr-3`}>Player</th>
                        <th className={`${labelCls} py-1 pr-3`}>Team</th>
                        <th className={`${labelCls} py-1 pr-3`}>Pre</th>
                        <th className={`${labelCls} py-1 pr-3`}>New Post</th>
                        <th className={`${labelCls} py-1`}>New Delta</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {ratingPreviewWithRows.rows.map((row) => (
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

          {/* Confirmation warning */}
          {calculated && ratingPreviewWithRows && (
            <div className="rounded-md border border-rose-200 dark:border-rose-800/40 bg-rose-50 dark:bg-rose-900/20 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
              Applying this revision will permanently update the match sets,
              winning team, and all four player ratings. This cannot be undone.
            </div>
          )}

          {submitError && (
            <div className="rounded-md border border-rose-200 dark:border-rose-800/40 bg-rose-50 dark:bg-rose-900/20 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
              {submitError}
            </div>
          )}
          {submitSuccess && (
            <div className="rounded-md border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
              {submitSuccess}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => void handleApply()}
              disabled={submitting || !calculated || !ratingPreviewWithRows}
              className="inline-flex items-center rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? "Applying…" : "Apply Revision"}
            </button>
            <button
              type="button"
              onClick={closeModal}
              disabled={submitting}
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
