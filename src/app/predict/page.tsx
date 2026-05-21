"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  usePredictableMatches,
  PREDICT_DAYS_AHEAD,
} from "@/lib/usePredictableMatches";
import { usePredictions } from "@/lib/usePredictions";
import { usePredictionCounts } from "@/lib/usePredictionCounts";
import type { PredictableMatch } from "@/lib/usePredictableMatches";
import dynamic from "next/dynamic";
import { PredictMatchCard } from "./PredictMatchCard";
import { ConfirmPredictionModal } from "./ConfirmPredictionModal";
import EmailAuthForm from "@/components/EmailAuthForm";

const PredictorLeaderboard = dynamic(
  () =>
    import("./PredictorLeaderboard").then((m) => m.PredictorLeaderboard),
  { ssr: false },
);
import SiteHeader from "@/components/SiteHeader";
import type { User } from "@supabase/supabase-js";

type PendingPick = {
  match: PredictableMatch;
  team: 1 | 2;
};

function GoogleIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function SignInGate() {
  const handleGoogleSignIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/predict`,
        queryParams: { prompt: "select_account" },
      },
    });
  };

  return (
    <div className="bg-[#162032] border border-[#687FA3]/10 rounded-2xl px-6 py-8 max-w-sm mx-auto space-y-5">
      <div className="text-center space-y-1">
        <p className="text-sm font-bold text-slate-200">Sign in to predict</p>
        <p className="text-xs text-[#687FA3] leading-relaxed">
          Only players with an existing profile can submit predictions.
        </p>
      </div>

      <button
        type="button"
        onClick={() => void handleGoogleSignIn()}
        className="w-full flex items-center justify-center gap-3 bg-white text-[#0E1523] font-semibold py-2.5 px-4 rounded-xl hover:bg-white/90 transition-colors text-sm"
      >
        <GoogleIcon />
        Continue with Google
      </button>

      <EmailAuthForm redirectTo="/predict" />
    </div>
  );
}

export default function PredictPage() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [hasPlayerProfile, setHasPlayerProfile] = useState<boolean | undefined>(
    undefined,
  );
  const [pendingPick, setPendingPick] = useState<PendingPick | null>(null);
  const [activeTab, setActiveTab] = useState<"predict" | "leaderboard">(
    "predict",
  );

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_e, session) => {
        setUser(session?.user ?? null);
      },
    );
    return () => listener.subscription.unsubscribe();
  }, []);

  // Check if the signed-in user has a player profile
  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!user?.email) {
        if (!cancelled) setHasPlayerProfile(undefined);
        return;
      }
      const { data } = await supabase
        .from("players")
        .select("player_id")
        .eq("email", user.email)
        .maybeSingle();
      if (!cancelled) setHasPlayerProfile(data !== null);
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, [user?.email]);

  const {
    matches,
    loading: matchesLoading,
    error: matchesError,
  } = usePredictableMatches();

  const matchIds = useMemo(() => matches.map((m) => m.match_id), [matches]);
  const {
    picks,
    setPicks,
    loading: picksLoading,
  } = usePredictions(user?.email ?? null, matchIds);
  const { counts: crowdCounts } = usePredictionCounts(matchIds);

  const isLoading =
    user === undefined ||
    (user !== null && hasPlayerProfile === undefined) ||
    matchesLoading ||
    picksLoading;

  const handlePickRequest = (match: PredictableMatch, team: 1 | 2) => {
    if (!user) return;
    setPendingPick({ match, team });
  };

  const handleConfirm = async () => {
    if (!pendingPick || !user) return;

    const { match, team } = pendingPick;
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken)
      throw new Error("Session expired. Please refresh and try again.");

    const res = await fetch("/api/predictions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        matchId: match.match_id,
        type: "winning_team",
        prediction: team,
        pickProbability:
          team === 1 ? match.team1WinProbability : match.team2WinProbability,
      }),
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      throw new Error(
        (payload as { error?: string }).error ?? "Failed to submit prediction.",
      );
    }

    const { id } = await res.json();

    setPicks((prev) => {
      const next = new Map(prev);
      next.set(match.match_id, {
        id,
        prediction: team,
        pickProbability:
          team === 1 ? match.team1WinProbability : match.team2WinProbability,
      });
      return next;
    });

    setPendingPick(null);
  };

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-[#0E1523]">
        <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
          {/* Page header */}
          <div>
            <h1 className="text-lg font-black uppercase tracking-widest text-slate-200">
              Predict
            </h1>
            <p className="mt-1 text-xs text-[#687FA3]">
              Pick the winner for matches in the next {PREDICT_DAYS_AHEAD}{" "}
              days. Predictions are final once submitted.
            </p>
          </div>

          {/* Disclaimer */}
          <div className="bg-amber-400/5 border border-amber-400/20 rounded-2xl px-5 py-4 flex gap-3">
            <span className="text-amber-400 text-base shrink-0 mt-0.5">⚠</span>
            <div className="space-y-0.5">
              <p className="text-[11px] font-black uppercase tracking-widest text-amber-400">
                For fun only — no real money involved
              </p>
              <p className="text-xs text-[#687FA3] leading-relaxed">
                This is a purely recreational predictions game. Points are
                virtual and have no monetary value. No wagering, no payouts --
                except bragging rights.
              </p>
            </div>
          </div>

          {/* Mobile tab bar */}
          <div className="flex lg:hidden bg-[#162032] border border-[#687FA3]/10 rounded-xl p-1 gap-1">
            <button
              type="button"
              onClick={() => setActiveTab("predict")}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                activeTab === "predict"
                  ? "bg-[#1a2840] text-slate-200"
                  : "text-[#687FA3] hover:text-slate-300"
              }`}
            >
              Predict
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("leaderboard")}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                activeTab === "leaderboard"
                  ? "bg-[#1a2840] text-slate-200"
                  : "text-[#687FA3] hover:text-slate-300"
              }`}
            >
              Leaderboard
            </button>
          </div>

          {/* Body: predict panel + leaderboard sidebar */}
          <div className="flex gap-6 items-start">
            {/* Predict panel */}
            <div
              className={`flex-1 space-y-6 min-w-0 ${activeTab === "leaderboard" ? "hidden lg:block" : ""}`}
            >
              {/* Auth gate */}
              {user === null && <SignInGate />}

              {/* Loading */}
              {isLoading && user !== null && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-72 bg-[#162032] border border-[#687FA3]/10 rounded-2xl animate-pulse"
                    />
                  ))}
                </div>
              )}

              {/* Error */}
              {!isLoading && matchesError && (
                <div className="bg-[#162032] border border-rose-500/20 rounded-2xl px-5 py-4">
                  <p className="text-sm text-rose-400">{matchesError}</p>
                </div>
              )}

              {/* Empty state */}
              {!isLoading &&
                !matchesError &&
                matches.length === 0 &&
                user !== null && (
                  <div className="bg-[#162032] border border-[#687FA3]/10 rounded-2xl px-6 py-10 text-center">
                    <p className="text-sm font-semibold text-slate-300 mb-1">
                      No upcoming matches
                    </p>
                    <p className="text-xs text-[#687FA3]">
                      There are no fully-scheduled matches in the next{" "}
                      {PREDICT_DAYS_AHEAD} days.
                    </p>
                  </div>
                )}

              {/* Match cards */}
              {!isLoading && !matchesError && user !== null && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {matches.map((match) => (
                    <PredictMatchCard
                      key={match.match_id}
                      match={match}
                      existingPick={picks.get(match.match_id) ?? null}
                      crowdCounts={crowdCounts.get(match.match_id) ?? null}
                      canPredict={hasPlayerProfile === true}
                      onPickRequest={(team) => handlePickRequest(match, team)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Leaderboard sidebar */}
            <div
              className={`w-full lg:w-72 shrink-0 ${activeTab === "predict" ? "hidden lg:block" : ""}`}
            >
              <PredictorLeaderboard />
            </div>
          </div>
        </div>
      </main>

      {pendingPick && (
        <ConfirmPredictionModal
          match={pendingPick.match}
          team={pendingPick.team}
          onConfirm={handleConfirm}
          onCancel={() => setPendingPick(null)}
        />
      )}
    </>
  );
}
