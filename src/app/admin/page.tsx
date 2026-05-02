"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import BackToHome from "@/components/BackToHome";
import { CompleteMatchTab } from "@/components/admin/CompleteMatchTab";
import { CreatePlayerTab } from "@/components/admin/CreatePlayerTab";
import { EditPlayerTab } from "@/components/admin/EditPlayerTab";
import { MembersTab } from "@/components/admin/MembersTab";
import { ScheduleMatchTab } from "@/components/admin/ScheduleMatchTab";
import { SeasonsTab } from "@/components/admin/SeasonsTab";
import { UpdateMatchTab } from "@/components/admin/UpdateMatchTab";
import { supabase } from "@/lib/supabase";
import { Player } from "@/lib/types";
import { useMatchSeasons } from "@/lib/useMatchSeasons";
import { useScheduledMatches } from "@/lib/useScheduledMatches";
import { usePlayers } from "@/lib/usePlayers";

const ADMIN_PLAYER_TABS = [
  { value: "MEMBERS", label: "Members" },
  { value: "SEASONS", label: "Seasons" },
  { value: "CREATE", label: "Create Player" },
  { value: "EDIT", label: "Edit Player" },
  { value: "SCHEDULE_MATCH", label: "Schedule Match" },
  { value: "COMPLETE_MATCH", label: "Complete Match" },
  { value: "UPDATE_MATCH", label: "Update Match" },
] as const;
const AUTH_BOX_CLASS =
  "w-full md:w-[24rem] md:max-w-[24rem] min-h-[188px] mx-auto rounded-lg border border-slate-200 dark:border-slate-700 p-4";

function AdminPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const TAB_VALUES = useMemo(() => ADMIN_PLAYER_TABS.map((t) => t.value), []);
  const rawTab = searchParams.get("tab");
  const activePlayerTab: (typeof ADMIN_PLAYER_TABS)[number]["value"] =
    TAB_VALUES.includes(rawTab as (typeof ADMIN_PLAYER_TABS)[number]["value"])
      ? (rawTab as (typeof ADMIN_PLAYER_TABS)[number]["value"])
      : "SCHEDULE_MATCH";

  const setActivePlayerTab = (
    tab: (typeof ADMIN_PLAYER_TABS)[number]["value"],
  ) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.push(`/admin?${params.toString()}`);
  };

  // ── Auth state ──────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // ── Cross-tab state ─────────────────────────────────────────────────────
  const [matchRefreshKey, setMatchRefreshKey] = useState(0);
  const [pendingEditPlayer, setPendingEditPlayer] = useState<Player | null>(
    null,
  );

  const {
    players,
    setPlayers,
    loading: playersLoading,
    error: playersError,
  } = usePlayers({ enabled: isAdmin, orderByName: true });
  const {
    seasons: matchSeasons,
    loading: matchSeasonsLoading,
    error: matchSeasonsError,
  } = useMatchSeasons(isAdmin);
  const {
    scheduledMatches,
    loading: scheduledMatchesLoading,
    error: scheduledMatchesError,
  } = useScheduledMatches({
    enabled: isAdmin && activePlayerTab === "COMPLETE_MATCH",
    refreshKey: String(matchRefreshKey),
  });
  const playerNameById = useMemo(
    () =>
      new Map(
        players.map((player) => [
          String(player.player_id),
          player.nickname || player.name || `#${player.player_id}`,
        ]),
      ),
    [players],
  );

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
      const params = new URLSearchParams(searchParams.toString());
      params.delete("tab");
      router.replace(`/admin?${params.toString()}`);
      return;
    }
  }, [isAdmin]);

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
    try {
      await supabase.auth.signOut();
      setEmail(null);
      setAvatarUrl(null);
      setIsAdmin(false);
    } finally {
      window.location.replace("/");
    }
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
                            onClick={() => setActivePlayerTab(tab.value)}
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

                  {/* TAB CONTENT */}
                  {activePlayerTab === "EDIT" ? (
                    <EditPlayerTab
                      players={players}
                      playersLoading={playersLoading}
                      playersError={playersError}
                      onPlayersChange={setPlayers}
                      initialPlayer={pendingEditPlayer}
                      onInitialPlayerConsumed={() => setPendingEditPlayer(null)}
                    />
                  ) : activePlayerTab === "SCHEDULE_MATCH" ? (
                    <ScheduleMatchTab
                      players={players}
                      playersLoading={playersLoading}
                      playersError={playersError}
                      matchSeasons={matchSeasons}
                      matchSeasonsLoading={matchSeasonsLoading}
                      matchSeasonsError={matchSeasonsError}
                      onMatchScheduled={() => setMatchRefreshKey((k) => k + 1)}
                    />
                  ) : activePlayerTab === "COMPLETE_MATCH" ? (
                    <CompleteMatchTab
                      scheduledMatches={scheduledMatches}
                      scheduledMatchesLoading={scheduledMatchesLoading}
                      scheduledMatchesError={scheduledMatchesError}
                      playerNameById={playerNameById}
                      onMatchCompleted={() => setMatchRefreshKey((k) => k + 1)}
                    />
                  ) : activePlayerTab === "UPDATE_MATCH" ? (
                    <UpdateMatchTab
                      players={players}
                      matchSeasons={matchSeasons}
                      matchSeasonsLoading={matchSeasonsLoading}
                      matchSeasonsError={matchSeasonsError}
                      playerNameById={playerNameById}
                    />
                  ) : activePlayerTab === "CREATE" ? (
                    <CreatePlayerTab
                      onPlayerCreated={(created) => {
                        setPlayers((prev) => [created, ...prev]);
                        setPendingEditPlayer(created);
                        setActivePlayerTab("EDIT");
                      }}
                    />
                  ) : activePlayerTab === "MEMBERS" ? (
                    <MembersTab
                      enabled={activePlayerTab === "MEMBERS" && isAdmin}
                    />
                  ) : activePlayerTab === "SEASONS" ? (
                    <SeasonsTab
                      enabled={activePlayerTab === "SEASONS" && isAdmin}
                    />
                  ) : null}
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
export default function AdminPage() {
  return (
    <Suspense>
      <AdminPageContent />
    </Suspense>
  );
}
