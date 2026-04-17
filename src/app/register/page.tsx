"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";
import type { Season } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type SignupStatus =
  | "none"
  | "pending_payment"
  | "registered"
  | "waitlisted"
  | "cancelled";
type VerifyStatus = "verified" | "pending" | "unknown";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Derives a display label for a season, falling back to "Season {id}". */
function seasonLabel(s: Season): string {
  if (s.name) return s.name;
  if (s.start_date) {
    const year = new Date(s.start_date).getFullYear();
    return `Season ${s.season_id} · ${year}`;
  }
  return `Season ${s.season_id}`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RegisterPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);
  const [playerId, setPlayerId] = useState<number | null>(null); // matched by email
  const [playerName, setPlayerName] = useState("");
  const [signupStatus, setSignupStatus] = useState<SignupStatus>("none");
  const [verifyStatus, setVerifyStatus] = useState<VerifyStatus>("unknown");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Auth & initial data ────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const {
        data: { user: u },
      } = await supabase.auth.getUser();
      if (u) setUser(u);

      // Open seasons — try with optional columns, fall back if migration not yet applied
      let seasonResult = await supabase
        .from("seasons")
        .select(
          "season_id, name, registration_fee, start_date, end_date, registration_status, status, created_at, updated_at",
        )
        .eq("registration_status", "open")
        .order("season_id", { ascending: false });

      if (seasonResult.error) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        seasonResult = (await supabase
          .from("seasons")
          .select(
            "season_id, start_date, end_date, registration_status, status, created_at, updated_at",
          )
          .eq("registration_status", "open")
          .order("season_id", {
            ascending: false,
          })) as unknown as typeof seasonResult;
      }

      const { data: seasonData } = seasonResult;

      if (seasonData && seasonData.length > 0) {
        setSeasons(seasonData as Season[]);
        setSelectedSeasonId(seasonData[0].season_id);
      }

      setLoading(false);
    }

    init();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // ── Player lookup + signup check whenever user / season changes ────────────
  useEffect(() => {
    if (!user) {
      setPlayerId(null);
      setSignupStatus("none");
      return;
    }

    async function lookup() {
      // Find player by email
      const { data: playerRow } = await supabase
        .from("players")
        .select("player_id, name, is_profile_complete")
        .eq("email", user!.email ?? "")
        .maybeSingle();

      const pid = playerRow?.player_id ?? null;
      setPlayerId(pid);
      setPlayerName(playerRow?.name ?? user!.user_metadata?.full_name ?? "");
      if (playerRow) {
        setVerifyStatus(playerRow.is_profile_complete ? "verified" : "pending");
      } else {
        setVerifyStatus("unknown"); // new user, will be created on submit
      }

      if (!pid || !selectedSeasonId) {
        setSignupStatus("none");
        return;
      }

      // Check existing signup in the `signups` table
      const { data: existing } = await supabase
        .from("signups")
        .select("status")
        .eq("player_id", pid)
        .eq("season_id", selectedSeasonId)
        .maybeSingle();

      let status = (existing?.status as SignupStatus) ?? "none";

      // Auto-reconcile: if the DB still says pending_payment, ask the confirm
      // API whether PayMongo has already received the money (fixes the case
      // where the user paid but never hit the success page).
      if (status === "pending_payment") {
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (session) {
            const res = await fetch("/api/payments/confirm", {
              method: "POST",
              headers: { Authorization: `Bearer ${session.access_token}` },
            });
            if (res.ok) {
              const json = (await res.json()) as { status: string };
              if (json.status === "registered") status = "registered";
            }
          }
        } catch {
          // Confirm failed — keep the DB status
        }
      }

      setSignupStatus(status);
    }

    lookup();
  }, [user, selectedSeasonId]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleGoogleSignIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/register`,
        queryParams: { prompt: "select_account" },
      },
    });
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setPlayerId(null);
      setPlayerName("");
      setSignupStatus("none");
    } finally {
      window.location.replace("/");
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!user || !selectedSeasonId) return;

    setSubmitting(true);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setError("Session expired. Please sign in again.");
        return;
      }

      const res = await fetch("/api/payments/create-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ season_id: selectedSeasonId }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "Something went wrong. Please try again.");
        return;
      }

      window.location.href = json.checkout_url;
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const selectedSeason = seasons.find((s) => s.season_id === selectedSeasonId);
  const fee = selectedSeason?.registration_fee ?? 5;

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0E1523]">
        <div className="w-8 h-8 border-2 border-[#00C8DC] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0E1523] text-white flex flex-col">
      <SiteHeader
        rightSlot={
          user ? (
            <button
              type="button"
              onClick={handleSignOut}
              className="text-sm text-[#687FA3] hover:text-white transition-colors"
            >
              Sign out
            </button>
          ) : undefined
        }
      />

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <h1 className="text-3xl font-black italic uppercase tracking-tighter mb-2">
            Season Registration
          </h1>
          <p className="text-white/50 mb-8 text-sm">
            Register and pay to join the upcoming season.
          </p>

          {/* ── Not signed in ── */}
          {!user && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
              <p className="text-white/70 mb-6">
                Sign in with Google to continue your registration.
              </p>
              <button
                onClick={handleGoogleSignIn}
                className="w-full flex items-center justify-center gap-3 bg-white text-[#0E1523] font-semibold py-3 px-6 rounded-xl hover:bg-white/90 transition-colors"
              >
                <GoogleIcon />
                Continue with Google
              </button>
            </div>
          )}

          {/* ── No open seasons ── */}
          {user && seasons.length === 0 && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center space-y-3">
              <p className="text-white/50 text-sm">Signed in as</p>
              <p className="font-medium">{user.email}</p>
              <p className="text-white/70 text-sm mt-4">
                No seasons are open for registration right now. Check back soon!
              </p>
              <Link
                href="/dashboard"
                className="inline-block mt-2 text-[#00C8DC] text-sm font-bold hover:underline"
              >
                View your dashboard →
              </Link>
            </div>
          )}

          {/* ── Pending verification ── */}
          {user && verifyStatus === "pending" && signupStatus === "none" && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-8 space-y-5">
              <div className="flex items-center gap-3 pb-4 border-b border-white/10">
                {user.user_metadata?.avatar_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.user_metadata.avatar_url}
                    alt="avatar"
                    className="w-9 h-9 rounded-full"
                  />
                )}
                <div>
                  <p className="text-sm font-medium">{user.email}</p>
                  <p className="text-xs text-white/40">Signed in with Google</p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="text-xl">⏳</span>
                <div>
                  <p className="font-bold text-amber-300 mb-1">
                    Pending Verification
                  </p>
                  <p className="text-white/60 text-sm leading-relaxed">
                    Your account is waiting for admin approval before you can
                    register for a season. You&apos;ll be notified once
                    you&apos;re verified.
                  </p>
                </div>
              </div>
              <button
                onClick={handleSignOut}
                className="text-xs text-white/40 hover:text-white transition-colors"
              >
                Use a different account
              </button>
            </div>
          )}

          {/* ── Already registered ── */}
          {user &&
            (signupStatus === "registered" ||
              signupStatus === "pending_payment") && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center space-y-4">
                <p className="text-white/50 text-sm">Signed in as</p>
                <p className="font-medium">{user.email}</p>
                {signupStatus === "registered" ? (
                  <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-4 py-2 rounded-lg text-sm font-bold">
                    ✓ Registered for{" "}
                    {selectedSeason
                      ? seasonLabel(selectedSeason)
                      : "this season"}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 px-4 py-2 rounded-lg text-sm font-bold">
                      ⏳ Payment pending for{" "}
                      {selectedSeason
                        ? seasonLabel(selectedSeason)
                        : "this season"}
                    </div>
                    <p className="text-white/50 text-sm">
                      Your registration is reserved — complete payment to
                      confirm your spot.
                    </p>
                    <button
                      onClick={handleSubmit}
                      disabled={submitting}
                      className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-[#0E1523] font-black text-sm uppercase tracking-widest py-3 px-6 rounded-xl transition-all"
                    >
                      {submitting ? (
                        <span className="w-4 h-4 border-2 border-[#0E1523] border-t-transparent rounded-full animate-spin" />
                      ) : (
                        "Complete Payment"
                      )}
                    </button>
                    {error && (
                      <p className="text-red-400 text-xs bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                        {error}
                      </p>
                    )}
                  </div>
                )}
                <Link
                  href="/dashboard"
                  className="inline-block text-[#00C8DC] text-sm font-bold hover:underline"
                >
                  Go to your dashboard →
                </Link>
              </div>
            )}

          {/* ── Registration form ── */}
          {/* Shows for verified users (or brand-new users who don't have a record yet). */}
          {user && signupStatus === "none" && verifyStatus !== "pending" && (
            <form
              onSubmit={handleSubmit}
              className="bg-white/5 border border-white/10 rounded-2xl p-8 space-y-6"
            >
              {/* User header */}
              <div className="flex items-center gap-3 pb-4 border-b border-white/10">
                {user.user_metadata?.avatar_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.user_metadata.avatar_url}
                    alt="avatar"
                    className="w-9 h-9 rounded-full"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {playerName || user.email}
                  </p>
                  <p className="text-xs text-white/40">Signed in with Google</p>
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="text-xs text-white/40 hover:text-white transition-colors shrink-0"
                >
                  Switch
                </button>
              </div>

              {/* Season selector */}
              {seasons.length > 1 && (
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">
                    Season
                  </label>
                  <select
                    value={selectedSeasonId ?? ""}
                    onChange={(e) =>
                      setSelectedSeasonId(Number(e.target.value))
                    }
                    className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#00C8DC] transition-colors"
                  >
                    {seasons.map((s) => (
                      <option
                        key={s.season_id}
                        value={s.season_id}
                        className="bg-[#0E1523]"
                      >
                        {seasonLabel(s)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Season info */}
              {selectedSeason && (
                <div className="bg-[#162032] border border-[#687FA3]/10 rounded-xl px-4 py-3 text-sm space-y-1">
                  <p className="font-bold text-white">
                    {seasonLabel(selectedSeason)}
                  </p>
                  {selectedSeason.start_date && selectedSeason.end_date && (
                    <p className="text-[#687FA3]">
                      {new Date(selectedSeason.start_date).toLocaleDateString(
                        "en-PH",
                        { month: "short", day: "numeric", year: "numeric" },
                      )}
                      {" – "}
                      {new Date(selectedSeason.end_date).toLocaleDateString(
                        "en-PH",
                        { month: "short", day: "numeric", year: "numeric" },
                      )}
                    </p>
                  )}
                </div>
              )}

              {error && (
                <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-3">
                  {error}
                </p>
              )}

              {/* Fee summary */}
              <div className="flex items-center justify-between text-sm py-3 border-t border-white/10">
                <span className="text-white/60">Registration fee</span>
                <span className="font-bold text-[#00C8DC]">
                  ₱{fee.toLocaleString()}
                </span>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-[#00C8DC] hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed text-[#0E1523] font-black py-3 px-6 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-[#0E1523] border-t-transparent rounded-full animate-spin" />
                    Processing…
                  </>
                ) : (
                  `Register & Pay ₱${fee.toLocaleString()}`
                )}
              </button>

              <p className="text-center text-xs text-white/30">
                You will be redirected to PayMongo to complete payment.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Google icon ──────────────────────────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path
        d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"
        fill="#EA4335"
      />
    </svg>
  );
}
