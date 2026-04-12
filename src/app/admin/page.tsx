"use client";

import { useEffect, useState } from "react";
import BackToHome from "@/components/BackToHome";
import PlayerSearchBox from "@/components/PlayerSearchBox";
import { supabase } from "@/lib/supabase";
import { Player } from "@/lib/types";
import { usePlayerSearch } from "@/lib/usePlayerSearch";
import { usePlayers } from "@/lib/usePlayers";

const ADMIN_PLAYER_TABS = [
  { value: "CREATE", label: "Create Player" },
  { value: "EDIT", label: "Edit Player" },
  { value: "CREATE_MATCH", label: "Schedule a Match" },
  { value: "UPDATE_MATCH", label: "Update Match" },
] as const;
const MATCH_STATUS_OPTIONS = [
  "completed",
  "scheduled",
  "forfeit",
  "cancelled",
] as const;
const AUTH_BOX_CLASS =
  "w-full md:w-[24rem] md:max-w-[24rem] min-h-[188px] mx-auto rounded-lg border border-slate-200 dark:border-slate-700 p-4";

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activePlayerTab, setActivePlayerTab] =
    useState<(typeof ADMIN_PLAYER_TABS)[number]["value"]>("CREATE");
  const [search, setSearch] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [editName, setEditName] = useState("");
  const [editNickname, setEditNickname] = useState("");
  const [editImageLink, setEditImageLink] = useState("");
  const [createName, setCreateName] = useState("");
  const [createNickname, setCreateNickname] = useState("");
  const [createImageLink, setCreateImageLink] = useState("");
  const [savingPlayer, setSavingPlayer] = useState(false);
  const [savePlayerError, setSavePlayerError] = useState<string | null>(null);
  const [savePlayerSuccess, setSavePlayerSuccess] = useState<string | null>(
    null,
  );
  const [creatingPlayer, setCreatingPlayer] = useState(false);
  const [createPlayerError, setCreatePlayerError] = useState<string | null>(
    null,
  );
  const [createPlayerSuccess, setCreatePlayerSuccess] = useState<string | null>(
    null,
  );
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
  const [updateMatchId, setUpdateMatchId] = useState("");
  const [updateMatchStatus, setUpdateMatchStatus] =
    useState<(typeof MATCH_STATUS_OPTIONS)[number]>("completed");
  const [updateMatchSeasonId, setUpdateMatchSeasonId] = useState("");
  const [updateMatchDateLocal, setUpdateMatchDateLocal] = useState("");
  const [updateMatchTimeLocal, setUpdateMatchTimeLocal] = useState("");
  const [updateMatchVenue, setUpdateMatchVenue] = useState("");
  const [updateMatchType, setUpdateMatchType] = useState("");
  const [updateSet1Team1, setUpdateSet1Team1] = useState("");
  const [updateSet1Team2, setUpdateSet1Team2] = useState("");
  const [updateSet2Team1, setUpdateSet2Team1] = useState("");
  const [updateSet2Team2, setUpdateSet2Team2] = useState("");
  const [updateSet3Team1, setUpdateSet3Team1] = useState("");
  const [updateSet3Team2, setUpdateSet3Team2] = useState("");
  const [updatingMatch, setUpdatingMatch] = useState(false);
  const [updateMatchError, setUpdateMatchError] = useState<string | null>(null);
  const [updateMatchSuccess, setUpdateMatchSuccess] = useState<string | null>(
    null,
  );
  const {
    players,
    setPlayers,
    loading: playersLoading,
    error: playersError,
  } = usePlayers({ enabled: isAdmin, orderByName: true });
  const filtered = usePlayerSearch(players, search);

  useEffect(() => {
    let isMounted = true;

    async function resolveAdminStatus(userId: string | undefined) {
      if (!userId) {
        return false;
      }

      const { data, error } = await supabase
        .from("admin_users")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        return false;
      }

      return !!data;
    }

    async function initSession() {
      const { data } = await supabase.auth.getUser();

      if (!isMounted) {
        return;
      }

      const nextEmail = data.user?.email ?? null;
      const nextAvatarUrl =
        (data.user?.user_metadata?.picture as string | undefined) ||
        (data.user?.user_metadata?.avatar_url as string | undefined) ||
        null;
      const nextIsAdmin = await resolveAdminStatus(data.user?.id);

      if (!isMounted) {
        return;
      }

      setEmail(nextEmail);
      setAvatarUrl(nextAvatarUrl);
      setIsAdmin(nextIsAdmin);
      setLoading(false);
    }

    initSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void (async () => {
        if (!isMounted) {
          return;
        }

        const nextEmail = session?.user?.email ?? null;
        const nextAvatarUrl =
          (session?.user?.user_metadata?.picture as string | undefined) ||
          (session?.user?.user_metadata?.avatar_url as string | undefined) ||
          null;
        const nextIsAdmin = await resolveAdminStatus(session?.user?.id);
        if (!isMounted) {
          return;
        }

        setEmail(nextEmail);
        setAvatarUrl(nextAvatarUrl);
        setIsAdmin(nextIsAdmin);
        setLoading(false);
      })();
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      setActivePlayerTab("CREATE");
      setSelectedPlayer(null);
      setSearch("");
      setSavePlayerError(null);
      setSavePlayerSuccess(null);
      setCreatePlayerError(null);
      setCreatePlayerSuccess(null);
      setCreateMatchError(null);
      setCreateMatchSuccess(null);
      setUpdateMatchError(null);
      setUpdateMatchSuccess(null);
      return;
    }
  }, [isAdmin]);

  const selectPlayerFromSearch = (player: Player) => {
    setActivePlayerTab("EDIT");
    setSelectedPlayer(player);
    setSearch(player.name || "");
    setSavePlayerError(null);
    setSavePlayerSuccess(null);
  };

  useEffect(() => {
    setEditName(selectedPlayer?.name || "");
    setEditNickname(selectedPlayer?.nickname || "");
    setEditImageLink(selectedPlayer?.image_link || "");
  }, [selectedPlayer]);

  const handleSavePlayer = async () => {
    if (!selectedPlayer) {
      return;
    }

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

      const { data: updated, error } = await supabase
        .from("players")
        .update(updates)
        .eq("player_id", selectedPlayer.player_id)
        .select("*")
        .maybeSingle();

      if (error) {
        setSavePlayerError(error.message || "Failed to update player.");
        return;
      }

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
      setSavePlayerSuccess("Player updated successfully.");
    } catch {
      setSavePlayerError("Unexpected error while updating player.");
    } finally {
      setSavingPlayer(false);
    }
  };

  const handleCreatePlayer = async () => {
    setCreatingPlayer(true);
    setCreatePlayerError(null);
    setCreatePlayerSuccess(null);

    try {
      const payload = {
        name: createName.trim(),
        nickname: createNickname.trim(),
        image_link: createImageLink.trim() || null,
      };

      if (!payload.name || !payload.nickname) {
        setCreatePlayerError("Name and nickname cannot be empty.");
        return;
      }

      const { data: created, error } = await supabase
        .from("players")
        .insert(payload)
        .select("*")
        .maybeSingle();

      if (error) {
        setCreatePlayerError(error.message || "Failed to create player.");
        return;
      }

      if (!created) {
        setCreatePlayerError("Player was not created.");
        return;
      }

      setPlayers((current) =>
        [...current, created].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setSelectedPlayer(created);
      setSearch(created.name || "");
      setEditName(created.name || "");
      setEditNickname(created.nickname || "");
      setEditImageLink(created.image_link || "");
      setCreateName("");
      setCreateNickname("");
      setCreateImageLink("");
      setCreatePlayerSuccess("Player created successfully.");
      setActivePlayerTab("EDIT");
    } catch {
      setCreatePlayerError("Unexpected error while creating player.");
    } finally {
      setCreatingPlayer(false);
    }
  };

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

      if (selectedPlayerIds.some((playerId) => !playerId)) {
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

      setCreateMatchSeasonId("");
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
    } catch {
      setCreateMatchError("Unexpected error while creating match.");
    } finally {
      setCreatingMatch(false);
    }
  };

  const handleUpdateMatch = async () => {
    setUpdatingMatch(true);
    setUpdateMatchError(null);
    setUpdateMatchSuccess(null);

    try {
      const matchId = Number.parseInt(updateMatchId, 10);
      if (!Number.isInteger(matchId) || matchId <= 0) {
        setUpdateMatchError("match_id must be a positive integer.");
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

      const rawSetPairs = [
        { team1: updateSet1Team1, team2: updateSet1Team2 },
        { team1: updateSet2Team1, team2: updateSet2Team2 },
        { team1: updateSet3Team1, team2: updateSet3Team2 },
      ];

      const sets: Array<{ team1Games: number; team2Games: number }> = [];
      for (const pair of rawSetPairs) {
        const t1 = pair.team1.trim();
        const t2 = pair.team2.trim();

        if (!t1 && !t2) {
          continue;
        }

        if (!t1 || !t2) {
          setUpdateMatchError("Each set row must have both team scores.");
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
          setUpdateMatchError("Set scores must be whole numbers >= 0.");
          return;
        }

        sets.push({ team1Games: t1Games, team2Games: t2Games });
      }

      if (updateMatchStatus === "completed" && sets.length === 0) {
        setUpdateMatchError(
          "At least one set score is required for completed matches.",
        );
        return;
      }

      const payload: Record<string, unknown> = {
        status: updateMatchStatus,
      };

      if (updateMatchSeasonId.trim()) {
        const seasonId = Number.parseInt(updateMatchSeasonId.trim(), 10);
        if (!Number.isInteger(seasonId) || seasonId <= 0) {
          setUpdateMatchError("season_id must be a positive integer.");
          return;
        }
        payload.seasonId = seasonId;
      }

      if (updateMatchDateLocal) payload.dateLocal = updateMatchDateLocal;
      if (updateMatchTimeLocal) payload.timeLocal = updateMatchTimeLocal;
      if (updateMatchVenue.trim()) payload.venue = updateMatchVenue.trim();
      if (updateMatchType.trim()) payload.type = updateMatchType.trim();
      if (updateMatchStatus === "completed") payload.sets = sets;

      const response = await fetch(`/api/admin/matches/${matchId}/update`, {
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
        const details = result.details?.join(" ");
        setUpdateMatchError(
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
      setUpdateMatchSuccess(result.message || "Match updated successfully.");
    } catch {
      setUpdateMatchError("Unexpected error while updating match.");
    } finally {
      setUpdatingMatch(false);
    }
  };

  const handleGoogleSignIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/admin`,
        queryParams: {
          prompt: "select_account",
        },
      },
    });
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setEmail(null);
    setAvatarUrl(null);
    setIsAdmin(false);
  };

  return (
    <>
      <BackToHome />
      <div className="p-6 max-w-[96rem] mx-auto">
        <div className="w-full md:w-[24rem] md:max-w-[24rem] mx-auto mb-6">
          <h1 className="text-2xl font-bold mb-2">Admin</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Google sign-in is required to access this page.
          </p>
        </div>

        {loading ? (
          <div
            className={`${AUTH_BOX_CLASS} flex items-center text-sm text-slate-600 dark:text-slate-300`}
          >
            Checking authentication...
          </div>
        ) : email ? (
          <div className="space-y-4">
            <div className={`${AUTH_BOX_CLASS} flex flex-col justify-between`}>
              <div className="flex items-center gap-3">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="Google profile"
                    className="h-10 w-10 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800" />
                )}
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  Signed in as
                </div>
                <div className="font-medium text-slate-900 dark:text-slate-100">
                  {email}
                </div>
              </div>

              <div
                className={`rounded-md px-3 py-2 text-sm font-medium ${
                  isAdmin
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
                    : "bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300"
                }`}
              >
                Admin: {isAdmin ? "Yes" : "No"}
              </div>

              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex items-center rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
              >
                Sign out
              </button>
            </div>

            {isAdmin ? (
              <div className="w-full xl:max-w-[88rem] mx-auto rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-4 xl:p-6">
                <div className="space-y-4">
                  <div className="mx-auto w-full max-w-md text-center">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      Admin Tools
                    </h2>
                  </div>

                  <div className="w-full flex justify-center">
                    <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-1 bg-slate-50 dark:bg-slate-800/60">
                      {ADMIN_PLAYER_TABS.map((tab) => {
                        const active = activePlayerTab === tab.value;
                        return (
                          <button
                            key={tab.value}
                            type="button"
                            onClick={() => {
                              setActivePlayerTab(tab.value);
                              setSavePlayerError(null);
                              setSavePlayerSuccess(null);
                              setCreatePlayerError(null);
                              setCreatePlayerSuccess(null);
                              setCreateMatchError(null);
                              setCreateMatchSuccess(null);
                              setUpdateMatchError(null);
                              setUpdateMatchSuccess(null);
                            }}
                            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                              active
                                ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm"
                                : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
                            }`}
                          >
                            {tab.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {activePlayerTab === "EDIT" ? (
                    <div className="space-y-4">
                      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        Player Lookup
                      </h3>

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
                        <div className="text-sm text-slate-500 dark:text-slate-400">
                          Loading players...
                        </div>
                      )}

                      {playersError && (
                        <div className="text-sm text-rose-600 dark:text-rose-400">
                          Error loading players: {playersError}
                        </div>
                      )}

                      {selectedPlayer && (
                        <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-4 text-sm">
                          <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
                            Player Details
                          </div>
                          <div className="grid gap-4 xl:grid-cols-2">
                            <div>
                              <label className="text-slate-500 dark:text-slate-400">
                                name:
                              </label>
                              <input
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                              />
                            </div>
                            <div>
                              <label className="text-slate-500 dark:text-slate-400">
                                nickname:
                              </label>
                              <input
                                type="text"
                                value={editNickname}
                                onChange={(e) =>
                                  setEditNickname(e.target.value)
                                }
                                className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                              />
                            </div>
                            <div className="xl:col-span-2">
                              <label className="text-slate-500 dark:text-slate-400">
                                image_link:
                              </label>
                              <input
                                type="text"
                                value={editImageLink}
                                onChange={(e) =>
                                  setEditImageLink(e.target.value)
                                }
                                className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                                placeholder="https://..."
                              />
                            </div>
                          </div>

                          <div className="rounded-md bg-slate-50 dark:bg-slate-800/40 p-3 grid gap-3 xl:grid-cols-3">
                            <div>
                              <span className="text-slate-500 dark:text-slate-400">
                                player_id:
                              </span>{" "}
                              <span className="font-medium text-slate-900 dark:text-slate-100 break-all">
                                {selectedPlayer.player_id}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 dark:text-slate-400">
                                updated_at:
                              </span>{" "}
                              <span className="font-medium text-slate-900 dark:text-slate-100 break-all">
                                {selectedPlayer.updated_at || "N/A"}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 dark:text-slate-400">
                                created_at:
                              </span>{" "}
                              <span className="font-medium text-slate-900 dark:text-slate-100 break-all">
                                {selectedPlayer.created_at || "N/A"}
                              </span>
                            </div>
                          </div>

                          {savePlayerError && (
                            <div className="rounded bg-rose-50 dark:bg-rose-900/20 px-2.5 py-2 text-rose-700 dark:text-rose-300">
                              {savePlayerError}
                            </div>
                          )}

                          {savePlayerSuccess && (
                            <div className="rounded bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-2 text-emerald-700 dark:text-emerald-300">
                              {savePlayerSuccess}
                            </div>
                          )}

                          <div>
                            <button
                              type="button"
                              onClick={handleSavePlayer}
                              disabled={savingPlayer}
                              className="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              {savingPlayer ? "Saving..." : "Save Player"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : activePlayerTab === "CREATE_MATCH" ? (
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
                            onChange={(e) =>
                              setCreateMatchSeasonId(e.target.value)
                            }
                            className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                            placeholder="e.g. 1"
                          />
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
                            onChange={(e) =>
                              setCreateMatchDateLocal(e.target.value)
                            }
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
                            onChange={(e) =>
                              setCreateMatchTimeLocal(e.target.value)
                            }
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
                          <input
                            id="create-match-venue"
                            type="text"
                            value={createMatchVenue}
                            onChange={(e) =>
                              setCreateMatchVenue(e.target.value)
                            }
                            className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                          />
                        </div>
                        <div>
                          <label
                            className="text-slate-500 dark:text-slate-400"
                            htmlFor="create-match-type"
                          >
                            type:
                          </label>
                          <input
                            id="create-match-type"
                            type="text"
                            value={createMatchType}
                            onChange={(e) => setCreateMatchType(e.target.value)}
                            className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                            placeholder="e.g. americano"
                          />
                        </div>
                      </div>

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
                              onChange={(e) =>
                                setCreateMatchTeam1Player1(e.target.value)
                              }
                              className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                            >
                              <option value="">Select player</option>
                              {players.map((player) => (
                                <option
                                  key={player.player_id}
                                  value={player.player_id}
                                >
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
                              onChange={(e) =>
                                setCreateMatchTeam1Player2(e.target.value)
                              }
                              className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                            >
                              <option value="">Select player</option>
                              {players.map((player) => (
                                <option
                                  key={player.player_id}
                                  value={player.player_id}
                                >
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
                              onChange={(e) =>
                                setCreateMatchTeam2Player1(e.target.value)
                              }
                              className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                            >
                              <option value="">Select player</option>
                              {players.map((player) => (
                                <option
                                  key={player.player_id}
                                  value={player.player_id}
                                >
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
                              onChange={(e) =>
                                setCreateMatchTeam2Player2(e.target.value)
                              }
                              className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                            >
                              <option value="">Select player</option>
                              {players.map((player) => (
                                <option
                                  key={player.player_id}
                                  value={player.player_id}
                                >
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
                          onClick={handleCreateMatch}
                          disabled={creatingMatch || playersLoading}
                          className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {creatingMatch ? "Scheduling..." : "Schedule Match"}
                        </button>
                      </div>
                    </div>
                  ) : activePlayerTab === "UPDATE_MATCH" ? (
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-4 text-sm">
                      <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        Update Match
                      </div>

                      <div className="grid gap-4 xl:grid-cols-3">
                        <div>
                          <label
                            className="text-slate-500 dark:text-slate-400"
                            htmlFor="update-match-id"
                          >
                            match_id:
                          </label>
                          <input
                            id="update-match-id"
                            type="number"
                            value={updateMatchId}
                            onChange={(e) => setUpdateMatchId(e.target.value)}
                            className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                            placeholder="e.g. 15"
                          />
                        </div>

                        <div>
                          <label
                            className="text-slate-500 dark:text-slate-400"
                            htmlFor="update-match-status"
                          >
                            status:
                          </label>
                          <select
                            id="update-match-status"
                            value={updateMatchStatus}
                            onChange={(e) =>
                              setUpdateMatchStatus(
                                e.target
                                  .value as (typeof MATCH_STATUS_OPTIONS)[number],
                              )
                            }
                            className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                          >
                            {MATCH_STATUS_OPTIONS.map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label
                            className="text-slate-500 dark:text-slate-400"
                            htmlFor="update-match-season-id"
                          >
                            season_id (optional):
                          </label>
                          <input
                            id="update-match-season-id"
                            type="number"
                            value={updateMatchSeasonId}
                            onChange={(e) =>
                              setUpdateMatchSeasonId(e.target.value)
                            }
                            className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                            placeholder="leave blank to keep"
                          />
                        </div>

                        <div>
                          <label
                            className="text-slate-500 dark:text-slate-400"
                            htmlFor="update-match-date-local"
                          >
                            date_local (optional):
                          </label>
                          <input
                            id="update-match-date-local"
                            type="date"
                            value={updateMatchDateLocal}
                            onChange={(e) =>
                              setUpdateMatchDateLocal(e.target.value)
                            }
                            className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                          />
                        </div>

                        <div>
                          <label
                            className="text-slate-500 dark:text-slate-400"
                            htmlFor="update-match-time-local"
                          >
                            time_local (optional):
                          </label>
                          <input
                            id="update-match-time-local"
                            type="time"
                            value={updateMatchTimeLocal}
                            onChange={(e) =>
                              setUpdateMatchTimeLocal(e.target.value)
                            }
                            className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                          />
                        </div>

                        <div>
                          <label
                            className="text-slate-500 dark:text-slate-400"
                            htmlFor="update-match-type"
                          >
                            type (optional):
                          </label>
                          <input
                            id="update-match-type"
                            type="text"
                            value={updateMatchType}
                            onChange={(e) => setUpdateMatchType(e.target.value)}
                            className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                            placeholder="e.g. group"
                          />
                        </div>

                        <div className="xl:col-span-3">
                          <label
                            className="text-slate-500 dark:text-slate-400"
                            htmlFor="update-match-venue"
                          >
                            venue (optional):
                          </label>
                          <input
                            id="update-match-venue"
                            type="text"
                            value={updateMatchVenue}
                            onChange={(e) =>
                              setUpdateMatchVenue(e.target.value)
                            }
                            className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                          />
                        </div>
                      </div>

                      {updateMatchStatus === "completed" && (
                        <div className="rounded-md bg-slate-50 dark:bg-slate-800/40 p-3 space-y-3">
                          <div className="font-medium text-slate-900 dark:text-slate-100">
                            Set Scores (required for completed)
                          </div>

                          <div className="grid gap-3 xl:grid-cols-3">
                            <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              Set 1
                            </div>
                            <input
                              type="number"
                              value={updateSet1Team1}
                              onChange={(e) =>
                                setUpdateSet1Team1(e.target.value)
                              }
                              className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                              placeholder="Team 1 games"
                            />
                            <input
                              type="number"
                              value={updateSet1Team2}
                              onChange={(e) =>
                                setUpdateSet1Team2(e.target.value)
                              }
                              className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                              placeholder="Team 2 games"
                            />

                            <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              Set 2
                            </div>
                            <input
                              type="number"
                              value={updateSet2Team1}
                              onChange={(e) =>
                                setUpdateSet2Team1(e.target.value)
                              }
                              className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                              placeholder="Team 1 games"
                            />
                            <input
                              type="number"
                              value={updateSet2Team2}
                              onChange={(e) =>
                                setUpdateSet2Team2(e.target.value)
                              }
                              className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                              placeholder="Team 2 games"
                            />

                            <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              Set 3 (optional)
                            </div>
                            <input
                              type="number"
                              value={updateSet3Team1}
                              onChange={(e) =>
                                setUpdateSet3Team1(e.target.value)
                              }
                              className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                              placeholder="Team 1 games"
                            />
                            <input
                              type="number"
                              value={updateSet3Team2}
                              onChange={(e) =>
                                setUpdateSet3Team2(e.target.value)
                              }
                              className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                              placeholder="Team 2 games"
                            />
                          </div>
                        </div>
                      )}

                      {updateMatchError && (
                        <div className="rounded bg-rose-50 dark:bg-rose-900/20 px-2.5 py-2 text-rose-700 dark:text-rose-300">
                          {updateMatchError}
                        </div>
                      )}

                      {updateMatchSuccess && (
                        <div className="rounded bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-2 text-emerald-700 dark:text-emerald-300">
                          {updateMatchSuccess}
                        </div>
                      )}

                      <div>
                        <button
                          type="button"
                          onClick={handleUpdateMatch}
                          disabled={updatingMatch}
                          className="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {updatingMatch ? "Updating..." : "Update Match"}
                        </button>
                      </div>
                    </div>
                  ) : (
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
                          onClick={handleCreatePlayer}
                          disabled={creatingPlayer}
                          className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {creatingPlayer ? "Creating..." : "Create Player"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-900/10 p-4 text-sm text-rose-700 dark:text-rose-300">
                You are authenticated but not authorized to use admin tools.
              </div>
            )}
          </div>
        ) : (
          <div className={`${AUTH_BOX_CLASS} flex flex-col justify-between`}>
            <div className="text-sm text-slate-600 dark:text-slate-300">
              You are not signed in.
            </div>
            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Continue with Google
            </button>
          </div>
        )}
      </div>
    </>
  );
}
