"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import SignInPrompt from "@/components/SignInPrompt";
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
      <SignInPrompt
        redirectTo={pathname}
        title="Player Tools"
        message="Sign in to access members-only tools."
      />
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
