"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import ProfileLinkingPanel from "@/components/ProfileLinkingPanel";
import {
  fetchPlayerByEmail,
  PLAYER_LOOKUP_REGISTER_SELECT,
} from "@/lib/playerLookup";
import { supabase } from "@/lib/supabase";
import { useEventSignup } from "@/lib/useEventSignup";
import type { User } from "@supabase/supabase-js";
import type { Event, Player } from "@/lib/types";

type SignupStatus = "none" | "registered" | "waitlisted" | "cancelled";
type VerifyStatus = "verified" | "pending" | "unknown";

type RegisterLookupPlayer = {
  player_id: number;
  name: string;
  is_profile_complete: boolean;
};

function eventLabel(e: Event): string {
  if (e.name) return e.name;
  if (e.start_date) {
    const year = new Date(e.start_date).getFullYear();
    return `Event ${e.event_id} · ${year}`;
  }
  return `Event ${e.event_id}`;
}

export default function RegisterPage() {
  const [user, setUser] = useState<User | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [playerName, setPlayerName] = useState("");
  const [signupStatus, setSignupStatus] = useState<SignupStatus>("none");
  const [verifyStatus, setVerifyStatus] = useState<VerifyStatus>("unknown");
  const [profileRefreshKey, setProfileRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const {
    handleSignup,
    loading: submitting,
    error,
    result: signupResult,
  } = useEventSignup();

  useEffect(() => {
    async function init() {
      const {
        data: { user: u },
      } = await supabase.auth.getUser();
      if (u) setUser(u);

      const { data: eventData } = await supabase
        .from("events")
        .select(
          "event_id, name, event_type, registration_fee, requires_payment, start_date, end_date, registration_status, status, created_at, updated_at",
        )
        .eq("registration_status", "open")
        .order("event_id", { ascending: false });
      if (eventData && eventData.length > 0) {
        setEvents(eventData as Event[]);
        setSelectedEventId(eventData[0].event_id);
      }

      setLoading(false);
    }

    init();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (signupResult === "registered") {
      setSignupStatus("registered");
    }
  }, [signupResult]);
  useEffect(() => {
    if (!user) {
      setSignupStatus("none");
      return;
    }

    async function lookup() {
      const { player: playerRow, error: playerLookupError } =
        await fetchPlayerByEmail<RegisterLookupPlayer>({
          email: user?.email,
          select: PLAYER_LOOKUP_REGISTER_SELECT,
        });

      if (playerLookupError) {
        console.error("Failed player lookup on register:", playerLookupError);
      }

      const pid = playerRow?.player_id ?? null;
      setPlayerName(playerRow?.name ?? user!.user_metadata?.full_name ?? "");
      if (playerRow) {
        setVerifyStatus(playerRow.is_profile_complete ? "verified" : "pending");
      } else {
        setVerifyStatus("unknown");
      }

      if (!pid || !selectedEventId) {
        setSignupStatus("none");
        return;
      }

      const { data: existing } = await supabase
        .from("signups")
        .select("status")
        .eq("player_id", pid)
        .eq("event_id", selectedEventId)
        .maybeSingle();

      let status = (existing?.status as SignupStatus) ?? "none";
      setSignupStatus(status);
    }

    lookup();
  }, [user, selectedEventId, profileRefreshKey]);

  const handleGoogleSignIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/events/register`,
        queryParams: { prompt: "select_account" },
      },
    });
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setPlayerName("");
      setSignupStatus("none");
    } finally {
      window.location.replace("/");
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!user || !selectedEventId) return;
    await handleSignup(selectedEventId);
  };

  const selectedEvent = events.find((e) => e.event_id === selectedEventId);
  const isSelectedEventFree =
    (selectedEvent as (Event & { requires_payment?: boolean }) | undefined)
      ?.requires_payment === false;
  const fee = selectedEvent?.registration_fee ?? 5;

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
            Event Registration
          </h1>
          <p className="text-white/50 mb-8 text-sm">
            Sign up for the upcoming event.
          </p>

          {!user && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
              <p className="text-white/70 mb-6">
                Sign in with Google to continue. You can claim an existing
                player profile or create a new one before registering.
              </p>
              <button
                onClick={handleGoogleSignIn}
                className="w-full flex items-center justify-center gap-3 bg-white text-[#0E1523] font-semibold py-3 px-6 rounded-xl hover:bg-white/90 transition-colors"
              >
                <GoogleIcon />
                Continue with Google
              </button>
              <p className="text-white/40 text-xs mt-4">
                New to the league?{" "}
                <Link href="/join" className="text-[#00C8DC] hover:underline">
                  Apply for membership first
                </Link>
                .
              </p>
            </div>
          )}

          {user && events.length === 0 && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center space-y-3">
              <p className="text-white/50 text-sm">Signed in as</p>
              <p className="font-medium">{user.email}</p>
              <p className="text-white/70 text-sm mt-4">
                No events are open for registration right now. Check back soon!
              </p>
              <Link
                href="/dashboard"
                className="inline-block mt-2 text-[#00C8DC] text-sm font-bold hover:underline"
              >
                View your dashboard →
              </Link>
            </div>
          )}

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
                    register for an event. You&apos;ll be notified once
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

          {user && signupStatus === "registered" && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center space-y-4">
              <p className="text-white/50 text-sm">Signed in as</p>
              <p className="font-medium">{user.email}</p>
              <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-4 py-2 rounded-lg text-sm font-bold">
                ✓ Registered for{" "}
                {selectedEvent ? eventLabel(selectedEvent) : "this event"}
              </div>
              <Link
                href="/dashboard"
                className="inline-block text-[#00C8DC] text-sm font-bold hover:underline"
              >
                Go to your dashboard →
              </Link>
              <p className="text-white/40 text-xs">
                Not in the league yet?{" "}
                <Link href="/join" className="text-[#00C8DC] hover:underline">
                  Submit a membership application
                </Link>
                .
              </p>
            </div>
          )}

          {user && verifyStatus === "unknown" && signupStatus === "none" && (
            <ProfileLinkingPanel
              user={user}
              onProfileLinked={(linkedPlayer: Player) => {
                setPlayerName(linkedPlayer.name ?? user.email ?? "");
                setVerifyStatus(
                  linkedPlayer.is_profile_complete ? "verified" : "pending",
                );
                setSignupStatus("none");
                setProfileRefreshKey((prev) => prev + 1);
              }}
            />
          )}

          {user && signupStatus === "none" && verifyStatus === "verified" && (
            <form
              onSubmit={handleSubmit}
              className="bg-white/5 border border-white/10 rounded-2xl p-8 space-y-6"
            >
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

              {events.length > 1 && (
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">
                    Event
                  </label>
                  <select
                    value={selectedEventId ?? ""}
                    onChange={(e) => setSelectedEventId(Number(e.target.value))}
                    className="w-full bg-white text-slate-900 border border-white/20 rounded-xl px-4 py-3 focus:outline-none focus:border-[#00C8DC] dark:bg-white/10 dark:text-white transition-colors"
                  >
                    {events.map((event) => (
                      <option
                        key={event.event_id}
                        value={event.event_id}
                        className="bg-white text-slate-900 dark:bg-[#0E1523] dark:text-white"
                      >
                        {eventLabel(event)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {selectedEvent && (
                <div className="bg-[#162032] border border-[#687FA3]/10 rounded-xl px-4 py-3 text-sm space-y-1">
                  <p className="font-bold text-white">
                    {eventLabel(selectedEvent)}
                  </p>
                  {selectedEvent.start_date && selectedEvent.end_date && (
                    <p className="text-[#687FA3]">
                      {new Date(selectedEvent.start_date).toLocaleDateString(
                        "en-PH",
                        { month: "short", day: "numeric", year: "numeric" },
                      )}
                      {" – "}
                      {new Date(selectedEvent.end_date).toLocaleDateString(
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

              <div className="flex items-center justify-between text-sm py-3 border-t border-white/10">
                <span className="text-white/60">
                  Registration fee (Pay later)
                </span>
                <span className="font-bold text-[#00C8DC]">
                  {isSelectedEventFree ? "Free" : `₱${fee.toLocaleString()}`}
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
                    Registering…
                  </>
                ) : (
                  "Register"
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

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
