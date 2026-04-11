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
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      Admin Tools
                    </h2>
                  </div>

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
                              <span className="text-slate-500 dark:text-slate-400">
                                player_id:
                              </span>{" "}
                              <span className="font-medium text-slate-900 dark:text-slate-100 break-all">
                                {selectedPlayer.player_id}
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
                            <div>
                              <span className="text-slate-500 dark:text-slate-400">
                                updated_at:
                              </span>{" "}
                              <span className="font-medium text-slate-900 dark:text-slate-100 break-all">
                                {selectedPlayer.updated_at || "N/A"}
                              </span>
                            </div>
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
