"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, LogOut } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import ProfileLinkingPanel from "@/components/ProfileLinkingPanel";
import {
  fetchPlayerByEmail,
  PLAYER_LOOKUP_DASHBOARD_SELECT,
} from "@/lib/playerLookup";
import { supabase } from "@/lib/supabase";
import { useEventSignup } from "@/lib/useEventSignup";
import { usePlayerMatches } from "@/lib/usePlayerMatches";
import { useEventMap } from "@/lib/useEventMap";
import { useDashboardStats } from "@/lib/useDashboardStats";
import HeroSection from "./HeroSection";
import ProgressionSection from "./ProgressionSection";
import SimilarPlayersSection from "./SimilarPlayersSection";
import WinProbabilityCalculator, {
  WinProbabilityCalculatorHandle,
} from "./WinProbabilityCalculator";
import RivalriesSection from "./RivalriesSection";
import PartnersSection from "./PartnersSection";
import { useViewAs } from "@/contexts/ViewAsContext";
import DashboardBanner from "./DashboardBanner";
import PredictionsTab from "./PredictionsTab";
import { useUnviewedPredictionResults } from "@/lib/useUnviewedPredictionResults";
import type { User } from "@supabase/supabase-js";
import type { Event, Player } from "@/lib/types";

type SignupRow = {
  id: string;
  event_id: number;
  status: string;
  created_at: string;
  event: {
    event_id: number;
    name?: string | null;
    start_date?: string | null;
    registration_status: "open" | "closed";
    status: "upcoming" | "ongoing" | "completed";
    registration_fee?: number | null;
    payment_instructions?: string | null;
  } | null;
};


function LockedSection({ skeletonRows = 3 }: { skeletonRows?: number }) {
  return (
    <div className="bg-[#0d1520] border border-[#687FA3]/10 sm:rounded-3xl p-6 space-y-3 relative overflow-hidden">
      <div className="h-2.5 w-20 bg-[#1a2540] rounded-full animate-pulse" />
      <div className="h-28 bg-[#1a2540] rounded-xl animate-pulse" />
      <div
        className={`grid gap-2`}
        style={{ gridTemplateColumns: `repeat(${skeletonRows}, 1fr)` }}
      >
        {Array.from({ length: skeletonRows }).map((_, i) => (
          <div key={i} className="h-10 bg-[#1a2540] rounded-xl animate-pulse" />
        ))}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
        <Lock size={16} className="text-[#687FA3]/60" />
        <p className="text-[10px] font-black uppercase tracking-widest text-[#687FA3]/60">
          Pay pending fees to unlock
        </p>
      </div>
    </div>
  );
}

function DashboardPageContent() {
  const router = useRouter();

  const { isAdmin, viewAsPlayer, isViewingAs, setViewAsPlayer } = useViewAs();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [player, setPlayer] = useState<Player | null>(null);
  const [signups, setSignups] = useState<SignupRow[]>([]);
  const [openEvents, setOpenEvents] = useState<Event[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [payingSignupId, setPayingSignupId] = useState<string | null>(null);
  const [paymentJustCompleted, setPaymentJustCompleted] = useState(false);
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const VALID_TABS = ["overview", "peers", "favorites", "predictions"] as const;
  type DashboardTab = (typeof VALID_TABS)[number];
  const activeTab: DashboardTab = VALID_TABS.includes(rawTab as DashboardTab)
    ? (rawTab as DashboardTab)
    : "overview";

  const setActiveTab = useCallback(
    (tab: DashboardTab) => {
      const params = new URLSearchParams(searchParamsRef.current.toString());
      if (tab === "overview") {
        params.delete("tab");
      } else {
        params.set("tab", tab);
      }
      const qs = params.toString();
      router.replace(qs ? `/dashboard?${qs}` : "/dashboard");
    },
    [router],
  );

  const { hasUnviewed: hasUnviewedResults, markViewed } = useUnviewedPredictionResults(
    user?.email ?? null,
  );

  // Clear the predictions badge when the user opens that tab
  useEffect(() => {
    if (activeTab === "predictions") markViewed();
  }, [activeTab, markViewed]);

  // ── Peers tab: slot player IDs stored in URL (p1=t1p1, p2=t1p2, p3=t2p1, p4=t2p2) ──
  const p1 = searchParams.get("p1") ?? undefined;
  const p2 = searchParams.get("p2") ?? undefined;
  const p3 = searchParams.get("p3") ?? undefined;
  const p4 = searchParams.get("p4") ?? undefined;

  const initialPlayerIds = useMemo(
    () => ({
      ...(p1 ? { t1p1: p1 } : {}),
      ...(p2 ? { t1p2: p2 } : {}),
      ...(p3 ? { t2p1: p3 } : {}),
      ...(p4 ? { t2p2: p4 } : {}),
    }),
    [p1, p2, p3, p4],
  );

  // Keep a ref so handleSlotsChange never needs searchParams as a dep (stable identity).
  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;

  const handleSlotsChange = useCallback(
    (ids: Partial<Record<"t1p1" | "t1p2" | "t2p1" | "t2p2", string>>) => {
      const params = new URLSearchParams(searchParamsRef.current.toString());
      const slotToParam = {
        t1p1: "p1",
        t1p2: "p2",
        t2p1: "p3",
        t2p2: "p4",
      } as const;
      let changed = false;
      for (const [slot, param] of Object.entries(slotToParam)) {
        const id = ids[slot as keyof typeof ids];
        if ((id ?? "") !== (params.get(param) ?? "")) changed = true;
        if (id) params.set(param, id);
        else params.delete(param);
      }
      if (!changed) return;
      router.replace(`/dashboard?${params.toString()}`);
    },
    [router],
  );

  const calcRef = useRef<WinProbabilityCalculatorHandle>(null);

  const [viewAsSignups, setViewAsSignups] = useState<SignupRow[]>([]);

  // The player whose data we display — guarded: only use viewAsPlayer when isAdmin
  const displayPlayer = isViewingAs ? viewAsPlayer : player;

  const {
    handleSignup,
    loading: payLoading,
    result: signupResult,
  } = useEventSignup();

  // ── Detect return from PayMongo payment ───────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("payment") === "success") {
      setPaymentJustCompleted(true);
      window.history.replaceState(null, "", "/dashboard");
    }
  }, []);

  // ── Auth + admin check ─────────────────────────────────────────────────────
  useEffect(() => {
    let isMounted = true;

    async function init() {
      const { data } = await supabase.auth.getUser();
      if (!isMounted) return;
      setUser(data.user ?? null);
    }

    void init();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      isMounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (user === null) router.replace("/");
  }, [user, router]);

  // ── Data loading (auth player's own data) ─────────────────────────────────
  const load = useCallback(async () => {
    if (!user) return;
    setDataLoading(true);

    const [
      { player: playerRow, error: playerLookupError },
      { data: openEventRows },
    ] = await Promise.all([
      fetchPlayerByEmail<Player>({
        email: user?.email,
        select: PLAYER_LOOKUP_DASHBOARD_SELECT,
      }),
      supabase
        .from("events")
        .select(
          "event_id, name, event_type, start_date, end_date, registration_status, status, created_at, updated_at",
        )
        .eq("registration_status", "open")
        .order("event_id", { ascending: false }),
    ]);

    if (playerLookupError) {
      console.error("Failed player lookup on dashboard:", playerLookupError);
    }

    const p = playerRow ?? null;
    setPlayer(p);

    if (!p) {
      setSignups([]);
      setOpenEvents((openEventRows ?? []) as Event[]);
      setDataLoading(false);
      return;
    }

    const supsResult = await supabase
      .from("signups_events")
      .select(
        "id, event_id, status, created_at, event:events(event_id, name, start_date, end_date, registration_status, status, registration_fee, payment_instructions)",
      )
      .eq("player_id", p.player_id)
      .order("created_at", { ascending: false });

    const typedSups = (supsResult.data ?? []) as unknown as SignupRow[];
    setSignups(typedSups);

    const signedUpEventIds = new Set(typedSups.map((s) => s.event_id));
    setOpenEvents(
      ((openEventRows ?? []) as Event[]).filter(
        (e) => !signedUpEventIds.has(e.event_id),
      ),
    );

    setDataLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user, load]);

  useEffect(() => {
    if (signupResult === "registered") void load();
  }, [signupResult, load]);

  // ── Fetch signups for the viewed player (admin View As) ───────────────────
  useEffect(() => {
    if (!viewAsPlayer) {
      setViewAsSignups([]);
      return;
    }
    void (async () => {
      const result = await supabase
        .from("signups_events")
        .select(
          "id, event_id, status, created_at, event:events(event_id, name, start_date, end_date, registration_status, status, registration_fee, payment_instructions)",
        )
        .eq("player_id", viewAsPlayer.player_id)
        .order("created_at", { ascending: false });
      setViewAsSignups((result.data ?? []) as unknown as SignupRow[]);
    })();
  }, [viewAsPlayer]);

  // ── Match data (always for displayPlayer) ────────────────────────────────
  const {
    matches,
    latestRating,
    loading: matchesLoading,
  } = usePlayerMatches(displayPlayer ? String(displayPlayer.player_id) : null);

  const { eventMap } = useEventMap();

  const stats = useDashboardStats(
    matches,
    displayPlayer ? String(displayPlayer.player_id) : null,
    latestRating,
  );

  const matchEventIds = useMemo(() => {
    const seen = new Set<number>();
    const ids: number[] = [];
    for (const m of matches) {
      if (m.event_id != null && !seen.has(m.event_id)) {
        seen.add(m.event_id);
        ids.push(m.event_id);
      }
    }
    return ids;
  }, [matches]);

  // ── Auto-populate p1 with current player when opening peers tab ───────────
  useEffect(() => {
    if (!displayPlayer) return;
    if (activeTab !== "peers") return;
    if (p1) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "peers");
    params.set("p1", String(displayPlayer.player_id));
    router.replace(`/dashboard?${params.toString()}`);
  }, [displayPlayer, activeTab, p1, searchParams, router]);

  // ── Auth helpers ──────────────────────────────────────────────────────────
  async function handleSignOut() {
    try {
      await supabase.auth.signOut();
    } finally {
      router.replace("/");
    }
  }

  // ── Derived state ─────────────────────────────────────────────────────────
  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;
  const isLoading = dataLoading || matchesLoading;

  // In viewAs mode, show the viewed player's signups (not the admin's own)
  const heroSignups = isViewingAs ? viewAsSignups : signups;
  const heroOpenEvents = isViewingAs ? [] : openEvents;

  const pendingPaymentSignup =
    heroSignups.find((s) => s.status === "pending_payment") ?? null;

  // Reset to overview when payment is pending
  useEffect(() => {
    if (pendingPaymentSignup && activeTab !== "overview") setActiveTab("overview");
  }, [pendingPaymentSignup, activeTab, setActiveTab]);

  // ── Loading / redirect states ─────────────────────────────────────────────
  if (user === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0E1523]">
        <div className="w-8 h-8 border-2 border-[#00C8DC] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (user === null) return null;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0E1523] text-white font-sans">
      <SiteHeader
        activePath="/dashboard"
        rightSlot={
          <button
            type="button"
            onClick={handleSignOut}
            className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-[#687FA3] hover:text-white transition-colors"
          >
            <LogOut size={13} />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        }
      />

      <div className="max-w-5xl mx-auto sm:px-6 py-10 md:py-14 space-y-6">
        {dataLoading && !player ? (
          <div className="flex items-center justify-center py-32">
            <div className="w-8 h-8 border-2 border-[#00C8DC] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !player ? (
          <ProfileLinkingPanel
            user={user}
            onProfileLinked={(linkedPlayer) => {
              setPlayer(linkedPlayer);
              void load();
            }}
          />
        ) : displayPlayer ? (
          <>
            {paymentJustCompleted && !pendingPaymentSignup && (
              <DashboardBanner
                type="payment_success"
                onDismiss={() => setPaymentJustCompleted(false)}
              />
            )}
            {pendingPaymentSignup && (
              <DashboardBanner
                type="pending_payment"
                signupId={pendingPaymentSignup.id}
                eventName={
                  eventMap[pendingPaymentSignup.event_id] ??
                  pendingPaymentSignup.event?.name ??
                  `Event ${pendingPaymentSignup.event_id}`
                }
                onPayNow={(id) => setPayingSignupId(id)}
              />
            )}

            {/* ── Tab bar ── */}
            <div className="sticky top-[60px] z-40 bg-[#0E1523] pt-2">
              <div className="overflow-x-auto bg-[#0d1520] border border-[#687FA3]/10 sm:rounded-2xl p-1">
                <div className="flex">
                  {(
                    [
                      { id: "overview", label: "Overview", badge: !!pendingPaymentSignup },
                      { id: "peers", label: "Peers" },
                      { id: "favorites", label: "Favorites" },
                      { id: "predictions", label: "Predictions", beta: true, badge: hasUnviewedResults },
                    ] as const
                  ).map(({ id, label, ...rest }) => {
                    const isBeta = "beta" in rest && rest.beta === true;
                    const hasBadge = "badge" in rest && rest.badge === true;
                    const isDisabled =
                      !!pendingPaymentSignup && id !== "overview";
                    return (
                      <button
                        key={id}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => setActiveTab(id)}
                        className={[
                          "flex-1 min-w-fit py-2 px-3 text-[11px] font-black uppercase tracking-widest rounded-xl transition-colors inline-flex items-center justify-center gap-1 whitespace-nowrap relative",
                          activeTab === id
                            ? "bg-[#1a2540] text-white"
                            : isDisabled
                              ? "text-[#687FA3]/30 cursor-not-allowed"
                              : "text-[#687FA3] hover:text-white",
                        ].join(" ")}
                      >
                        {label}
                        {isBeta && (
                          <span className="text-[7px] font-black text-amber-400/60">
                            β
                          </span>
                        )}
                        {hasBadge && activeTab !== id && (
                          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-400" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ── Tab: Overview ── */}
            {activeTab === "overview" && (
              <>
                <HeroSection
                  player={displayPlayer}
                  avatarUrl={isViewingAs ? undefined : avatarUrl}
                  currentRating={latestRating}
                  stats={{
                    totalMatches: stats.totalMatches,
                    wins: stats.wins,
                    losses: stats.losses,
                    winRate: stats.winRate,
                  }}
                  signups={heroSignups}
                  openEvents={heroOpenEvents}
                  eventMap={eventMap}
                  matchEventIds={matchEventIds}
                  onRegister={(eventId) => void handleSignup(eventId)}
                  registering={payLoading}
                  loading={isLoading}
                  isViewingAs={isViewingAs}
                  payingSignupId={payingSignupId}
                  onPayingSignupIdChange={setPayingSignupId}
                  onRefreshSignups={() => void load()}
                  showEditProfile={!isViewingAs || isAdmin}
                  adminTargetPlayerId={
                    isViewingAs ? Number(displayPlayer.player_id) : undefined
                  }
                  onPlayerSaved={(updated) => setPlayer(updated)}
                />
                {pendingPaymentSignup ? (
                  <LockedSection skeletonRows={4} />
                ) : (
                  <ProgressionSection
                    chartData={stats.chartData}
                    currentRating={latestRating}
                    peakRating={stats.peakRating}
                    ratingLast5Delta={stats.ratingLast5Delta}
                    currentStreak={stats.currentStreak}
                    playerId={String(displayPlayer.player_id)}
                    loading={isLoading}
                  />
                )}
              </>
            )}

            {/* ── Tab: Peers ── */}
            {activeTab === "peers" && (
              <>
                <SimilarPlayersSection
                  playerId={displayPlayer.player_id}
                  currentPlayerRating={latestRating}
                  onSelectPeer={(peer) => {
                    calcRef.current?.addPlayer({
                      player_id: peer.id,
                      name: peer.name ?? "",
                      nickname: peer.nickname ?? "",
                      image_link: peer.image_link,
                    } as Player);
                  }}
                />
                <WinProbabilityCalculator
                  ref={calcRef}
                  initialPlayerIds={initialPlayerIds}
                  currentPlayer={displayPlayer}
                  currentPlayerRating={latestRating}
                  onSlotsChange={handleSlotsChange}
                />
              </>
            )}

            {/* ── Tab: Favorites ── */}
            {activeTab === "favorites" && (
              <>
                <RivalriesSection
                  opponentStats={stats.opponentStats}
                  loading={isLoading}
                />
                <PartnersSection
                  partnerStats={stats.partnerStats}
                  loading={isLoading}
                />
              </>
            )}

            {/* ── Tab: Predictions ── */}
            {activeTab === "predictions" && user?.email && (
              <PredictionsTab email={user.email} />
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#0E1523]">
          <div className="w-8 h-8 border-2 border-[#00C8DC] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <DashboardPageContent />
    </Suspense>
  );
}
