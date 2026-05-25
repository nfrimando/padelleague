"use client";

import { useEffect, useState } from "react";
import { useAdminDataContext } from "@/components/admin/AdminDataContext";
import { Modal } from "@/components/Modal";
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

type MatchListRow = {
  match_id: number;
  date_local: string | null;
  type: string | null;
  status: string;
  team1p1Id: number | null;
  team1p2Id: number | null;
  team2p1Id: number | null;
  team2p2Id: number | null;
};

const PAGE_SIZE = 20;

const STATUS_CLS: Record<string, string> = {
  scheduled:
    "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  cancelled:
    "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  completed:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
};

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

function IconTrash() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-4 w-4"
    >
      <path
        fillRule="evenodd"
        d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function UpdateMatchTab() {
  const {
    players,
    matchSeasons,
    matchSeasonsLoading,
    matchSeasonsError,
    playerNameById,
  } = useAdminDataContext();

  // List state
  const [listRows, setListRows] = useState<MatchListRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [listRefreshKey, setListRefreshKey] = useState(0);
  const [onlyScheduled, setOnlyScheduled] = useState(true);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  type EmailNotifResult = {
    sent: Array<{ player_id: number; displayName: string }>;
    skipped: Array<{ player_id: number; displayName: string; reason: string }>;
  } | null;

  // Edit modal state
  const [editMatchId, setEditMatchId] = useState("");
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [updateMatchStatus, setUpdateMatchStatus] =
    useState<MatchStatusValue>("scheduled");
  const [updateMatchSeasonId, setUpdateMatchSeasonId] = useState("");
  const [updateMatchDateLocal, setUpdateMatchDateLocal] = useState("");
  const [updateMatchTimeLocal, setUpdateMatchTimeLocal] = useState("");
  const [updateMatchVenue, setUpdateMatchVenue] = useState("");
  const [updateMatchType, setUpdateMatchType] = useState("");
  const [updateMatchYoutubeLink, setUpdateMatchYoutubeLink] = useState("");
  const [updateMatchTeam1Player1, setUpdateMatchTeam1Player1] = useState("");
  const [updateMatchTeam1Player2, setUpdateMatchTeam1Player2] = useState("");
  const [updateMatchTeam2Player1, setUpdateMatchTeam2Player1] = useState("");
  const [updateMatchTeam2Player2, setUpdateMatchTeam2Player2] = useState("");
  const [updatingMatch, setUpdatingMatch] = useState(false);
  const [updateMatchError, setUpdateMatchError] = useState<string | null>(null);
  const [updateMatchSuccess, setUpdateMatchSuccess] = useState<string | null>(
    null,
  );
  const [updateEmailResult, setUpdateEmailResult] = useState<EmailNotifResult>(null);

  // Forfeit confirmation modal state
  const [forfeitModalOpen, setForfeitModalOpen] = useState(false);
  const [forfeitWinnerTeam, setForfeitWinnerTeam] = useState<1 | 2 | null>(null);
  const [forfeitResult, setForfeitResult] = useState<{
    matchId: number;
    winnerTeam: 1 | 2;
    setsWon: { team1: number; team2: number };
    emails: EmailNotifResult;
  } | null>(null);

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<MatchListRow | null>(null);
  const [deletingMatch, setDeletingMatch] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function fetchPage(
    pageOffset: number,
    append: boolean,
    signal: { cancelled: boolean },
  ) {
    const statuses = onlyScheduled
      ? ["scheduled"]
      : ["scheduled", "cancelled", "completed"];

    const { data: matchData, error: matchErr } = await supabase
      .from("matches")
      .select("match_id,date_local,type,status")
      .in("status", statuses)
      .order("match_id", { ascending: false })
      .range(pageOffset, pageOffset + PAGE_SIZE - 1);

    if (signal.cancelled) return;
    if (matchErr) {
      setListError(matchErr.message || "Failed to load matches.");
      setListLoading(false);
      setLoadingMore(false);
      return;
    }

    const baseRows = (matchData ?? []) as Array<{
      match_id: number;
      date_local: string | null;
      type: string | null;
      status: string;
    }>;
    const matchIds = baseRows.map((r) => r.match_id);

    let assembled: MatchListRow[] = [];

    if (matchIds.length > 0) {
      const { data: teamData } = await supabase
        .from("match_teams")
        .select("match_id,team_number,player_1_id,player_2_id")
        .in("match_id", matchIds);

      if (signal.cancelled) return;

      const teamMap = new Map<
        number,
        {
          t1p1: number | null;
          t1p2: number | null;
          t2p1: number | null;
          t2p2: number | null;
        }
      >();
      for (const t of teamData ?? []) {
        const e = teamMap.get(t.match_id) ?? {
          t1p1: null,
          t1p2: null,
          t2p1: null,
          t2p2: null,
        };
        if (t.team_number === 1) {
          e.t1p1 = t.player_1_id;
          e.t1p2 = t.player_2_id;
        }
        if (t.team_number === 2) {
          e.t2p1 = t.player_1_id;
          e.t2p2 = t.player_2_id;
        }
        teamMap.set(t.match_id, e);
      }

      assembled = baseRows.map((r) => {
        const t = teamMap.get(r.match_id);
        return {
          match_id: r.match_id,
          date_local: r.date_local,
          type: r.type,
          status: r.status,
          team1p1Id: t?.t1p1 ?? null,
          team1p2Id: t?.t1p2 ?? null,
          team2p1Id: t?.t2p1 ?? null,
          team2p2Id: t?.t2p2 ?? null,
        };
      });
    }

    setHasMore(baseRows.length === PAGE_SIZE);
    setOffset(pageOffset + baseRows.length);
    if (append) {
      setListRows((prev) => [...prev, ...assembled]);
    } else {
      setListRows(assembled);
    }
    setListLoading(false);
    setLoadingMore(false);
  }

  useEffect(() => {
    const signal = { cancelled: false };
    setListLoading(true);
    setListError(null);
    setOffset(0);
    setHasMore(false);
    void fetchPage(0, false, signal);
    return () => {
      signal.cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listRefreshKey, onlyScheduled]);

  const loadMore = () => {
    const signal = { cancelled: false };
    setLoadingMore(true);
    void fetchPage(offset, true, signal);
  };

  const {
    loadedMatchDetails,
    loading: loadingDetails,
    error: detailsError,
  } = useLoadedMatchDetails({ matchId: editMatchId, enabled: !!editMatchId });

  useEffect(() => {
    const parsedId = Number.parseInt(editMatchId, 10);
    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      setUpdateMatchTeam1Player1("");
      setUpdateMatchTeam1Player2("");
      setUpdateMatchTeam2Player1("");
      setUpdateMatchTeam2Player2("");
    }
  }, [editMatchId]);

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
    setUpdateMatchYoutubeLink(loadedMatchDetails.youtubeLink || "");
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

  const openEditModal = (row: MatchListRow) => {
    setEditMatchId(String(row.match_id));
    setUpdateMatchError(null);
    setUpdateMatchSuccess(null);
    setUpdateEmailResult(null);
    setEditModalOpen(true);
  };

  const closeEditModal = () => {
    setEditModalOpen(false);
    setEditMatchId("");
    setUpdateMatchError(null);
    setUpdateMatchSuccess(null);
    setUpdateEmailResult(null);
    setForfeitResult(null);
  };

  const handleUpdateMatch = async (confirmedForfeitWinner?: 1 | 2) => {
    if (updateMatchStatus === "forfeit" && confirmedForfeitWinner === undefined) {
      setForfeitWinnerTeam(null);
      setForfeitModalOpen(true);
      return;
    }

    setUpdatingMatch(true);
    setUpdateMatchError(null);
    setUpdateMatchSuccess(null);
    setUpdateEmailResult(null);

    try {
      const parsedId = Number.parseInt(editMatchId, 10);
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
      } else {
        payload.eventId = null;
      }

      payload.dateLocal = updateMatchDateLocal || null;
      payload.timeLocal = updateMatchTimeLocal || null;
      payload.venue = updateMatchVenue.trim() || null;
      payload.type = updateMatchType.trim() || null;
      payload.youtubeLink = updateMatchYoutubeLink.trim() || null;

      if (updateMatchStatus === "forfeit" && confirmedForfeitWinner != null) {
        payload.forfeitWinnerTeam = confirmedForfeitWinner;
      }

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
        winnerTeam?: 1 | 2;
        setsWon?: { team1: number; team2: number };
        emails?: EmailNotifResult;
      };

      if (!response.ok) {
        setUpdateMatchError(
          result.details?.join(" ") ||
            result.error ||
            "Failed to update match.",
        );
        return;
      }

      if (updateMatchStatus === "forfeit" && result.winnerTeam && result.setsWon) {
        setForfeitResult({
          matchId: parsedId,
          winnerTeam: result.winnerTeam,
          setsWon: result.setsWon,
          emails: result.emails ?? null,
        });
      } else {
        setUpdateMatchSuccess(result.message || "Match updated successfully.");
        setUpdateEmailResult(result.emails ?? null);
      }
      setForfeitModalOpen(false);
      setListRefreshKey((k) => k + 1);
    } catch {
      setUpdateMatchError("Unexpected error while updating match.");
    } finally {
      setUpdatingMatch(false);
    }
  };

  const handleDeleteMatch = async () => {
    if (!deleteTarget) return;
    setDeletingMatch(true);
    setDeleteError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        setDeleteError("No active session found. Please sign in again.");
        return;
      }

      const response = await fetch(
        `/api/admin/matches/${deleteTarget.match_id}/delete`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );

      const result = (await response.json()) as {
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        setDeleteError(result.error || "Failed to delete match.");
        return;
      }

      setDeleteTarget(null);
      setListRefreshKey((k) => k + 1);
      // If the deleted match was open in the edit modal, close it
      if (editMatchId === String(deleteTarget.match_id)) {
        closeEditModal();
      }
    } catch {
      setDeleteError("Unexpected error while deleting match.");
    } finally {
      setDeletingMatch(false);
    }
  };

  const forfeitTeam1Name = `${resolvePlayerName(Number(resolvedTeam1P1) || null, playerNameById)} & ${resolvePlayerName(Number(resolvedTeam1P2) || null, playerNameById)}`;
  const forfeitTeam2Name = `${resolvePlayerName(Number(resolvedTeam2P1) || null, playerNameById)} & ${resolvePlayerName(Number(resolvedTeam2P2) || null, playerNameById)}`;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Update Match
        </h2>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Edit scheduled, cancelled, and completed matches.
        </p>
      </div>

      {/* Match list */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between gap-4">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 shrink-0">
            Matches
          </h3>
          <div className="flex items-center gap-2 ml-auto">
            {listLoading && (
              <span className="text-xs text-slate-400 dark:text-slate-500">
                Loading…
              </span>
            )}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                Only scheduled
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={onlyScheduled}
                onClick={() => setOnlyScheduled((v) => !v)}
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#00C8DC]/40 ${
                  onlyScheduled
                    ? "bg-[#00C8DC]"
                    : "bg-slate-300 dark:bg-slate-600"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                    onlyScheduled ? "translate-x-4" : "translate-x-1"
                  }`}
                />
              </button>
            </label>
          </div>
        </div>
        {listError && (
          <p className="px-4 py-3 text-sm text-rose-500">{listError}</p>
        )}
        <div className="overflow-y-auto max-h-72 divide-y divide-slate-100 dark:divide-slate-800">
          {listRows.map((row) => {
            const t1 = `${resolvePlayerName(row.team1p1Id, playerNameById)} & ${resolvePlayerName(row.team1p2Id, playerNameById)}`;
            const t2 = `${resolvePlayerName(row.team2p1Id, playerNameById)} & ${resolvePlayerName(row.team2p2Id, playerNameById)}`;
            const statusCls =
              STATUS_CLS[row.status] ??
              "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400";
            return (
              <div
                key={row.match_id}
                className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
              >
                <span className="shrink-0 w-10 font-mono text-xs font-bold text-slate-500 dark:text-slate-400">
                  #{row.match_id}
                </span>
                <span className="flex-1 min-w-0 text-sm text-slate-800 dark:text-slate-200 truncate">
                  {t1}{" "}
                  <span className="text-slate-400 dark:text-slate-500">vs</span>{" "}
                  {t2}
                </span>
                <span className="shrink-0 hidden sm:block text-xs text-slate-400 dark:text-slate-500 tabular-nums">
                  {row.date_local ?? "—"}
                  {row.type ? ` · ${row.type}` : ""}
                </span>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusCls}`}
                >
                  {row.status}
                </span>
                <div className="shrink-0 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openEditModal(row)}
                    title="Edit match"
                    className="rounded p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors focus:outline-none focus:ring-2 focus:ring-[#00C8DC]/40"
                  >
                    <IconPencil />
                  </button>
                  {row.status !== "completed" && (
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteTarget(row);
                        setDeleteError(null);
                      }}
                      title="Delete match"
                      className="rounded p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors focus:outline-none focus:ring-2 focus:ring-rose-500/40"
                    >
                      <IconTrash />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {!listLoading && listRows.length === 0 && !listError && (
            <p className="px-4 py-6 text-sm text-slate-400 dark:text-slate-500 text-center">
              No matches found.
            </p>
          )}
          {hasMore && !listLoading && (
            <div className="px-4 py-3 flex justify-center border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-50 transition-colors"
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Edit modal */}
      <Modal
        isOpen={editModalOpen}
        onClose={closeEditModal}
        title={`Edit Match #${editMatchId}`}
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

          {/* Current match summary */}
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

          <fieldset
            disabled={loadingDetails}
            className={`space-y-4 transition-opacity ${loadingDetails ? "opacity-60" : ""}`}
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                  className={inputCls}
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
                  <option value="">No event</option>
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
                  <p className="mt-1 text-xs text-slate-400">
                    Loading events…
                  </p>
                )}
                {matchSeasonsError && (
                  <p className="mt-1 text-xs text-rose-500">
                    {matchSeasonsError}
                  </p>
                )}
              </div>

              <div>
                <label
                  className={labelCls}
                  htmlFor="update-match-date-local"
                >
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
                <label
                  className={labelCls}
                  htmlFor="update-match-time-local"
                >
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
                  <option value="">No type</option>
                  {SCHEDULE_MATCH_TYPE_OPTIONS.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelCls} htmlFor="update-match-venue">
                  Venue
                </label>
                <select
                  id="update-match-venue"
                  value={updateMatchVenue}
                  onChange={(e) => setUpdateMatchVenue(e.target.value)}
                  className={inputCls}
                >
                  <option value="">No venue</option>
                  {SCHEDULE_MATCH_VENUE_OPTIONS.map((venue) => (
                    <option key={venue} value={venue}>
                      {venue}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className={labelCls} htmlFor="update-match-youtube-link">
                  YouTube Link (optional)
                </label>
                <input
                  id="update-match-youtube-link"
                  type="url"
                  value={updateMatchYoutubeLink}
                  onChange={(e) => setUpdateMatchYoutubeLink(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className={inputCls}
                />
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
                    onChange={(e) =>
                      setUpdateMatchTeam1Player1(e.target.value)
                    }
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
                    onChange={(e) =>
                      setUpdateMatchTeam1Player2(e.target.value)
                    }
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
                    onChange={(e) =>
                      setUpdateMatchTeam2Player1(e.target.value)
                    }
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
                    onChange={(e) =>
                      setUpdateMatchTeam2Player2(e.target.value)
                    }
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

          {updateMatchError && (
            <div className="rounded-md border border-rose-200 dark:border-rose-800/40 bg-rose-50 dark:bg-rose-900/20 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
              {updateMatchError}
            </div>
          )}
          {updateMatchSuccess && (
            <div className="rounded-md border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300 space-y-2">
              <p className="font-medium">{updateMatchSuccess}</p>
              {updateEmailResult && (
                <div className="pt-1 border-t border-emerald-200 dark:border-emerald-800/40">
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mb-1.5">
                    Emails: {updateEmailResult.sent.length} / {updateEmailResult.sent.length + updateEmailResult.skipped.length} sent
                  </p>
                  <ul className="space-y-0.5">
                    {updateEmailResult.sent.map((p) => (
                      <li key={p.player_id} className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300">
                        <span className="text-emerald-500">✓</span>
                        <span>{p.displayName}</span>
                      </li>
                    ))}
                    {updateEmailResult.skipped.map((p) => (
                      <li key={p.player_id} className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <span className="text-rose-400">✗</span>
                        <span>{p.displayName}</span>
                        <span className="text-slate-400 dark:text-slate-500">
                          — {p.reason === "no_email" ? "no email on file" : p.reason === "unsubscribed" ? "unsubscribed" : "opted out"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          {forfeitResult && (
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-900/20 p-4 space-y-3">
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                Match #{forfeitResult.matchId} recorded as forfeit — Team{" "}
                {forfeitResult.winnerTeam} wins (
                {forfeitResult.setsWon.team1}–{forfeitResult.setsWon.team2} sets)
              </p>
              <ul className="space-y-1.5">
                <li className="flex items-center gap-2.5 text-sm text-emerald-700 dark:text-emerald-400">
                  <span className="shrink-0 text-emerald-500 dark:text-emerald-400"><IconCheck /></span>
                  <code className="text-xs font-mono text-slate-600 dark:text-slate-300 w-36 shrink-0">matches</code>
                  <span className="text-slate-500 dark:text-slate-400">status → forfeit</span>
                </li>
                <li className="flex items-center gap-2.5 text-sm text-emerald-700 dark:text-emerald-400">
                  <span className="shrink-0 text-emerald-500 dark:text-emerald-400"><IconCheck /></span>
                  <code className="text-xs font-mono text-slate-600 dark:text-slate-300 w-36 shrink-0">match_sets</code>
                  <span className="text-slate-500 dark:text-slate-400">2 sets recorded (6-0 6-0)</span>
                </li>
                <li className="flex items-center gap-2.5 text-sm text-emerald-700 dark:text-emerald-400">
                  <span className="shrink-0 text-emerald-500 dark:text-emerald-400"><IconCheck /></span>
                  <code className="text-xs font-mono text-slate-600 dark:text-slate-300 w-36 shrink-0">match_teams</code>
                  <span className="text-slate-500 dark:text-slate-400">sets_won updated</span>
                </li>
                {forfeitResult.emails && (
                  <li className="flex items-start gap-2.5 text-sm">
                    <span className="shrink-0 text-slate-400 mt-0.5">✉</span>
                    <div className="min-w-0">
                      <span className="text-xs font-mono text-slate-600 dark:text-slate-300">emails</span>
                      <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
                        {forfeitResult.emails.sent.length} / {forfeitResult.emails.sent.length + forfeitResult.emails.skipped.length} sent
                      </span>
                      <ul className="mt-1 space-y-0.5">
                        {forfeitResult.emails.sent.map((p) => (
                          <li key={p.player_id} className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300">
                            <span className="text-emerald-500">✓</span>
                            <span>{p.displayName}</span>
                          </li>
                        ))}
                        {forfeitResult.emails.skipped.map((p) => (
                          <li key={p.player_id} className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                            <span className="text-rose-400">✗</span>
                            <span>{p.displayName}</span>
                            <span className="text-slate-400 dark:text-slate-500">
                              — {p.reason === "no_email" ? "no email on file" : p.reason === "unsubscribed" ? "unsubscribed" : "opted out"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </li>
                )}
              </ul>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => void handleUpdateMatch(undefined)}
              disabled={updatingMatch || loadingDetails}
              className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {updatingMatch ? "Updating…" : "Update Match"}
            </button>
            <button
              type="button"
              onClick={closeEditModal}
              disabled={updatingMatch}
              className="inline-flex items-center rounded-md border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* Forfeit confirmation modal */}
      <Modal
        isOpen={forfeitModalOpen}
        onClose={() => setForfeitModalOpen(false)}
        title="Confirm Forfeit"
        maxWidth="sm"
      >
        <div className="space-y-4">
          <div className="rounded-md border border-amber-800/40 bg-amber-900/20 px-3 py-2.5 text-sm text-amber-300 space-y-1">
            <p className="font-semibold">What happens when confirmed:</p>
            <ul className="text-xs text-amber-200/80 space-y-0.5 list-disc list-inside">
              <li>6-0 6-0 sets are recorded for the winning team</li>
              <li>Ratings are not recalculated</li>
              <li>Predictions will not be resolved — no rewards granted</li>
            </ul>
          </div>

          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">
              Which team won?
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setForfeitWinnerTeam(1)}
                className={`rounded-md border px-3 py-2.5 text-sm font-medium transition-colors text-left ${
                  forfeitWinnerTeam === 1
                    ? "border-sky-500/60 bg-sky-900/30 text-sky-300"
                    : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600"
                }`}
              >
                <span className="text-[10px] font-bold uppercase tracking-widest text-sky-500 block mb-0.5">Team 1</span>
                {forfeitTeam1Name}
              </button>
              <button
                type="button"
                onClick={() => setForfeitWinnerTeam(2)}
                className={`rounded-md border px-3 py-2.5 text-sm font-medium transition-colors text-left ${
                  forfeitWinnerTeam === 2
                    ? "border-amber-500/60 bg-amber-900/30 text-amber-300"
                    : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600"
                }`}
              >
                <span className="text-[10px] font-bold uppercase tracking-widest text-amber-500 block mb-0.5">Team 2</span>
                {forfeitTeam2Name}
              </button>
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => {
                if (forfeitWinnerTeam == null) return;
                void handleUpdateMatch(forfeitWinnerTeam);
              }}
              disabled={forfeitWinnerTeam == null || updatingMatch}
              className="flex-1 rounded-md bg-amber-700 px-3 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {updatingMatch ? "Updating…" : "Confirm Forfeit"}
            </button>
            <button
              type="button"
              onClick={() => setForfeitModalOpen(false)}
              disabled={updatingMatch}
              className="flex-1 rounded-md border border-slate-700 px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-60 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => {
          setDeleteTarget(null);
          setDeleteError(null);
        }}
        title={`Delete Match #${deleteTarget?.match_id ?? ""}?`}
        maxWidth="sm"
      >
        <div className="space-y-4">
          {deleteTarget && (
            <div className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
              <p className="font-medium text-slate-800 dark:text-slate-200">
                {resolvePlayerName(deleteTarget.team1p1Id, playerNameById)} &{" "}
                {resolvePlayerName(deleteTarget.team1p2Id, playerNameById)}
                {" "}
                <span className="text-slate-400">vs</span>{" "}
                {resolvePlayerName(deleteTarget.team2p1Id, playerNameById)} &{" "}
                {resolvePlayerName(deleteTarget.team2p2Id, playerNameById)}
              </p>
              {deleteTarget.date_local && (
                <p className="text-slate-500">
                  {deleteTarget.date_local}
                  {deleteTarget.type ? ` · ${deleteTarget.type}` : ""}
                </p>
              )}
              <p className="mt-2 text-slate-500">
                This action cannot be undone.
              </p>
            </div>
          )}

          {deleteError && (
            <p className="text-sm text-rose-600 dark:text-rose-400">
              {deleteError}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => void handleDeleteMatch()}
              disabled={deletingMatch}
              className="flex-1 rounded-md bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60 transition-colors"
            >
              {deletingMatch ? "Deleting…" : "Delete"}
            </button>
            <button
              type="button"
              onClick={() => {
                setDeleteTarget(null);
                setDeleteError(null);
              }}
              disabled={deletingMatch}
              className="flex-1 rounded-md border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
