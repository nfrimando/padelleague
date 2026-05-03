"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  TrendingUp,
  Trophy,
  Calendar,
  LogOut,
  Users,
  Search,
  Link2,
  UserPlus,
} from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import {
  fetchPlayerByEmail,
  PLAYER_LOOKUP_DASHBOARD_SELECT,
} from "@/lib/playerLookup";
import { supabase } from "@/lib/supabase";
import { useEventSignup } from "@/lib/useEventSignup";
import { usePlayerMatches } from "@/lib/usePlayerMatches";
import { formatMatchDate } from "@/lib/utils";
import type { User } from "@supabase/supabase-js";
import type { Event, Player } from "@/lib/types";

// ─── Local types ──────────────────────────────────────────────────────────────

type ClaimablePlayer = {
  player_id: number;
  name: string;
  nickname: string;
};

type ClaimStatus = "none" | "pending" | "rejected";

type SignupRow = {
  id: string;
  event_id: number;
  status: string;
  event_type: string;
  created_at: string;
  event: Pick<
    Event,
    | "event_id"
    | "name"
    | "start_date"
    | "end_date"
    | "registration_status"
    | "status"
  > | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function eventLabel(
  s: {
    event_id: number;
    name?: string | null;
    start_date?: string | null;
  } | null,
): string {
  if (!s) return "Unknown Event";
  if (s.name) return s.name;
  if (s.start_date)
    return `Event ${s.event_id} · ${new Date(s.start_date).getFullYear()}`;
  return `Event ${s.event_id}`;
}

function SignupBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; dot: string }> = {
    registered: {
      label: "Registered",
      cls: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
      dot: "bg-emerald-400",
    },
    accepted: {
      label: "Accepted",
      cls: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
      dot: "bg-emerald-400",
    },
    waitlisted: {
      label: "Waitlisted",
      cls: "bg-[#687FA3]/10 border-[#687FA3]/30 text-[#687FA3]",
      dot: "bg-[#687FA3]",
    },
    cancelled: {
      label: "Cancelled",
      cls: "bg-red-500/10 border-red-500/30 text-red-400",
      dot: "bg-red-400",
    },
  };
  const s = map[status] ?? {
    label: status,
    cls: "bg-white/5 border-white/10 text-white/50",
    dot: "bg-white/30",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-widest ${s.cls}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();

  // undefined = still resolving; null = no user
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [player, setPlayer] = useState<Player | null>(null);
  const [signups, setSignups] = useState<SignupRow[]>([]);
  const [openEvents, setOpenEvents] = useState<Event[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  // ── Claim flow ─────────────────────────────────────────────────────────────
  const [claimStatus, setClaimStatus] = useState<ClaimStatus | null>(null);
  const [claimablePlayers, setClaimablePlayers] = useState<ClaimablePlayer[]>(
    [],
  );
  const [claimSearch, setClaimSearch] = useState("");
  const [claimTarget, setClaimTarget] = useState<number | null>(null);
  const [claimSubmitting, setClaimSubmitting] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  // ── New player self-registration ───────────────────────────────────────────
  const [showNewPlayerForm, setShowNewPlayerForm] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [newPlayerNickname, setNewPlayerNickname] = useState("");
  const [newPlayerSubmitting, setNewPlayerSubmitting] = useState(false);
  const [newPlayerError, setNewPlayerError] = useState<string | null>(null);
  const {
    handleSignup,
    loading: payLoading,
    error: payError,
    result: signupResult,
  } = useEventSignup();

  // ── Auth ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user === null) router.replace("/events/register");
  }, [user, router]);

  // ── Data ───────────────────────────────────────────────────────────────────
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
          "event_id, name, event_type, registration_fee, requires_payment, start_date, end_date, registration_status, status, created_at, updated_at",
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
      // No player linked to this email — check for an existing claim
      const { data: existingClaim } = await supabase
        .from("player_claims")
        .select("id, status")
        .eq("claimed_by_email", user?.email ?? "")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingClaim?.status === "pending") {
        setClaimStatus("pending");
      } else if (existingClaim?.status === "rejected") {
        setClaimStatus("rejected");
      } else {
        setClaimStatus("none");
      }

      // Load claimable players for the claim search UI
      const { data: claimableRows } = await supabase
        .from("players")
        .select("player_id, name, nickname")
        .is("email", null)
        .eq("is_profile_complete", true)
        .order("name", { ascending: true });
      setClaimablePlayers((claimableRows ?? []) as ClaimablePlayer[]);

      setDataLoading(false);
      return;
    }

    if (p) {
      const supsResult = await supabase
        .from("signups")
        .select(
          "id, event_id, status, event_type, created_at, event:events(event_id, name, start_date, end_date, registration_status, status)",
        )
        .eq("player_id", p.player_id)
        .order("created_at", { ascending: false });

      // Supabase infers FK joins as arrays; cast via unknown for correct runtime shape
      let typedSups = (supsResult.data ?? []) as unknown as SignupRow[];

      setSignups(typedSups);

      // Filter out events already signed up for
      const signedUpEventIds = new Set(typedSups.map((s) => s.event_id));
      setOpenEvents(
        ((openEventRows ?? []) as Event[]).filter(
          (s) => !signedUpEventIds.has(s.event_id),
        ),
      );
    } else {
      setSignups([]);
      setOpenEvents((openEventRows ?? []) as Event[]);
    }

    setDataLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user, load]);

  useEffect(() => {
    if (signupResult === "registered") {
      void load();
    }
  }, [signupResult, load]);

  const handleClaim = useCallback(async () => {
    if (!claimTarget || !user) return;
    setClaimSubmitting(true);
    setClaimError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setClaimError("Session expired. Please sign in again.");
        return;
      }
      const res = await fetch("/api/players/claim", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ player_id: claimTarget }),
      });
      const json = (await res.json()) as { claimed?: boolean; error?: string };
      if (json.claimed) {
        setClaimStatus("pending");
      } else {
        setClaimError(json.error ?? "Failed to submit claim.");
      }
    } catch {
      setClaimError("Network error. Please try again.");
    } finally {
      setClaimSubmitting(false);
    }
  }, [claimTarget, user]);

  const handleNewPlayer = useCallback(async () => {
    if (!user?.email || !newPlayerName.trim()) return;
    setNewPlayerSubmitting(true);
    setNewPlayerError(null);
    try {
      const name = newPlayerName.trim();
      const nickname = newPlayerNickname.trim() || (name.split(" ")[0] ?? name);
      const { data: created, error: createError } = await supabase
        .from("players")
        .insert({
          name,
          nickname,
          email: user.email,
          image_link:
            (user.user_metadata?.avatar_url as string | undefined) ?? null,
          is_profile_complete: false,
          auto_renew_season: false,
        })
        .select("*")
        .single();
      if (createError) {
        setNewPlayerError(createError.message ?? "Failed to create profile.");
        return;
      }
      setPlayer(created as Player);
      setClaimStatus(null);
    } catch {
      setNewPlayerError("Unexpected error. Please try again.");
    } finally {
      setNewPlayerSubmitting(false);
    }
  }, [user, newPlayerName, newPlayerNickname]);

  // ── Match stats (from existing hook) ──────────────────────────────────────
  const {
    matches,
    latestRating,
    loading: matchesLoading,
  } = usePlayerMatches(player ? String(player.player_id) : null);

  const completedMatches = matches.filter((m) => m.status === "completed");
  const wins = completedMatches.filter((m) => {
    const myTeam = m.teams.find(
      (t) =>
        String(t.player_1?.player_id) === String(player?.player_id) ||
        String(t.player_2?.player_id) === String(player?.player_id),
    );
    return myTeam && m.winner_team === myTeam.team_number;
  }).length;
  const losses = completedMatches.length - wins;

  async function handleSignOut() {
    try {
      await supabase.auth.signOut();
    } finally {
      window.location.replace("/");
    }
  }

  // ── Loading / redirect states ──────────────────────────────────────────────

  if (user === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0E1523]">
        <div className="w-8 h-8 border-2 border-[#00C8DC] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (user === null) return null;

  const displayName =
    player?.name ?? user.user_metadata?.full_name ?? user.email ?? "Player";
  const avatarUrl = user.user_metadata?.avatar_url as string | undefined;
  const recentMatches = matches.slice(0, 5);

  const filteredClaimable = claimablePlayers.filter(
    (p) =>
      claimSearch === "" ||
      p.name.toLowerCase().includes(claimSearch.toLowerCase()) ||
      p.nickname.toLowerCase().includes(claimSearch.toLowerCase()),
  );

  // ── Render ─────────────────────────────────────────────────────────────────

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

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 md:py-14 space-y-12">
        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-4">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt="avatar"
              className="w-16 h-16 rounded-full border-2 border-[#00C8DC]/30 shadow-lg"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-[#162032] border border-[#687FA3]/20 flex items-center justify-center">
              <Users size={24} className="text-[#687FA3]" />
            </div>
          )}
          <div>
            <p className="text-[#687FA3] text-[10px] font-black uppercase tracking-[0.3em] mb-1">
              Player Dashboard
            </p>
            <h1 className="text-3xl md:text-4xl font-black italic uppercase tracking-tighter leading-none">
              {displayName}
            </h1>
            {player?.nickname && (
              <p className="text-[#687FA3] text-sm mt-1">
                &ldquo;{player.nickname}&rdquo;
              </p>
            )}
          </div>
        </div>

        {dataLoading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-[#00C8DC] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !player ? (
          /* ── No player linked: claim or register new ──────────────────────── */
          <div className="space-y-6">
            {claimStatus === "pending" && (
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-6 flex gap-4">
                <span className="text-2xl mt-0.5">⏳</span>
                <div>
                  <p className="font-bold text-amber-300 mb-1">
                    Claim Pending Review
                  </p>
                  <p className="text-amber-200/60 text-sm leading-relaxed">
                    Your request to claim a player profile has been submitted.
                    An admin will review it shortly. You&apos;ll be able to
                    register for events once it&apos;s approved.
                  </p>
                </div>
              </div>
            )}

            {claimStatus === "rejected" && (
              <div className="space-y-4">
                <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-6 flex gap-4">
                  <span className="text-2xl mt-0.5">✗</span>
                  <div>
                    <p className="font-bold text-red-400 mb-1">
                      Claim Rejected
                    </p>
                    <p className="text-red-200/60 text-sm leading-relaxed">
                      Your profile claim was not approved. You can submit a new
                      claim or register as a new player.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setClaimStatus("none")}
                  className="text-[11px] font-black uppercase tracking-widest text-[#687FA3] hover:text-white transition-colors"
                >
                  ← Try again
                </button>
              </div>
            )}

            {claimStatus === "none" && !showNewPlayerForm && (
              <div className="space-y-4">
                <p className="text-[#687FA3] text-sm">
                  Your Google account is not linked to a player profile yet. Are
                  you an existing player?
                </p>

                {/* ── Claim existing profile ────────────────────────── */}
                <div className="bg-[#162032] border border-[#687FA3]/10 rounded-2xl p-6 space-y-4">
                  <div className="flex items-center gap-2">
                    <Link2 size={14} className="text-[#00C8DC] shrink-0" />
                    <p className="font-bold text-sm">
                      Claim an existing profile
                    </p>
                  </div>
                  <p className="text-[#687FA3] text-xs leading-relaxed">
                    If you&apos;ve played in previous seasons, find your name
                    below and submit a claim. An admin will verify and link your
                    account.
                  </p>

                  <div className="relative">
                    <Search
                      size={13}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-[#687FA3]"
                    />
                    <input
                      type="text"
                      value={claimSearch}
                      onChange={(e) => setClaimSearch(e.target.value)}
                      placeholder="Search by name…"
                      className="w-full bg-[#0E1523] border border-[#687FA3]/20 rounded-xl pl-8 pr-4 py-2.5 text-sm text-white placeholder:text-[#687FA3]/50 focus:outline-none focus:border-[#00C8DC]/50 transition-colors"
                    />
                  </div>

                  {claimSearch && filteredClaimable.length === 0 && (
                    <p className="text-[#687FA3] text-xs text-center py-2">
                      No players found.
                    </p>
                  )}

                  {filteredClaimable.length > 0 && (
                    <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                      {filteredClaimable.map((p) => (
                        <button
                          key={p.player_id}
                          type="button"
                          onClick={() =>
                            setClaimTarget(
                              claimTarget === p.player_id ? null : p.player_id,
                            )
                          }
                          className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-left text-sm transition-all border ${
                            claimTarget === p.player_id
                              ? "border-[#00C8DC]/50 bg-[#00C8DC]/5 text-white"
                              : "border-transparent hover:border-[#687FA3]/20 hover:bg-white/2 text-white/80"
                          }`}
                        >
                          <span className="font-medium">{p.name}</span>
                          <span className="text-[#687FA3] text-xs">
                            {p.nickname}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {claimError && (
                    <p className="text-red-400 text-xs bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                      {claimError}
                    </p>
                  )}

                  <button
                    onClick={() => void handleClaim()}
                    disabled={!claimTarget || claimSubmitting}
                    className="w-full flex items-center justify-center gap-2 bg-[#00C8DC] hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed text-[#0E1523] font-black text-[11px] uppercase tracking-widest py-3 rounded-xl transition-all"
                  >
                    {claimSubmitting ? (
                      <span className="w-4 h-4 border-2 border-[#0E1523] border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <Link2 size={13} />
                        Submit Claim
                      </>
                    )}
                  </button>
                </div>

                {/* ── New player ───────────────────────────────────────── */}
                <button
                  type="button"
                  onClick={() => {
                    const full =
                      (
                        user.user_metadata?.full_name as string | undefined
                      )?.trim() ??
                      user.email?.split("@")[0] ??
                      "";
                    setNewPlayerName(full);
                    setNewPlayerNickname(full.split(" ")[0] ?? "");
                    setShowNewPlayerForm(true);
                  }}
                  className="w-full flex items-center justify-center gap-2 bg-transparent border border-[#687FA3]/20 hover:border-[#687FA3]/50 text-[#687FA3] hover:text-white font-black text-[11px] uppercase tracking-widest py-3 rounded-xl transition-all"
                >
                  <UserPlus size={13} />
                  I&apos;m a new player
                </button>
              </div>
            )}

            {claimStatus === "none" && showNewPlayerForm && (
              <div className="bg-[#162032] border border-[#687FA3]/10 rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <UserPlus size={14} className="text-[#00C8DC] shrink-0" />
                  <p className="font-bold text-sm">Create a new profile</p>
                </div>
                <p className="text-[#687FA3] text-xs leading-relaxed">
                  This will create a new player record linked to your Google
                  account. An admin will verify it before you can register for
                  events.
                </p>

                <div>
                  <label className="block text-xs font-bold text-[#687FA3] uppercase tracking-widest mb-2">
                    Full name
                  </label>
                  <input
                    type="text"
                    value={newPlayerName}
                    onChange={(e) => setNewPlayerName(e.target.value)}
                    placeholder="e.g. Juan dela Cruz"
                    className="w-full bg-[#0E1523] border border-[#687FA3]/20 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-[#687FA3]/50 focus:outline-none focus:border-[#00C8DC]/50 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#687FA3] uppercase tracking-widest mb-2">
                    Nickname
                  </label>
                  <input
                    type="text"
                    value={newPlayerNickname}
                    onChange={(e) => setNewPlayerNickname(e.target.value)}
                    placeholder="e.g. Juan"
                    className="w-full bg-[#0E1523] border border-[#687FA3]/20 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-[#687FA3]/50 focus:outline-none focus:border-[#00C8DC]/50 transition-colors"
                  />
                </div>

                {newPlayerError && (
                  <p className="text-red-400 text-xs bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                    {newPlayerError}
                  </p>
                )}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowNewPlayerForm(false)}
                    className="flex-1 border border-[#687FA3]/20 hover:border-[#687FA3]/50 text-[#687FA3] hover:text-white font-black text-[11px] uppercase tracking-widest py-3 rounded-xl transition-all"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleNewPlayer()}
                    disabled={
                      !newPlayerName.trim() ||
                      !newPlayerNickname.trim() ||
                      newPlayerSubmitting
                    }
                    className="flex-1 flex items-center justify-center gap-2 bg-[#00C8DC] hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed text-[#0E1523] font-black text-[11px] uppercase tracking-widest py-3 rounded-xl transition-all"
                  >
                    {newPlayerSubmitting ? (
                      <span className="w-4 h-4 border-2 border-[#0E1523] border-t-transparent rounded-full animate-spin" />
                    ) : (
                      "Create Profile"
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-12">
            {/* ── New player: pending verification ─────────────────────────── */}
            {player && !player.is_profile_complete && (
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-5 flex gap-4">
                <span className="text-2xl">⏳</span>
                <div>
                  <p className="font-bold text-amber-300 mb-1">
                    Pending Verification
                  </p>
                  <p className="text-amber-200/60 text-sm leading-relaxed">
                    Your account is awaiting admin approval. Once verified
                    you&apos;ll be able to register for events. No action needed
                    on your end — the league admin will review your request
                    shortly.
                  </p>
                </div>
              </div>
            )}

            {/* ── Player Stats ─────────────────────────────────────────────── */}
            {player && (
              <section>
                <SectionHeading
                  icon={<TrendingUp size={14} />}
                  label="Player Stats"
                />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
                  <StatCard
                    label="Rating"
                    value={
                      matchesLoading
                        ? "…"
                        : latestRating !== null
                          ? latestRating.toFixed(2)
                          : player.latest_rating != null
                            ? player.latest_rating.toFixed(2)
                            : "–"
                    }
                    highlight
                  />
                  <StatCard
                    label="Wins"
                    value={matchesLoading ? "…" : String(wins)}
                  />
                  <StatCard
                    label="Losses"
                    value={matchesLoading ? "…" : String(losses)}
                  />
                  <StatCard
                    label="Matches"
                    value={
                      matchesLoading ? "…" : String(completedMatches.length)
                    }
                  />
                </div>
                {player && (
                  <div className="mt-3 text-right">
                    <Link
                      href={`/players?playerId=${encodeURIComponent(player.player_id)}`}
                      className="text-[11px] font-black uppercase tracking-widest text-[#687FA3] hover:text-[#00C8DC] transition-colors"
                    >
                      Full profile →
                    </Link>
                  </div>
                )}
              </section>
            )}

            {/* ── Event Signup Status ───────────────────────────────────────── */}
            <section>
              <SectionHeading
                icon={<Calendar size={14} />}
                label="Event Registration Status"
              />

              <div className="mt-5 space-y-3">
                {/* Existing signups */}
                {signups.length > 0 ? (
                  signups.map((s) => (
                    <div
                      key={s.id}
                      className="bg-[#162032] border border-[#687FA3]/10 rounded-2xl px-5 py-4 flex items-center justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-sm">
                          {eventLabel(s.event)}
                        </p>
                        <p className="text-[#687FA3] text-xs mt-0.5">
                          Registered{" "}
                          {new Date(s.created_at).toLocaleDateString("en-PH", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <SignupBadge status={s.status} />
                        {s.status === "registered" &&
                          (s.event as Event & { requires_payment?: boolean })
                            ?.requires_payment === true && (
                            <button
                              onClick={() => void handleSignup(s.event_id)}
                              disabled={payLoading}
                              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-[#0E1523] font-black text-[10px] uppercase tracking-widest px-4 py-2 rounded-full transition-all"
                            >
                              {payLoading ? (
                                <span className="w-3 h-3 border-2 border-[#0E1523] border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <>
                                  Pay Now <ChevronRight size={12} />
                                </>
                              )}
                            </button>
                          )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="bg-[#162032] border border-[#687FA3]/10 rounded-2xl p-5 text-[#687FA3] text-sm">
                    You are not registered for any event yet.
                  </div>
                )}
              </div>

              {/* Open events CTA */}
              {openEvents.length > 0 && (
                <div className="pt-4 space-y-3">
                  <p className="text-[#687FA3] text-[10px] font-black uppercase tracking-[0.3em]">
                    Open for Registration
                  </p>
                  {openEvents.map((event) => (
                    <div
                      key={event.event_id}
                      className="bg-[#162032] border border-[#00C8DC]/20 hover:border-[#00C8DC]/40 rounded-2xl px-5 py-5 flex items-center justify-between gap-4 transition-colors"
                    >
                      <div>
                        <p className="font-bold">{eventLabel(event)}</p>
                        {event.start_date && event.end_date && (
                          <p className="text-[#687FA3] text-xs mt-0.5">
                            {new Date(event.start_date).toLocaleDateString(
                              "en-PH",
                              { month: "short", day: "numeric" },
                            )}
                            {" – "}
                            {new Date(event.end_date).toLocaleDateString(
                              "en-PH",
                              {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              },
                            )}
                          </p>
                        )}
                        <p className="text-[#00C8DC] text-xs font-bold mt-1">
                          {(event as Event & { requires_payment?: boolean })
                            .requires_payment === false
                            ? "Free"
                            : `₱${(event.registration_fee ?? 5).toLocaleString()} registration fee`}
                        </p>
                      </div>
                      {!player || !player.is_profile_complete ? (
                        <span className="text-amber-400/70 text-xs font-bold">
                          Verification required
                        </span>
                      ) : (
                        <button
                          onClick={() => void handleSignup(event.event_id)}
                          disabled={payLoading}
                          className="flex items-center gap-2 bg-[#00C8DC] hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed text-[#0E1523] font-black text-[11px] uppercase tracking-widest px-5 py-2.5 rounded-full transition-all shrink-0"
                        >
                          {payLoading ? (
                            <span className="w-4 h-4 border-2 border-[#0E1523] border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <>
                              Sign Up <ChevronRight size={14} />
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  ))}

                  {payError && (
                    <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-xl px-4 py-3">
                      {payError}
                    </p>
                  )}
                </div>
              )}
            </section>

            {/* ── Match History ─────────────────────────────────────────────── */}
            {player && (
              <section>
                <SectionHeading
                  icon={<Trophy size={14} />}
                  label="Match History"
                />

                <div className="mt-5">
                  {matchesLoading ? (
                    <div className="space-y-3">
                      {[...Array(3)].map((_, i) => (
                        <div
                          key={i}
                          className="bg-[#162032]/50 border border-[#687FA3]/10 rounded-2xl h-20 animate-pulse"
                        />
                      ))}
                    </div>
                  ) : recentMatches.length === 0 ? (
                    <div className="bg-[#162032] border border-[#687FA3]/10 rounded-2xl p-5 text-[#687FA3] text-sm">
                      No matches recorded yet.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {recentMatches.map((match) => {
                        const myTeam = match.teams.find(
                          (t) =>
                            String(t.player_1?.player_id) ===
                              String(player.player_id) ||
                            String(t.player_2?.player_id) ===
                              String(player.player_id),
                        );
                        const isWin =
                          myTeam !== undefined &&
                          match.status === "completed" &&
                          match.winner_team === myTeam.team_number;
                        const oppTeam = match.teams.find(
                          (t) => t.team_number !== myTeam?.team_number,
                        );
                        const oppLabel =
                          [oppTeam?.player_1?.name, oppTeam?.player_2?.name]
                            .filter(Boolean)
                            .join(" & ") || "TBD";

                        // Set score summary e.g. "6‑3  3‑6  7‑5"
                        const setScores = (match.sets ?? [])
                          .map((s) => `${s.team_1_games}‑${s.team_2_games}`)
                          .join("  ");

                        return (
                          <div
                            key={match.match_id}
                            className="bg-[#162032]/60 border border-[#687FA3]/10 hover:border-[#687FA3]/30 rounded-2xl px-5 py-4 flex items-center gap-4 transition-colors"
                          >
                            {/* Win/loss stripe */}
                            <div
                              className={`w-1 h-10 rounded-full shrink-0 ${
                                match.status !== "completed"
                                  ? "bg-[#687FA3]/20"
                                  : isWin
                                    ? "bg-emerald-500"
                                    : "bg-red-500/60"
                              }`}
                            />

                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-sm truncate">
                                vs {oppLabel}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                <span className="text-[#687FA3] text-xs">
                                  {formatMatchDate(match.date_local)}
                                </span>
                                {match.event_id && (
                                  <span className="bg-[#00C8DC]/10 text-[#00C8DC] text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full">
                                    S{match.event_id}
                                  </span>
                                )}
                                {match.type && (
                                  <span className="text-[#687FA3]/60 text-[9px] font-bold uppercase">
                                    {match.type}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="text-right shrink-0 space-y-0.5">
                              {match.status === "completed" ? (
                                <p
                                  className={`text-[11px] font-black uppercase tracking-widest ${isWin ? "text-emerald-400" : "text-red-400"}`}
                                >
                                  {isWin ? "Win" : "Loss"}
                                </p>
                              ) : (
                                <p className="text-[11px] font-black uppercase tracking-widest text-[#687FA3]">
                                  {match.status}
                                </p>
                              )}
                              {setScores && (
                                <p className="text-[9px] text-[#687FA3]/60 font-mono">
                                  {setScores}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {matches.length > 5 && (
                        <Link
                          href={`/players?playerId=${encodeURIComponent(player.player_id)}`}
                          className="flex items-center justify-center gap-1 text-[11px] font-black uppercase tracking-widest text-[#687FA3] hover:text-[#00C8DC] transition-colors py-4"
                        >
                          View all {matches.length} matches{" "}
                          <ChevronRight size={12} />
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeading({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 text-[#687FA3] border-b border-[#687FA3]/10 pb-3">
      {icon}
      <span className="text-[10px] font-black uppercase tracking-[0.3em]">
        {label}
      </span>
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="bg-[#162032] border border-[#687FA3]/10 hover:border-[#00C8DC]/30 rounded-2xl p-5 transition-all">
      <div
        className={`text-3xl font-black tracking-tighter mb-1 ${highlight ? "text-[#00C8DC]" : "text-white"}`}
      >
        {value}
      </div>
      <div className="text-[#687FA3] text-[9px] font-black uppercase tracking-[0.2em]">
        {label}
      </div>
    </div>
  );
}
