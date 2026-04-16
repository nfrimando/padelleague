"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Zap,
  ChevronRight,
  TrendingUp,
  Trophy,
  Calendar,
  LogOut,
  Users,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { usePlayerMatches } from "@/lib/usePlayerMatches";
import { formatMatchDate } from "@/lib/utils";
import type { User } from "@supabase/supabase-js";
import type { Player, Season } from "@/lib/types";

// ─── Local types ──────────────────────────────────────────────────────────────

type SignupRow = {
  id: string;
  season_id: number;
  status: string;
  event_type: string;
  created_at: string;
  season: Pick<Season, "season_id" | "name" | "start_date" | "end_date" | "registration_status" | "status"> | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function seasonLabel(s: { season_id: number; name?: string | null; start_date?: string | null } | null): string {
  if (!s) return "Unknown Season";
  if (s.name) return s.name;
  if (s.start_date) return `Season ${s.season_id} · ${new Date(s.start_date).getFullYear()}`;
  return `Season ${s.season_id}`;
}

function SignupBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; dot: string }> = {
    registered:      { label: "Registered",      cls: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400", dot: "bg-emerald-400" },
    pending_payment: { label: "Pending Payment",  cls: "bg-amber-500/10 border-amber-500/30 text-amber-400",      dot: "bg-amber-400" },
    waitlisted:      { label: "Waitlisted",       cls: "bg-[#687FA3]/10 border-[#687FA3]/30 text-[#687FA3]",      dot: "bg-[#687FA3]" },
    cancelled:       { label: "Cancelled",        cls: "bg-red-500/10 border-red-500/30 text-red-400",            dot: "bg-red-400" },
  };
  const s = map[status] ?? { label: status, cls: "bg-white/5 border-white/10 text-white/50", dot: "bg-white/30" };
  return (
    <span className={`inline-flex items-center gap-1.5 border px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-widest ${s.cls}`}>
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
  const [openSeasons, setOpenSeasons] = useState<Season[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  // ── Auth ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user === null) router.replace("/register");
  }, [user, router]);

  // ── Data ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;

    async function load() {
      setDataLoading(true);

      const [
        { data: playerRow },
        { data: signupRows },
        { data: openSeasonRows },
      ] = await Promise.all([
        // Find player linked to this Google account by email
        supabase
          .from("players")
          .select("*")
          .eq("email", user!.email ?? "")
          .maybeSingle(),

        // All signups for this player (joined with season info)
        // We'll refetch once we have a player_id below
        Promise.resolve({ data: null }),

        // Open seasons — try with optional columns first, fall back to guaranteed columns
        supabase
          .from("seasons")
          .select("season_id, name, registration_fee, start_date, end_date, registration_status, status, created_at, updated_at")
          .eq("registration_status", "open")
          .order("season_id", { ascending: false })
          .then(async (r) => {
            if (!r.error) return r;
            // Optional columns not yet present — retry with guaranteed columns only
            return supabase
              .from("seasons")
              .select("season_id, start_date, end_date, registration_status, status, created_at, updated_at")
              .eq("registration_status", "open")
              .order("season_id", { ascending: false });
          }),
      ]);

      let p = playerRow as Player | null;

      // Auto-create a player record if this Google user has never registered before
      if (!p && user?.email) {
        const fullName: string =
          (user.user_metadata?.full_name as string | undefined)?.trim() ||
          user.email.split("@")[0];
        const nickname = fullName.split(" ")[0] ?? fullName;

        const { data: created } = await supabase
          .from("players")
          .insert({
            name:                fullName,
            nickname:            nickname,
            email:               user.email,
            image_link:          (user.user_metadata?.avatar_url as string | undefined) ?? null,
            is_profile_complete: false,
            auto_renew_season:   false,
          })
          .select("*")
          .single();

        p = (created as Player | null) ?? null;
      }

      setPlayer(p);

      if (p) {
        // Try to include name from the season join; fall back if column doesn't exist yet
        let supsResult = await supabase
          .from("signups")
          .select("id, season_id, status, event_type, created_at, season:seasons(season_id, name, start_date, end_date, registration_status, status)")
          .eq("player_id", p.player_id)
          .order("created_at", { ascending: false });

        if (supsResult.error) {
          supsResult = await supabase
            .from("signups")
            .select("id, season_id, status, event_type, created_at, season:seasons(season_id, start_date, end_date, registration_status, status)")
            .eq("player_id", p.player_id)
            .order("created_at", { ascending: false }) as unknown as typeof supsResult;
        }

        // Supabase infers FK joins as arrays; cast via unknown for correct runtime shape
        let typedSups = (supsResult.data ?? []) as unknown as SignupRow[];

        // ── Auto-reconcile pending_payment signups ─────────────────────────
        // If any signup is still pending_payment, ask the confirm API whether
        // PayMongo has already received the payment. This fixes the case where
        // the user paid but navigated away before the success page could confirm
        // (or when the webhook hasn't fired on localhost).
        const hasPending = typedSups.some((s) => s.status === "pending_payment");
        if (hasPending) {
          try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
              const res = await fetch("/api/payments/confirm", {
                method: "POST",
                headers: { Authorization: `Bearer ${session.access_token}` },
              });
              if (res.ok) {
                const json = await res.json() as { status: string };
                if (json.status === "registered") {
                  // Payment confirmed — re-fetch signups to get the updated status
                  let refreshed = await supabase
                    .from("signups")
                    .select("id, season_id, status, event_type, created_at, season:seasons(season_id, name, start_date, end_date, registration_status, status)")
                    .eq("player_id", p!.player_id)
                    .order("created_at", { ascending: false });

                  if (refreshed.error) {
                    refreshed = await supabase
                      .from("signups")
                      .select("id, season_id, status, event_type, created_at, season:seasons(season_id, start_date, end_date, registration_status, status)")
                      .eq("player_id", p!.player_id)
                      .order("created_at", { ascending: false }) as unknown as typeof refreshed;
                  }

                  typedSups = (refreshed.data ?? []) as unknown as SignupRow[];
                }
              }
            }
          } catch {
            // Confirm failed silently — show whatever the DB has
          }
        }

        setSignups(typedSups);

        // Filter out seasons already signed up for
        const signedUpSeasonIds = new Set(typedSups.map((s) => s.season_id));
        setOpenSeasons(
          ((openSeasonRows ?? []) as Season[]).filter(
            (s) => !signedUpSeasonIds.has(s.season_id),
          ),
        );
      } else {
        setSignups([]);
        setOpenSeasons((openSeasonRows ?? []) as Season[]);
      }

      setDataLoading(false);
    }

    load();
  }, [user]);

  // ── Match stats (from existing hook) ──────────────────────────────────────
  const { matches, latestRating, loading: matchesLoading } = usePlayerMatches(
    player ? String(player.player_id) : null,
  );

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

  // ── Sign up for season ─────────────────────────────────────────────────────
  async function handleSeasonSignup(seasonId: number) {
    if (!user) return;
    setPayLoading(true);
    setPayError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setPayError("Session expired. Please sign in again."); return; }

      const res = await fetch("/api/payments/create-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ season_id: seasonId }),
      });

      const json = await res.json();
      if (!res.ok) { setPayError(json.error ?? "Something went wrong."); return; }

      window.location.href = json.checkout_url;
    } catch {
      setPayError("Network error. Please try again.");
    } finally {
      setPayLoading(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/");
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

  const displayName = player?.name ?? user.user_metadata?.full_name ?? user.email ?? "Player";
  const avatarUrl   = user.user_metadata?.avatar_url as string | undefined;
  const recentMatches = matches.slice(0, 5);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0E1523] text-white font-sans">

      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-[#0E1523]/95 backdrop-blur-xl border-b border-[#162032]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="bg-[#00C8DC] p-1.5 rounded-md shadow-[0_0_12px_rgba(0,200,220,0.35)]">
              <div className="border border-[#0E1523] p-0.5 rounded-sm">
                <Zap className="text-[#0E1523] w-4 h-4" fill="currentColor" />
              </div>
            </div>
            <span className="font-black text-sm tracking-tighter uppercase italic hidden sm:block">
              Padel League PH
            </span>
          </Link>

          <div className="flex items-center gap-3">
            {avatarUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="avatar" className="w-8 h-8 rounded-full border border-white/10" />
            )}
            <span className="text-xs text-white/50 hidden sm:block max-w-[160px] truncate">
              {user.email}
            </span>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-[#687FA3] hover:text-white transition-colors"
            >
              <LogOut size={13} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </nav>

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
              <p className="text-[#687FA3] text-sm mt-1">&ldquo;{player.nickname}&rdquo;</p>
            )}
          </div>
        </div>

        {dataLoading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-[#00C8DC] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-12">

            {/* ── New player: pending verification ─────────────────────────── */}
            {player && !player.is_profile_complete && (
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-5 flex gap-4">
                <span className="text-2xl">⏳</span>
                <div>
                  <p className="font-bold text-amber-300 mb-1">Pending Verification</p>
                  <p className="text-amber-200/60 text-sm leading-relaxed">
                    Your account is awaiting admin approval. Once verified you&apos;ll
                    be able to register for seasons. No action needed on your end —
                    the league admin will review your request shortly.
                  </p>
                </div>
              </div>
            )}

            {/* ── Player Stats ─────────────────────────────────────────────── */}
            {player && (
              <section>
                <SectionHeading icon={<TrendingUp size={14} />} label="Player Stats" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
                  <StatCard
                    label="Rating"
                    value={
                      matchesLoading ? "…" :
                      latestRating !== null
                        ? latestRating.toFixed(0)
                        : player.latest_rating != null
                        ? player.latest_rating.toFixed(0)
                        : "–"
                    }
                    highlight
                  />
                  <StatCard label="Wins"    value={matchesLoading ? "…" : String(wins)} />
                  <StatCard label="Losses"  value={matchesLoading ? "…" : String(losses)} />
                  <StatCard label="Matches" value={matchesLoading ? "…" : String(completedMatches.length)} />
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

            {/* ── Season Signup Status ──────────────────────────────────────── */}
            <section>
              <SectionHeading icon={<Calendar size={14} />} label="Season Status" />

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
                          {seasonLabel(s.season)}
                        </p>
                        <p className="text-[#687FA3] text-xs mt-0.5">
                          {s.status === "pending_payment" ? "Payment incomplete" : "Registered"}{" "}
                          {new Date(s.created_at).toLocaleDateString("en-PH", {
                            month: "short", day: "numeric", year: "numeric",
                          })}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <SignupBadge status={s.status} />
                        {s.status === "pending_payment" && (
                          <button
                            onClick={() => handleSeasonSignup(s.season_id)}
                            disabled={payLoading}
                            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-[#0E1523] font-black text-[10px] uppercase tracking-widest px-4 py-2 rounded-full transition-all"
                          >
                            {payLoading ? (
                              <span className="w-3 h-3 border-2 border-[#0E1523] border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <>Complete Payment <ChevronRight size={12} /></>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="bg-[#162032] border border-[#687FA3]/10 rounded-2xl p-5 text-[#687FA3] text-sm">
                    You are not registered for any season yet.
                  </div>
                )}

                {/* Open seasons CTA */}
                {openSeasons.length > 0 && (
                  <div className="pt-4 space-y-3">
                    <p className="text-[#687FA3] text-[10px] font-black uppercase tracking-[0.3em]">
                      Open for Registration
                    </p>
                    {openSeasons.map((season) => (
                      <div
                        key={season.season_id}
                        className="bg-[#162032] border border-[#00C8DC]/20 hover:border-[#00C8DC]/40 rounded-2xl px-5 py-5 flex items-center justify-between gap-4 transition-colors"
                      >
                        <div>
                          <p className="font-bold">{seasonLabel(season)}</p>
                          {season.start_date && season.end_date && (
                            <p className="text-[#687FA3] text-xs mt-0.5">
                              {new Date(season.start_date).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}
                              {" – "}
                              {new Date(season.end_date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
                            </p>
                          )}
                          <p className="text-[#00C8DC] text-xs font-bold mt-1">
                            ₱{(season.registration_fee ?? 5).toLocaleString()} registration fee
                          </p>
                        </div>
                        {!player || !player.is_profile_complete ? (
                          <span className="text-amber-400/70 text-xs font-bold">Verification required</span>
                        ) : (
                          <button
                            onClick={() => handleSeasonSignup(season.season_id)}
                            disabled={payLoading}
                            className="flex items-center gap-2 bg-[#00C8DC] hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed text-[#0E1523] font-black text-[11px] uppercase tracking-widest px-5 py-2.5 rounded-full transition-all shrink-0"
                          >
                            {payLoading ? (
                              <span className="w-4 h-4 border-2 border-[#0E1523] border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <>Sign Up <ChevronRight size={14} /></>
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
              </div>
            </section>

            {/* ── Match History ─────────────────────────────────────────────── */}
            {player && (
              <section>
                <SectionHeading icon={<Trophy size={14} />} label="Match History" />

                <div className="mt-5">
                  {matchesLoading ? (
                    <div className="space-y-3">
                      {[...Array(3)].map((_, i) => (
                        <div key={i} className="bg-[#162032]/50 border border-[#687FA3]/10 rounded-2xl h-20 animate-pulse" />
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
                            String(t.player_1?.player_id) === String(player.player_id) ||
                            String(t.player_2?.player_id) === String(player.player_id),
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
                              <p className="font-bold text-sm truncate">vs {oppLabel}</p>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                <span className="text-[#687FA3] text-xs">
                                  {formatMatchDate(match.date_local)}
                                </span>
                                {match.season_id && (
                                  <span className="bg-[#00C8DC]/10 text-[#00C8DC] text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full">
                                    S{match.season_id}
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
                                <p className={`text-[11px] font-black uppercase tracking-widest ${isWin ? "text-emerald-400" : "text-red-400"}`}>
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
                          View all {matches.length} matches <ChevronRight size={12} />
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

function SectionHeading({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 text-[#687FA3] border-b border-[#687FA3]/10 pb-3">
      {icon}
      <span className="text-[10px] font-black uppercase tracking-[0.3em]">{label}</span>
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="bg-[#162032] border border-[#687FA3]/10 hover:border-[#00C8DC]/30 rounded-2xl p-5 transition-all">
      <div className={`text-3xl font-black tracking-tighter mb-1 ${highlight ? "text-[#00C8DC]" : "text-white"}`}>
        {value}
      </div>
      <div className="text-[#687FA3] text-[9px] font-black uppercase tracking-[0.2em]">{label}</div>
    </div>
  );
}
