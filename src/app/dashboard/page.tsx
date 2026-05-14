"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, Lock, LogOut, X } from "lucide-react";
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
import { usePlayers } from "@/lib/usePlayers";
import { useDashboardStats } from "@/lib/useDashboardStats";
import HeroSection from "./HeroSection";
import ProgressionSection from "./ProgressionSection";
import RivalriesSection from "./RivalriesSection";
import PartnersSection from "./PartnersSection";
import ViewAsSelector from "./ViewAsSelector";
import DashboardBanner from "./DashboardBanner";
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

// ── Admin check (mirrors admin/page.tsx pattern) ───────────────────────────────
async function resolveAdminStatus(userId: string | undefined): Promise<boolean> {
  if (!userId) return false;
  const { data, error } = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return false;
  return !!data;
}

function LockedSection({ skeletonRows = 3 }: { skeletonRows?: number }) {
  return (
    <div className="bg-[#0d1520] border border-[#687FA3]/10 sm:rounded-3xl p-6 space-y-3 relative overflow-hidden">
      <div className="h-2.5 w-20 bg-[#1a2540] rounded-full animate-pulse" />
      <div className="h-28 bg-[#1a2540] rounded-xl animate-pulse" />
      <div className={`grid gap-2`} style={{ gridTemplateColumns: `repeat(${skeletonRows}, 1fr)` }}>
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

export default function DashboardPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [isAdmin, setIsAdmin] = useState(false);
  const [player, setPlayer] = useState<Player | null>(null);
  const [signups, setSignups] = useState<SignupRow[]>([]);
  const [openEvents, setOpenEvents] = useState<Event[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [payingSignupId, setPayingSignupId] = useState<string | null>(null);

  // Admin-only: player to view as (null = view as self)
  const [viewAsPlayer, setViewAsPlayer] = useState<Player | null>(null);
  const [viewAsSignups, setViewAsSignups] = useState<SignupRow[]>([]);
  const isViewingAs = isAdmin && viewAsPlayer !== null;

  // The player whose data we display — guarded: only use viewAsPlayer when isAdmin
  const displayPlayer = isViewingAs ? viewAsPlayer : player;

  const {
    handleSignup,
    loading: payLoading,
    result: signupResult,
  } = useEventSignup();

  // ── Auth + admin check ─────────────────────────────────────────────────────
  useEffect(() => {
    let isMounted = true;

    async function init() {
      const { data } = await supabase.auth.getUser();
      if (!isMounted) return;
      const currentUser = data.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        const adminStatus = await resolveAdminStatus(currentUser.id);
        if (isMounted) setIsAdmin(adminStatus);
      }
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

  // ── All players list (only for admins, for ViewAsSelector) ────────────────
  const { players: allPlayers } = usePlayers({
    enabled: isAdmin,
    orderByName: true,
  });

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
          <div className="flex items-center gap-3">
            {isAdmin && (
              <ViewAsSelector
                players={allPlayers}
                selected={viewAsPlayer}
                onSelect={setViewAsPlayer}
              />
            )}
            <button
              type="button"
              onClick={handleSignOut}
              className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-[#687FA3] hover:text-white transition-colors"
            >
              <LogOut size={13} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        }
      />

      <div className="max-w-5xl mx-auto sm:px-6 py-10 md:py-14 space-y-6">
        {/* ── View As banner ── */}
        {isViewingAs && viewAsPlayer && (
          <div className="bg-[#00C8DC]/5 border border-[#00C8DC]/20 sm:rounded-2xl px-5 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <Eye size={15} className="text-[#00C8DC] shrink-0" />
              <div className="min-w-0">
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#00C8DC]">
                  Admin · View As
                </p>
                <p className="text-sm font-bold truncate">
                  {viewAsPlayer.name}
                  {viewAsPlayer.nickname && (
                    <span className="text-[#687FA3] font-normal ml-1.5">
                      &ldquo;{viewAsPlayer.nickname}&rdquo;
                    </span>
                  )}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setViewAsPlayer(null)}
              className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-[#687FA3] hover:text-white transition-colors shrink-0"
            >
              <X size={13} />
              <span>Exit</span>
            </button>
          </div>
        )}

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
            />

            {pendingPaymentSignup ? (
              <>
                <LockedSection skeletonRows={4} />
                <LockedSection skeletonRows={2} />
                <LockedSection skeletonRows={3} />
              </>
            ) : (
              <>
                <ProgressionSection
                  chartData={stats.chartData}
                  currentRating={latestRating}
                  peakRating={stats.peakRating}
                  ratingLast5Delta={stats.ratingLast5Delta}
                  currentStreak={stats.currentStreak}
                  playerId={String(displayPlayer.player_id)}
                  loading={isLoading}
                />

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
          </>
        ) : null}
      </div>
    </div>
  );
}
