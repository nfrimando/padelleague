"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { AdminDataProvider } from "@/components/admin/AdminDataContext";
import { CompleteMatchTab } from "@/components/admin/CompleteMatchTab";
import { CreatePlayerTab } from "@/components/admin/CreatePlayerTab";
import { EditPlayerTab } from "@/components/admin/EditPlayerTab";
import { EventsTab } from "@/components/admin/EventsTab";
import { MembersTab } from "@/components/admin/MembersTab";
import { ScheduleMatchTab } from "@/components/admin/ScheduleMatchTab";
import { UpdateMatchTab } from "@/components/admin/UpdateMatchTab";
import { ReviseScoreTab } from "@/components/admin/ReviseScoreTab";
import { supabase } from "@/lib/supabase";
import { checkIsAdmin } from "@/lib/adminCheck";
import { Player } from "@/lib/types";
import { useMatchEvents } from "@/lib/useMatchEvents";
import { useScheduledMatches } from "@/lib/useScheduledMatches";
import { usePlayers } from "@/lib/usePlayers";

type TabValue =
  | "MEMBERS"
  | "EVENTS"
  | "CREATE"
  | "EDIT"
  | "SCHEDULE_MATCH"
  | "COMPLETE_MATCH"
  | "UPDATE_MATCH"
  | "REVISE_SCORE";

const NAV_GROUPS: {
  label: string;
  items: { value: TabValue; label: string; danger?: boolean; disabled?: boolean }[];
}[] = [
  {
    label: "Matches",
    items: [
      { value: "SCHEDULE_MATCH", label: "Schedule Match" },
      { value: "COMPLETE_MATCH", label: "Complete Match" },
      { value: "UPDATE_MATCH", label: "Update Match" },
      { value: "REVISE_SCORE", label: "Revise Score", danger: true },
    ],
  },
  {
    label: "Players",
    items: [
      { value: "CREATE", label: "Create Player" },
      { value: "EDIT", label: "Edit Player" },
      { value: "MEMBERS", label: "Members" },
    ],
  },
  {
    label: "Events",
    items: [
      { value: "EVENTS", label: "Manage Events" },
    ],
  },
];

const ALL_TABS = NAV_GROUPS.flatMap((g) => g.items);
const ALL_TAB_VALUES = ALL_TABS.map((t) => t.value);

function AdminPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawTab = searchParams.get("tab");
  const activeTab: TabValue = ALL_TAB_VALUES.includes(rawTab as TabValue)
    ? (rawTab as TabValue)
    : "SCHEDULE_MATCH";

  const setActiveTab = useCallback(
    (tab: TabValue) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", tab);
      router.push(`/admin?${params.toString()}`);
    },
    [router, searchParams],
  );

  // Auth state
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Cross-tab state
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
    events: matchSeasons,
    loading: matchSeasonsLoading,
    error: matchSeasonsError,
  } = useMatchEvents(isAdmin);

  const {
    scheduledMatches,
    loading: scheduledMatchesLoading,
    error: scheduledMatchesError,
  } = useScheduledMatches({
    enabled: isAdmin && activeTab === "COMPLETE_MATCH",
    refreshKey: String(matchRefreshKey),
  });

  const playerNameById = useMemo(
    () =>
      new Map(
        players.map((p) => [
          String(p.player_id),
          p.nickname || p.name || `#${p.player_id}`,
        ]),
      ),
    [players],
  );

  const refreshScheduledMatches = useCallback(() => {
    setMatchRefreshKey((k) => k + 1);
  }, []);

  const consumePendingEditPlayer = useCallback(() => {
    setPendingEditPlayer(null);
  }, []);

  const handlePlayerCreated = useCallback(
    (created: Player) => {
      setPlayers((prev) => [created, ...prev]);
      setPendingEditPlayer(created);
      setActiveTab("EDIT");
    },
    [setPlayers, setActiveTab],
  );

  const adminDataContextValue = useMemo(
    () => ({
      players,
      setPlayers,
      playersLoading,
      playersError,
      matchSeasons,
      matchSeasonsLoading,
      matchSeasonsError,
      scheduledMatches,
      scheduledMatchesLoading,
      scheduledMatchesError,
      playerNameById,
      pendingEditPlayer,
      consumePendingEditPlayer,
      handlePlayerCreated,
      refreshScheduledMatches,
    }),
    [
      players,
      setPlayers,
      playersLoading,
      playersError,
      matchSeasons,
      matchSeasonsLoading,
      matchSeasonsError,
      scheduledMatches,
      scheduledMatchesLoading,
      scheduledMatchesError,
      playerNameById,
      pendingEditPlayer,
      consumePendingEditPlayer,
      handlePlayerCreated,
      refreshScheduledMatches,
    ],
  );

  useEffect(() => {
    let isMounted = true;

    async function resolveAdminStatus(userId: string | undefined) {
      if (!userId) return false;
      return checkIsAdmin(supabase, userId);
    }

    async function initSession() {
      const { data } = await supabase.auth.getUser();
      if (!isMounted) return;
      const nextEmail = data.user?.email ?? null;
      const nextAvatarUrl =
        (data.user?.user_metadata?.picture as string | undefined) ||
        (data.user?.user_metadata?.avatar_url as string | undefined) ||
        null;
      const nextIsAdmin = await resolveAdminStatus(data.user?.id);
      if (!isMounted) return;
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
        if (!isMounted) return;
        const nextEmail = session?.user?.email ?? null;
        const nextAvatarUrl =
          (session?.user?.user_metadata?.picture as string | undefined) ||
          (session?.user?.user_metadata?.avatar_url as string | undefined) ||
          null;
        const nextIsAdmin = await resolveAdminStatus(session?.user?.id);
        if (!isMounted) return;
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
    }
  }, [isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGoogleSignIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/admin`,
        queryParams: { prompt: "select_account" },
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
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#0A101C]">
      <SiteHeader />

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-slate-500 dark:text-slate-400">
          Checking authentication…
        </div>
      ) : !email ? (
        /* ── Not signed in ── */
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 space-y-5 shadow-sm">
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                Admin
              </h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Sign in with Google to access admin tools.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleGoogleSignIn()}
              className="w-full inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              Continue with Google
            </button>
          </div>
        </div>
      ) : !isAdmin ? (
        /* ── Authenticated but not admin ── */
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 space-y-4 shadow-sm">
            <div className="flex items-center gap-3">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt=""
                  className="h-9 w-9 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                />
              ) : (
                <div className="h-9 w-9 rounded-full bg-slate-200 dark:bg-slate-700" />
              )}
              <div>
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {email}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Not an admin
                </div>
              </div>
            </div>
            <div className="rounded-md bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/40 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
              You are not authorised to use admin tools.
            </div>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline"
            >
              Sign out
            </button>
          </div>
        </div>
      ) : (
        /* ── Admin dashboard ── */
        <div className="flex flex-col md:flex-row flex-1">
          {/* ── Desktop sidebar ── */}
          <aside className="hidden md:flex flex-col w-52 shrink-0 border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            {/* User identity */}
            <div className="flex items-center gap-2.5 px-4 py-4 border-b border-slate-200 dark:border-slate-700">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt=""
                  className="h-7 w-7 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                />
              ) : (
                <div className="h-7 w-7 rounded-full bg-slate-200 dark:bg-slate-700 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                  {email}
                </div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                  Admin
                </div>
              </div>
            </div>

            {/* Nav groups */}
            <nav className="flex-1 py-2 overflow-y-auto">
              {NAV_GROUPS.map((group, gi) => (
                <div key={group.label} className={gi > 0 ? "mt-1" : ""}>
                  <div className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                    {group.label}
                  </div>
                  {group.items.map((item) => {
                    const active = activeTab === item.value;
                    const danger = item.danger === true;
                    const disabled = item.disabled === true;
                    return (
                      <button
                        key={item.value}
                        type="button"
                        disabled={disabled}
                        onClick={() => !disabled && setActiveTab(item.value)}
                        className={`w-full text-left text-sm px-4 py-2 transition-colors border-l-2 ${
                          disabled
                            ? "border-transparent text-slate-500 dark:text-slate-600 cursor-not-allowed"
                            : active
                              ? "border-[#00C8DC] bg-[#00C8DC]/10 text-[#00C8DC] font-medium"
                              : danger
                                ? "border-transparent text-rose-600 dark:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 hover:text-rose-700 dark:hover:text-rose-400"
                                : "border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
                        }`}
                      >
                        <span className={disabled ? "opacity-50" : undefined}>
                          {danger && !active && <span className="mr-1">⚠</span>}
                          {item.label}
                        </span>
                        {disabled && (
                          <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-600">
                            Coming Soon
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>

            {/* Sign out */}
            <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              >
                Sign out
              </button>
            </div>
          </aside>

          {/* ── Right column (mobile tabs + content) ── */}
          <div className="flex flex-col flex-1 min-w-0">
            {/* Mobile tab bar */}
            <div className="md:hidden border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-x-auto">
              <div className="flex items-center gap-0.5 px-3 py-2 min-w-max">
                {ALL_TABS.map((tab) => {
                  const active = activeTab === tab.value;
                  const danger = tab.danger === true;
                  const disabled = tab.disabled === true;
                  return (
                    <button
                      key={tab.value}
                      type="button"
                      disabled={disabled}
                      onClick={() => !disabled && setActiveTab(tab.value)}
                      className={`px-3 py-1.5 text-sm rounded-md whitespace-nowrap transition-colors ${
                        disabled
                          ? "text-slate-500 dark:text-slate-600 cursor-not-allowed opacity-50"
                          : active
                            ? "bg-[#00C8DC]/10 text-[#00C8DC] font-medium"
                            : danger
                              ? "text-rose-600 dark:text-rose-500 hover:text-rose-700 dark:hover:text-rose-400"
                              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                      }`}
                    >
                      {danger && !active && <span className="mr-0.5">⚠</span>}
                      {tab.label}
                      {disabled && <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide">Soon</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tab content */}
            <main className="flex-1 p-4 md:p-6 overflow-y-auto">
              <AdminDataProvider value={adminDataContextValue}>
                {activeTab === "SCHEDULE_MATCH" ? (
                  <ScheduleMatchTab />
                ) : activeTab === "COMPLETE_MATCH" ? (
                  <CompleteMatchTab />
                ) : activeTab === "UPDATE_MATCH" ? (
                  <UpdateMatchTab />
                ) : activeTab === "REVISE_SCORE" ? (
                  <ReviseScoreTab />
                ) : activeTab === "CREATE" ? (
                  <CreatePlayerTab />
                ) : activeTab === "EDIT" ? (
                  <EditPlayerTab />
                ) : activeTab === "MEMBERS" ? (
                  <MembersTab enabled={activeTab === "MEMBERS" && isAdmin} />
                ) : activeTab === "EVENTS" ? (
                  <EventsTab enabled={activeTab === "EVENTS" && isAdmin} />
                ) : null}
              </AdminDataProvider>
            </main>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  return (
    <Suspense>
      <AdminPageContent />
    </Suspense>
  );
}
