"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import EmailAuthForm from "@/components/EmailAuthForm";
import PendingPaymentPanel from "@/components/PendingPaymentPanel";
import { supabase } from "@/lib/supabase";
import { useCurrentPlayer } from "@/lib/useCurrentPlayer";
import type { Player } from "@/lib/types";

// A pending_payment signup blocks access to the tools the same way it locks the
// dashboard. `undefined` = still checking, `null` = none owed.
type PendingSignup = {
  id: string;
  event_id: number;
  event: {
    name?: string | null;
    registration_fee?: number | null;
    payment_instructions?: string | null;
  } | null;
};

// Wraps members-only tool pages. A "member" is a signed-in user whose auth email
// maps to a row in `players`. Mirrors the dashboard/recruit gating: unauthenticated
// → sign-in / join prompt; authenticated-but-unlinked → members-only notice; member
// with a pending event payment → settle-payment screen; otherwise → renders children
// with the resolved player.
export default function MembersOnlyGate({
  children,
}: {
  children: (player: Player) => React.ReactNode;
}) {
  const pathname = usePathname();
  const { user, player, isLinked, isLoading } = useCurrentPlayer();
  const [pendingSignup, setPendingSignup] = useState<
    PendingSignup | null | undefined
  >(undefined);

  useEffect(() => {
    if (!player) return;
    let cancelled = false;
    setPendingSignup(undefined);
    void (async () => {
      const { data } = await supabase
        .from("signups_events")
        .select(
          "id, event_id, status, event:events(name, registration_fee, payment_instructions)",
        )
        .eq("player_id", player.player_id)
        .eq("status", "pending_payment")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled)
        setPendingSignup((data as unknown as PendingSignup | null) ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [player]);

  async function handleGoogleSignIn() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}${pathname}`,
        queryParams: { prompt: "select_account" },
      },
    });
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0E1523]">
        <div className="w-8 h-8 border-2 border-[#00C8DC] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Unauthenticated → sign in / join ───────────────────────────────────────
  if (!user) {
    return (
      <div className="min-h-screen bg-[#0E1523] text-white flex flex-col">
        <SiteHeader />
        <div className="flex-1 flex items-center justify-center px-4 py-10">
          <div className="w-full max-w-sm space-y-5">
            <header className="text-center space-y-1">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#00C8DC]">
                Members Only
              </p>
              <h1 className="text-xl font-black italic uppercase tracking-tighter">
                Player Tools
              </h1>
              <p className="text-white/50 text-sm">
                Sign in to access members-only tools.
              </p>
            </header>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
              <button
                type="button"
                onClick={() => void handleGoogleSignIn()}
                className="w-full flex items-center justify-center gap-3 bg-white text-[#0E1523] font-semibold py-2.5 px-4 rounded-xl hover:bg-white/90 transition-colors text-sm cursor-pointer"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
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
                Continue with Google
              </button>
              <EmailAuthForm redirectTo={pathname} />
            </div>

            <p className="text-center text-xs text-white/40">
              New to the league?{" "}
              <Link
                href="/join"
                className="text-[#00C8DC] font-bold hover:underline"
              >
                Apply to join →
              </Link>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Signed in but no linked player profile ─────────────────────────────────
  if (!isLinked || !player) {
    return (
      <div className="min-h-screen bg-[#0E1523] text-white flex flex-col">
        <SiteHeader />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center space-y-4 max-w-sm">
            <p className="text-white/60 text-sm">
              These tools are only available to existing league members. Link
              your profile to get access.
            </p>
            <Link
              href="/dashboard"
              className="inline-block text-[#00C8DC] text-sm font-bold hover:underline"
            >
              Go to your dashboard →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Still checking payment status ──────────────────────────────────────────
  if (pendingSignup === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0E1523]">
        <div className="w-8 h-8 border-2 border-[#00C8DC] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Member with a pending event payment → settle first ─────────────────────
  if (pendingSignup) {
    const eventLabel =
      pendingSignup.event?.name ?? `Event ${pendingSignup.event_id}`;
    return (
      <div className="min-h-screen bg-[#0E1523] text-white flex flex-col">
        <SiteHeader />
        <div className="flex-1 flex items-center justify-center px-4 py-10">
          <div className="w-full max-w-md space-y-4">
            <header className="space-y-1">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-orange-300">
                Payment Required
              </p>
              <h1 className="text-xl font-black italic uppercase tracking-tighter">
                Player Tools Locked
              </h1>
              <p className="text-white/50 text-sm">
                Settle your pending event payment to access player tools.
              </p>
            </header>
            <PendingPaymentPanel
              signupId={pendingSignup.id}
              eventLabel={eventLabel}
              registrationFee={pendingSignup.event?.registration_fee}
              paymentInstructions={pendingSignup.event?.payment_instructions}
            />
            <Link
              href="/dashboard"
              className="inline-block text-[#687FA3] text-xs font-bold hover:text-[#00C8DC] transition-colors"
            >
              ← Back to dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children(player)}</>;
}
