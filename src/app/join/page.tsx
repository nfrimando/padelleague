"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import ProfileLinkingPanel from "@/components/ProfileLinkingPanel";
import SiteHeader from "@/components/SiteHeader";
import { supabase } from "@/lib/supabase";
import { fetchPlayerByEmail } from "@/lib/playerLookup";
import type { User } from "@supabase/supabase-js";

type ExistingPlayerLookup = {
  player_id: number;
  name: string;
  is_profile_complete: boolean;
};

type ApplyResponse = {
  applied?: boolean;
  error?: string;
};

const COUNTRY_CODES = [
  { value: "+63", label: "🇵🇭 +63" },
  { value: "+1", label: "🇺🇸 +1" },
  { value: "+44", label: "🇬🇧 +44" },
  { value: "+61", label: "🇦🇺 +61" },
  { value: "+65", label: "🇸🇬 +65" },
  { value: "other", label: "Other" },
] as const;

function JoinPageContent() {
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [alreadyMember, setAlreadyMember] = useState(false);
  const [existingPlayer, setExistingPlayer] =
    useState<ExistingPlayerLookup | null>(null);
  const [fullName, setFullName] = useState("");
  const [nickname, setNickname] = useState("");
  const [countryCode, setCountryCode] = useState<string>("+63");
  const [customCountryCode, setCustomCountryCode] = useState("");
  const [contact, setContact] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    async function init() {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      setUser(currentUser ?? null);
      setExistingPlayer(null);
      setAlreadyMember(false);

      if (currentUser) {
        const full =
          (
            currentUser.user_metadata?.full_name as string | undefined
          )?.trim() || "";
        if (full) {
          setFullName(full);
          setNickname(full.split(" ")[0] ?? "");
        }

        if (currentUser.email) {
          const { player } = await fetchPlayerByEmail<ExistingPlayerLookup>({
            email: currentUser.email,
            select: "player_id, name, is_profile_complete",
          });
          setExistingPlayer(player ?? null);
          if (player?.is_profile_complete) {
            setAlreadyMember(true);
          }
        }
      }

      setLoading(false);
    }

    void init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleGoogleSignIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/join`,
        queryParams: { prompt: "select_account" },
      },
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedContact = contact.trim();
    const normalizedPrefix =
      countryCode === "other" ? customCountryCode.trim() : countryCode;
    if (!fullName.trim() || !nickname.trim() || !normalizedContact) {
      setError("Full name, nickname, and contact number are required.");
      return;
    }

    if (!normalizedPrefix || !/^\+\d{1,4}$/.test(normalizedPrefix)) {
      setError("Please enter a valid country code (example: +63).");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }

      const res = await fetch("/api/membership/apply", {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: fullName.trim(),
          nickname: nickname.trim(),
          contact: `${normalizedPrefix} ${normalizedContact}`,
        }),
      });

      const json = (await res.json()) as ApplyResponse;

      if (!res.ok || !json.applied) {
        setError(json.error ?? "Failed to submit application.");
        return;
      }

      setSubmitted(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0E1523]">
        <div className="w-8 h-8 border-2 border-[#00C8DC] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const authenticated = Boolean(user);
  const showAuthenticatedApplication =
    authenticated && searchParams.get("apply") === "1";
  const isPendingVerification = Boolean(
    existingPlayer && !existingPlayer.is_profile_complete,
  );
  const showProfileLinking =
    authenticated &&
    !alreadyMember &&
    !isPendingVerification &&
    !existingPlayer &&
    !showAuthenticatedApplication;

  return (
    <div className="min-h-screen bg-[#0E1523] text-white flex flex-col">
      <SiteHeader />

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <h1 className="text-3xl font-black italic uppercase tracking-tighter mb-2">
            Join The League
          </h1>
          <p className="text-white/50 mb-8 text-sm">
            Apply for membership. Admin approval is required before event
            registration.
          </p>

          {authenticated && alreadyMember ? (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center space-y-4">
              <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-4 py-2 rounded-lg text-sm font-bold">
                ✓ You are already a verified member
              </div>
              <Link
                href="/dashboard"
                className="inline-block text-[#00C8DC] text-sm font-bold hover:underline"
              >
                Go to your dashboard →
              </Link>
            </div>
          ) : authenticated && isPendingVerification ? (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-8 space-y-4">
              <div className="flex gap-3">
                <span className="text-xl">⏳</span>
                <div>
                  <p className="font-bold text-amber-300 mb-1">
                    Pending Verification
                  </p>
                  <p className="text-white/60 text-sm leading-relaxed">
                    Your account is waiting for admin approval before you can
                    become a verified member. No need to submit another
                    application.
                  </p>
                </div>
              </div>
              <Link
                href="/dashboard"
                className="inline-block text-[#00C8DC] text-sm font-bold hover:underline"
              >
                Go to your dashboard →
              </Link>
            </div>
          ) : showProfileLinking && user ? (
            <ProfileLinkingPanel user={user} newPlayerHref="/join?apply=1" />
          ) : submitted ? (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center space-y-4">
              <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-4 py-2 rounded-lg text-sm font-bold">
                ✓ Application submitted
              </div>
              <p className="text-white/70 text-sm leading-relaxed">
                Thanks for applying. An admin will review your membership and
                verify your profile.
              </p>
              <Link
                href="/register"
                className="inline-block text-[#00C8DC] text-sm font-bold hover:underline"
              >
                Go to event registration →
              </Link>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="bg-white/5 border border-white/10 rounded-2xl p-8 space-y-6"
            >
              {!user && (
                <div className="rounded-xl border border-[#687FA3]/20 bg-[#162032] px-4 py-3">
                  <p className="text-xs text-[#687FA3] mb-2">
                    Optional: sign in with Google so we can link your email
                    automatically.
                  </p>
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    className="text-[#00C8DC] text-sm font-bold hover:underline"
                  >
                    Continue with Google
                  </button>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-[#687FA3] uppercase tracking-widest mb-2">
                  Full name
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Lance Agril Gulfo"
                  className="w-full bg-[#0E1523] border border-[#687FA3]/20 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-[#687FA3]/50 focus:outline-none focus:border-[#00C8DC]/50 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#687FA3] uppercase tracking-widest mb-2">
                  Nickname
                </label>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="e.g. Qoqo"
                  className="w-full bg-[#0E1523] border border-[#687FA3]/20 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-[#687FA3]/50 focus:outline-none focus:border-[#00C8DC]/50 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#687FA3] uppercase tracking-widest mb-2">
                  Contact number
                </label>
                <div className="flex gap-2">
                  <select
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    className="w-32 bg-[#0E1523] border border-[#687FA3]/20 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#00C8DC]/50 transition-colors"
                  >
                    {COUNTRY_CODES.map((code) => (
                      <option key={code.value} value={code.value}>
                        {code.label}
                      </option>
                    ))}
                  </select>
                  {countryCode === "other" && (
                    <input
                      type="text"
                      value={customCountryCode}
                      onChange={(e) => setCustomCountryCode(e.target.value)}
                      placeholder="e.g. +81"
                      className="w-28 bg-[#0E1523] border border-[#687FA3]/20 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-[#687FA3]/50 focus:outline-none focus:border-[#00C8DC]/50 transition-colors"
                    />
                  )}
                  <input
                    type="tel"
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    placeholder="e.g. 9171234567"
                    className="flex-1 bg-[#0E1523] border border-[#687FA3]/20 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-[#687FA3]/50 focus:outline-none focus:border-[#00C8DC]/50 transition-colors"
                  />
                </div>
              </div>

              {error && (
                <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-3">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={
                  submitting ||
                  !fullName.trim() ||
                  !nickname.trim() ||
                  (countryCode === "other" && !customCountryCode.trim()) ||
                  !contact.trim()
                }
                className="w-full bg-[#00C8DC] hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed text-[#0E1523] font-black py-3 px-6 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-[#0E1523] border-t-transparent rounded-full animate-spin" />
                    Submitting…
                  </>
                ) : (
                  "Submit Membership Application"
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#0E1523]">
          <div className="w-8 h-8 border-2 border-[#00C8DC] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <JoinPageContent />
    </Suspense>
  );
}
