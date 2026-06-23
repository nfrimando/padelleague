"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import EmailAuthForm from "@/components/EmailAuthForm";
import {
  fetchPlayerByEmail,
  PLAYER_LOOKUP_REGISTER_SELECT,
} from "@/lib/playerLookup";
import { supabase } from "@/lib/supabase";
import { useEventSignup } from "@/lib/useEventSignup";
import {
  signupStatusLabel,
  signupStatusBadgeClass,
  type EventSignupStatus,
} from "@/lib/eventSignupStatus";
import type { User } from "@supabase/supabase-js";
import type { Event } from "@/lib/types";

type SignupStatus = "none" | EventSignupStatus;
type VerifyStatus = "verified" | "pending" | "unknown";

type RegisterLookupPlayer = {
  player_id: number;
  name: string;
  is_profile_complete: boolean;
};

type UnclaimedPlayer = {
  player_id: number;
  name: string | null;
  nickname: string | null;
};

type PlayerRegisterResponse = {
  registered?: boolean;
  error?: string;
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
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [playerName, setPlayerName] = useState("");
  const [signupStatus, setSignupStatus] = useState<SignupStatus>("none");
  const [verifyStatus, setVerifyStatus] = useState<VerifyStatus>("unknown");
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileResolved, setProfileResolved] = useState(false);
  const [unclaimedPlayers, setUnclaimedPlayers] = useState<UnclaimedPlayer[]>(
    [],
  );
  const [showPlayerSignup, setShowPlayerSignup] = useState(false);
  const [selectedUnclaimedPlayerId, setSelectedUnclaimedPlayerId] = useState<
    number | null
  >(null);
  const [playerSignupSubmitting, setPlayerSignupSubmitting] = useState(false);
  const [playerSignupError, setPlayerSignupError] = useState<string | null>(
    null,
  );
  const [playerSignupSubmitted, setPlayerSignupSubmitted] = useState(false);
  const [playerSignupName, setPlayerSignupName] = useState("");
  const {
    handleSignup,
    loading: submitting,
    error,
    result: signupResult,
  } = useEventSignup();

  useEffect(() => {
    async function init() {
      const [{ data: authData }, { data: eventData }, { data: playerData }] =
        await Promise.all([
          supabase.auth.getSession(),
          supabase
            .from("events")
            .select(
              "event_id, name, event_type, start_date, end_date, registration_status, status, created_at, updated_at",
            )
            .eq("registration_status", "open")
            .is("deleted_at", null)
            .order("event_id", { ascending: false }),
          supabase
            .from("players")
            .select("player_id, name, nickname")
            .is("email", null)
            .eq("is_profile_complete", true)
            .order("name", { ascending: true }),
        ]);

      const u = authData.session?.user ?? null;
      if (u) setUser(u);

      if (eventData && eventData.length > 0) {
        setEvents(eventData as Event[]);
        setSelectedEventId(eventData[0].event_id);
      }

      if (playerData) {
        const players = playerData as UnclaimedPlayer[];
        setUnclaimedPlayers(players);
        if (players.length > 0) {
          setSelectedUnclaimedPlayerId(players[0].player_id);
        }
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
      setSignupStatus("applied");
    }
  }, [signupResult]);
  useEffect(() => {
    if (!user) {
      setSignupStatus("none");
      setProfileLoading(false);
      setProfileResolved(false);
      return;
    }

    let active = true;

    async function lookup() {
      setProfileResolved(false);
      setProfileLoading(true);
      try {
        const { player: playerRow, error: playerLookupError } =
          await fetchPlayerByEmail<RegisterLookupPlayer>({
            email: user?.email,
            select: PLAYER_LOOKUP_REGISTER_SELECT,
          });

        if (!active) return;

        if (playerLookupError) {
          console.error("Failed player lookup on register:", playerLookupError);
        }

        let pid = playerRow?.player_id ?? null;
        setPlayerName(playerRow?.name ?? user!.user_metadata?.full_name ?? "");
        if (playerRow) {
          setVerifyStatus(
            playerRow.is_profile_complete ? "verified" : "pending",
          );
        } else {
          const { data: latestClaim } = await supabase
            .from("player_claims")
            .select("player_id, status")
            .eq("claimed_by_email", user?.email ?? "")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!active) return;

          if (
            latestClaim?.player_id &&
            (latestClaim.status === "pending" ||
              latestClaim.status === "approved")
          ) {
            pid = latestClaim.player_id;
            setVerifyStatus("pending");
          } else {
            setVerifyStatus("unknown");
          }
        }

        if (!pid || !selectedEventId) {
          setSignupStatus("none");
          return;
        }

        const { data: existing } = await supabase
          .from("signups_events")
          .select("status")
          .eq("player_id", pid)
          .eq("event_id", selectedEventId)
          .maybeSingle();

        if (!active) return;

        const status = (existing?.status as SignupStatus) ?? "none";
        setSignupStatus(status);
      } finally {
        if (active) {
          setProfileLoading(false);
          setProfileResolved(true);
        }
      }
    }

    void lookup();

    return () => {
      active = false;
    };
  }, [user, selectedEventId]);

  useEffect(() => {
    if (!user || profileLoading || !profileResolved) return;
    if (verifyStatus === "unknown" && signupStatus === "none") {
      router.replace("/join?from=register");
    }
  }, [
    user,
    profileLoading,
    profileResolved,
    verifyStatus,
    signupStatus,
    router,
  ]);

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

  const handlePlayerSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedEventId) {
      setPlayerSignupError("No event is open for registration right now.");
      return;
    }

    if (!selectedUnclaimedPlayerId) {
      setPlayerSignupError("Select a player first.");
      return;
    }

    setPlayerSignupSubmitting(true);
    setPlayerSignupError(null);

    try {
      const res = await fetch("/api/events/register/player", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event_id: selectedEventId,
          player_id: selectedUnclaimedPlayerId,
        }),
      });

      const json = (await res.json()) as PlayerRegisterResponse;

      if (!res.ok || !json.registered) {
        setPlayerSignupError(json.error ?? "Failed to register player.");
        return;
      }

      const picked = unclaimedPlayers.find(
        (p) => p.player_id === selectedUnclaimedPlayerId,
      );
      setPlayerSignupName(
        picked?.name || picked?.nickname || "Selected player",
      );
      setPlayerSignupSubmitted(true);
    } catch {
      setPlayerSignupError("Network error. Please try again.");
    } finally {
      setPlayerSignupSubmitting(false);
    }
  };

  const selectedEvent = events.find((e) => e.event_id === selectedEventId);

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

          {!user && events.length === 0 && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center space-y-3">
              <p className="text-white/70 text-sm">
                No events are open for registration right now. Check back soon.
              </p>
              <Link
                href="/events"
                className="inline-block mt-2 text-[#00C8DC] text-sm font-bold hover:underline"
              >
                Back to events →
              </Link>
            </div>
          )}

          {!user && events.length > 0 && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
              <p className="text-white/70 mb-6">
                Sign in with Google to continue. If your email is linked to a
                player profile, you&apos;ll be able to register immediately.
              </p>
              <button
                onClick={handleGoogleSignIn}
                className="w-full flex items-center justify-center gap-3 bg-white text-[#0E1523] font-semibold py-3 px-6 rounded-xl hover:bg-white/90 transition-colors"
              >
                <GoogleIcon />
                Continue with Google
              </button>
              <EmailAuthForm redirectTo="/register" />
              <div className="mt-6 border-t border-white/10 pt-6">
                <button
                  type="button"
                  onClick={() => {
                    setShowPlayerSignup(true);
                    setPlayerSignupError(null);
                  }}
                  className="flex w-full items-center justify-center rounded-xl border border-[#687FA3]/20 px-6 py-3 text-sm font-bold text-white/80 transition-colors hover:border-[#00C8DC]/50 hover:text-white"
                >
                  Signup without email
                </button>
              </div>
            </div>
          )}

          {!user && events.length > 0 && showPlayerSignup && (
            <form
              onSubmit={handlePlayerSignupSubmit}
              className="mt-4 bg-white/5 border border-white/10 rounded-2xl p-8 space-y-6"
            >
              <div>
                <p className="text-white font-bold text-lg">
                  Signup without email
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-white/50 text-sm">
                    Choose your player profile from unclaimed players.
                  </span>
                  <span className="relative group">
                    <button
                      type="button"
                      tabIndex={0}
                      aria-label="Info about profile approval"
                      className="ml-1 text-amber-300 hover:text-amber-200 focus:outline-none"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="inline w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <circle
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="2"
                          fill="none"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 16v-4m0-4h.01"
                        />
                      </svg>
                    </button>
                    <span className="absolute left-1/2 z-10 mt-2 w-64 -translate-x-1/2 rounded-lg bg-[#1a2233] px-4 py-3 text-xs text-white/80 shadow-lg opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto">
                      If you recently created a profile, inform an admin to
                      verify it. Once verified, you can come back here to
                      register for the event using that profile. If you
                      don&apos;t have a profile yet, select an unclaimed player
                      to register as, and an admin will help you set up your
                      account after registration.
                    </span>
                  </span>
                </div>
              </div>

              {unclaimedPlayers.length === 0 ? (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-amber-200 text-sm">
                  No unclaimed players are available right now.
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">
                    Player
                  </label>
                  <select
                    value={selectedUnclaimedPlayerId ?? ""}
                    onChange={(e) =>
                      setSelectedUnclaimedPlayerId(Number(e.target.value))
                    }
                    className="w-full bg-white text-slate-900 border border-white/20 rounded-xl px-4 py-3 focus:outline-none focus:border-[#00C8DC] dark:bg-white/10 dark:text-white transition-colors"
                  >
                    {unclaimedPlayers.map((player) => (
                      <option
                        key={player.player_id}
                        value={player.player_id}
                        className="bg-white text-slate-900 dark:bg-[#0E1523] dark:text-white"
                      >
                        {player.name ||
                          player.nickname ||
                          `Player ${player.player_id}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

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

              {playerSignupError && (
                <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-3">
                  {playerSignupError}
                </p>
              )}

              {playerSignupSubmitted && (
                <p className="text-emerald-300 text-sm bg-emerald-400/10 border border-emerald-400/20 rounded-lg px-4 py-3">
                  {playerSignupName} has been registered for{" "}
                  {selectedEvent
                    ? eventLabel(selectedEvent)
                    : "the selected event"}
                  .
                </p>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowPlayerSignup(false);
                    setPlayerSignupError(null);
                    setPlayerSignupSubmitted(false);
                  }}
                  className="flex-1 rounded-xl border border-white/15 px-4 py-3 text-sm font-bold text-white/70 transition-colors hover:border-[#00C8DC]/60 hover:text-white"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={
                    playerSignupSubmitting || unclaimedPlayers.length === 0
                  }
                  className="flex-1 bg-[#00C8DC] hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed text-[#0E1523] font-black py-3 px-6 rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  {playerSignupSubmitting ? (
                    <>
                      <span className="w-4 h-4 border-2 border-[#0E1523] border-t-transparent rounded-full animate-spin" />
                      Registering…
                    </>
                  ) : (
                    "Register Player"
                  )}
                </button>
              </div>
              <div>
                <p className="mt-3 text-xs text-white/40">
                  No profile yet? Go join the league
                </p>
                <Link
                  href="/join?from=register"
                  className="mt-2 inline-block text-xs font-bold text-[#00C8DC] hover:underline"
                >
                  Go to Join the League →
                </Link>
              </div>
            </form>
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

          {user && profileLoading && signupStatus === "none" && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-8 space-y-6 animate-pulse">
              <div className="flex items-center gap-3 pb-4 border-b border-white/10">
                <div className="w-9 h-9 rounded-full bg-white/10" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-3 w-40 bg-white/10 rounded" />
                  <div className="h-3 w-28 bg-white/10 rounded" />
                </div>
              </div>
              <div className="space-y-3">
                <div className="h-4 w-32 bg-white/10 rounded" />
                <div className="h-12 w-full bg-white/10 rounded-xl" />
              </div>
              <div className="h-10 w-full bg-white/10 rounded-xl" />
            </div>
          )}

          {user &&
            !profileLoading &&
            verifyStatus === "pending" &&
            signupStatus === "none" && (
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
                    <p className="text-xs text-white/40">
                      Signed in with Google
                    </p>
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

          {user && signupStatus !== "none" && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center space-y-4">
              <p className="text-white/50 text-sm">Signed in as</p>
              <p className="font-medium">{user.email}</p>
              <div
                className={`mx-auto flex w-fit items-center gap-2 border px-4 py-2 rounded-lg text-sm font-bold ${signupStatusBadgeClass(signupStatus)}`}
              >
                {signupStatusLabel(signupStatus)}
                {signupStatus !== "pending_payment" && (
                  <> for {selectedEvent ? eventLabel(selectedEvent) : "this event"}</>
                )}
              </div>
              {signupStatus === "pending_payment" && (
                <p className="text-white/60 text-sm">
                  Your application was accepted. Please complete payment to confirm your spot.
                </p>
              )}
              <Link
                href="/dashboard"
                className="mt-3 block text-[#00C8DC] text-sm font-bold hover:underline"
              >
                {signupStatus === "pending_payment"
                  ? "Go to dashboard to pay →"
                  : "Go to your dashboard →"}
              </Link>
            </div>
          )}

          {user &&
            !profileLoading &&
            verifyStatus === "unknown" &&
            signupStatus === "none" && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center space-y-4">
                <p className="text-white/60 text-sm">
                  No player profile is linked to your email. Redirecting to the
                  join page…
                </p>
                <Link
                  href="/join?from=register"
                  className="inline-block text-[#00C8DC] text-sm font-bold hover:underline"
                >
                  Continue to Join →
                </Link>
              </div>
            )}

          {user &&
            !profileLoading &&
            signupStatus === "none" &&
            verifyStatus === "verified" && (
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
                    <p className="text-xs text-white/40">
                      Signed in with Google
                    </p>
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
                      onChange={(e) =>
                        setSelectedEventId(Number(e.target.value))
                      }
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

          <div className="mt-6 flex justify-center">
            <Link
              href="/events"
              className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white/70 transition-colors hover:border-[#00C8DC]/60 hover:text-white"
            >
              ← Back to Events
            </Link>
          </div>
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
