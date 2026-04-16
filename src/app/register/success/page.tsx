"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Zap, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";

type ConfirmState = "loading" | "confirmed" | "timeout" | "error";

const MAX_POLLS  = 12;   // 12 × 2 500 ms = 30 s max wait
const POLL_MS    = 2500;

export default function RegisterSuccessPage() {
  const router = useRouter();
  const [state, setState]       = useState<ConfirmState>("loading");
  const [seasonName, setSeasonName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let polls = 0;

    async function poll() {
      // 1. Need an authenticated session for the confirm API
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/register"); return; }

      const check = async () => {
        if (cancelled) return;

        try {
          // Call the server-side confirm endpoint — it checks PayMongo directly
          // so this works on localhost where webhooks can't reach us.
          const res = await fetch("/api/payments/confirm", {
            method: "POST",
            headers: { Authorization: `Bearer ${session.access_token}` },
          });

          if (res.ok) {
            const json = await res.json() as { status: string; signup_id?: string };

            if (json.status === "registered") {
              // Fetch season name for the confirmed signup
              if (json.signup_id) {
                const { data: signup } = await supabase
                  .from("signups")
                  .select("season_id, season:seasons(season_id, name, start_date)")
                  .eq("id", json.signup_id)
                  .maybeSingle();

                const s = signup?.season as unknown as { season_id: number; name?: string | null; start_date?: string | null } | null;
                const label = s?.name
                  ? s.name
                  : s?.start_date
                  ? `Season ${s.season_id} · ${new Date(s.start_date).getFullYear()}`
                  : signup ? `Season ${signup.season_id}` : null;
                setSeasonName(label);
              }
              setState("confirmed");
              return;
            }
          }
        } catch {
          // Network error — keep polling
        }

        polls++;
        if (polls >= MAX_POLLS) {
          setState("timeout");
          return;
        }

        setTimeout(check, POLL_MS);
      };

      check();
    }

    poll();
    return () => { cancelled = true; };
  }, [router]);

  return (
    <div className="min-h-screen bg-[#0E1523] text-white flex flex-col">

      {/* Nav */}
      <nav className="border-b border-[#162032] px-6 py-4 flex items-center gap-2.5">
        <Link href="/" className="flex items-center gap-2">
          <div className="bg-[#00C8DC] p-1.5 rounded-md shadow-[0_0_12px_rgba(0,200,220,0.35)]">
            <div className="border border-[#0E1523] p-0.5 rounded-sm">
              <Zap className="text-[#0E1523] w-4 h-4" fill="currentColor" />
            </div>
          </div>
          <span className="text-[#00C8DC] font-bold tracking-wide text-sm">PADEL LEAGUE PH</span>
        </Link>
      </nav>

      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md text-center space-y-6">

          {/* ── Loading / polling ── */}
          {state === "loading" && (
            <>
              <div className="w-20 h-20 rounded-full bg-[#00C8DC]/10 border border-[#00C8DC]/20 flex items-center justify-center mx-auto">
                <Loader2 className="w-8 h-8 text-[#00C8DC] animate-spin" />
              </div>
              <div>
                <h1 className="text-2xl font-black uppercase tracking-tight mb-2">Confirming payment…</h1>
                <p className="text-[#687FA3] text-sm">
                  Waiting for payment confirmation. This usually takes a few seconds.
                </p>
              </div>
            </>
          )}

          {/* ── Confirmed ── */}
          {state === "confirmed" && (
            <>
              <div className="w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-9 h-9 text-emerald-400" />
              </div>
              <div>
                <h1 className="text-3xl font-black uppercase tracking-tight mb-2">You&apos;re in!</h1>
                <p className="text-[#687FA3] text-sm leading-relaxed">
                  Payment confirmed.{seasonName && (
                    <> Your registration for <span className="text-white font-semibold">{seasonName}</span> is locked in.</>
                  )}
                </p>
              </div>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 bg-[#00C8DC] hover:bg-white text-[#0E1523] font-black text-sm uppercase tracking-widest py-3 px-8 rounded-full transition-all"
              >
                Go to My Dashboard
              </Link>
            </>
          )}

          {/* ── Timeout (webhook slow / delayed) ── */}
          {state === "timeout" && (
            <>
              <div className="w-20 h-20 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-9 h-9 text-amber-400" />
              </div>
              <div>
                <h1 className="text-2xl font-black uppercase tracking-tight mb-2">Payment received!</h1>
                <p className="text-[#687FA3] text-sm leading-relaxed">
                  Your payment went through. Your registration will be confirmed shortly —
                  check your dashboard in a moment.
                </p>
              </div>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 bg-[#00C8DC] hover:bg-white text-[#0E1523] font-black text-sm uppercase tracking-widest py-3 px-8 rounded-full transition-all"
              >
                Go to My Dashboard
              </Link>
            </>
          )}

          {/* ── Error ── */}
          {state === "error" && (
            <>
              <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto">
                <AlertCircle className="w-9 h-9 text-red-400" />
              </div>
              <div>
                <h1 className="text-2xl font-black uppercase tracking-tight mb-2">Something went wrong</h1>
                <p className="text-[#687FA3] text-sm leading-relaxed">
                  We couldn&apos;t verify your registration. Please check your dashboard or
                  contact the league admin.
                </p>
              </div>
              <div className="flex gap-3 justify-center">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 bg-[#00C8DC] hover:bg-white text-[#0E1523] font-black text-sm uppercase tracking-widest py-3 px-8 rounded-full transition-all"
                >
                  My Dashboard
                </Link>
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 border border-[#687FA3]/30 hover:border-[#687FA3] text-[#687FA3] hover:text-white font-black text-sm uppercase tracking-widest py-3 px-6 rounded-full transition-all"
                >
                  Home
                </Link>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
