"use client";

import { useEffect, useMemo, useState } from "react";
import BackToHome from "@/components/BackToHome";
import { supabase } from "@/lib/supabase";
import { Player } from "@/lib/types";

const ADMIN_EMAIL = "nfrimando@gmail.com";

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [playersError, setPlayersError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filtered, setFiltered] = useState<Player[]>([]);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

  const checkIsAdmin = (userEmail: string | null) => {
    return (userEmail || "").trim().toLowerCase() === ADMIN_EMAIL;
  };

  useEffect(() => {
    let isMounted = true;

    async function initSession() {
      const { data } = await supabase.auth.getUser();
      if (!isMounted) {
        return;
      }

      const nextEmail = data.user?.email ?? null;
      setEmail(nextEmail);
      setIsAdmin(checkIsAdmin(nextEmail));
      setLoading(false);
    }

    initSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) {
        return;
      }

      const nextEmail = session?.user?.email ?? null;
      setEmail(nextEmail);
      setIsAdmin(checkIsAdmin(nextEmail));
      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      setPlayers([]);
      setFiltered([]);
      setSelectedPlayer(null);
      setSearch("");
      setPlayersError(null);
      return;
    }

    let isMounted = true;

    async function fetchPlayers() {
      setPlayersLoading(true);
      setPlayersError(null);

      const { data, error } = await supabase
        .from("players")
        .select("*")
        .order("name", { ascending: true });

      if (!isMounted) {
        return;
      }

      if (error) {
        setPlayersError(error.message || "Failed to load players");
        setPlayers([]);
      } else {
        setPlayers(data || []);
      }

      setPlayersLoading(false);
    }

    fetchPlayers();

    return () => {
      isMounted = false;
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!search.trim()) {
      setFiltered([]);
      setActiveSuggestionIndex(-1);
      return;
    }

    const query = search.trim().toLowerCase();
    const next = players.filter((p) => {
      return (
        String(p.name || "")
          .toLowerCase()
          .includes(query) ||
        String(p.nickname || "")
          .toLowerCase()
          .includes(query)
      );
    });

    setFiltered(next);
    setActiveSuggestionIndex(-1);
  }, [search, players]);

  const visibleFiltered = useMemo(() => filtered.slice(0, 7), [filtered]);

  const shouldShowDropdown =
    search.trim().length > 0 &&
    visibleFiltered.length > 0 &&
    (!selectedPlayer ||
      search.trim().toLowerCase() !==
        String(selectedPlayer.name || "")
          .trim()
          .toLowerCase());

  const selectPlayerFromSearch = (player: Player) => {
    setSelectedPlayer(player);
    setSearch(player.name || "");
    setFiltered([]);
    setActiveSuggestionIndex(-1);
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
    setIsAdmin(false);
  };

  return (
    <>
      <BackToHome />
      <div className="p-6 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">Admin</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
          Google sign-in is required to access this page.
        </p>

        {loading ? (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 text-sm text-slate-600 dark:text-slate-300">
            Checking authentication...
          </div>
        ) : email ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-4">
              <div>
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

              {isAdmin ? (
                <div className="rounded-md bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
                  Authenticated and authorized. You can use admin tools.
                </div>
              ) : (
                <div className="rounded-md bg-rose-50 dark:bg-rose-900/20 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
                  Authenticated but not authorized for admin tools.
                </div>
              )}

              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex items-center rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
              >
                Sign out
              </button>
            </div>

            {isAdmin ? (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-4">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Player Lookup
                </h2>

                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search player by name or nickname..."
                    className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 pr-10 rounded"
                    value={search}
                    onKeyDown={(e) => {
                      if (!shouldShowDropdown) {
                        return;
                      }

                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setActiveSuggestionIndex((prev) =>
                          prev < visibleFiltered.length - 1 ? prev + 1 : 0,
                        );
                      }

                      if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setActiveSuggestionIndex((prev) =>
                          prev > 0 ? prev - 1 : visibleFiltered.length - 1,
                        );
                      }

                      if (e.key === "Enter" && activeSuggestionIndex >= 0) {
                        e.preventDefault();
                        const selected = visibleFiltered[activeSuggestionIndex];
                        if (selected) {
                          selectPlayerFromSearch(selected);
                        }
                      }
                    }}
                    onChange={(e) => setSearch(e.target.value)}
                  />

                  {search.trim().length > 0 && (
                    <button
                      type="button"
                      aria-label="Clear player search"
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors"
                      onClick={() => {
                        setSearch("");
                        setFiltered([]);
                        setActiveSuggestionIndex(-1);
                        setSelectedPlayer(null);
                      }}
                    >
                      ×
                    </button>
                  )}

                  {shouldShowDropdown && (
                    <div className="absolute left-0 right-0 top-full mt-2 z-50 border border-slate-200 dark:border-slate-700 rounded shadow bg-white dark:bg-slate-900">
                      {visibleFiltered.map((player, index) => (
                        <button
                          key={player.player_id}
                          type="button"
                          className={`w-full text-left px-3 py-2 transition-colors ${
                            index === activeSuggestionIndex
                              ? "bg-slate-100 dark:bg-slate-800"
                              : "hover:bg-slate-50 dark:hover:bg-slate-800/70"
                          }`}
                          onMouseEnter={() => setActiveSuggestionIndex(index)}
                          onClick={() => selectPlayerFromSearch(player)}
                        >
                          <div className="font-medium text-slate-900 dark:text-slate-100">
                            {player.name}
                          </div>
                          {player.nickname && (
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              {player.nickname}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
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

                {selectedPlayer && (
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-2 text-sm">
                    <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      Player Details
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400">
                        player_id:
                      </span>{" "}
                      <span className="font-medium text-slate-900 dark:text-slate-100">
                        {selectedPlayer.player_id}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400">
                        name:
                      </span>{" "}
                      <span className="font-medium text-slate-900 dark:text-slate-100">
                        {selectedPlayer.name || "N/A"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400">
                        nickname:
                      </span>{" "}
                      <span className="font-medium text-slate-900 dark:text-slate-100">
                        {selectedPlayer.nickname || "N/A"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400">
                        image_link:
                      </span>{" "}
                      <span className="font-medium text-slate-900 dark:text-slate-100 break-all">
                        {selectedPlayer.image_link || "N/A"}
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
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-900/10 p-4 text-sm text-rose-700 dark:text-rose-300">
                You are authenticated but not authorized to use admin tools.
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-4">
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
