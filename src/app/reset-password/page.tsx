"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Zap } from "lucide-react";
import { supabase } from "@/lib/supabase";

type PageState = "waiting" | "form" | "success" | "invalid";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [pageState, setPageState] = useState<PageState>("waiting");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setPageState("form");
      }
    });

    // If there's already a recovery session (page loaded after hash parsed)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setPageState("form");
      } else {
        // Give the hash-based auth a moment to initialise
        setTimeout(() => {
          setPageState((prev) => (prev === "waiting" ? "invalid" : prev));
        }, 2000);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    setError(null);

    const { error: err } = await supabase.auth.updateUser({ password });

    if (err) {
      setError(err.message);
      setLoading(false);
    } else {
      setPageState("success");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0E1523] text-white flex flex-col items-center justify-center px-4">
      <a href="/" className="flex items-center gap-3 mb-10">
        <div className="bg-[#00C8DC] p-1.5 rounded-md shadow-[0_0_15px_rgba(0,200,220,0.4)]">
          <div className="border border-[#0E1523] p-0.5 rounded-sm">
            <Zap className="text-[#0E1523] w-5 h-5" fill="currentColor" />
          </div>
        </div>
        <div className="flex flex-col leading-none">
          <span className="font-black text-xl tracking-tighter uppercase italic text-white">
            PADEL LEAGUE
          </span>
          <span className="font-bold text-[#687FA3] text-[9px] tracking-[0.4em] uppercase">
            PHILIPPINES
          </span>
        </div>
      </a>

      <div className="w-full max-w-sm">
        {pageState === "waiting" && (
          <div className="flex justify-center">
            <div className="w-8 h-8 border-2 border-[#00C8DC] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {pageState === "invalid" && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center space-y-4">
            <p className="text-white/70 text-sm">
              This reset link is invalid or has expired.
            </p>
            <a href="/" className="inline-block text-[#00C8DC] text-sm font-bold hover:underline">
              Back to home
            </a>
          </div>
        )}

        {pageState === "success" && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center space-y-4">
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-4 py-2 rounded-lg text-sm font-bold">
              ✓ Password updated
            </div>
            <p className="text-white/70 text-sm">
              Your password has been changed. You can now sign in.
            </p>
            <button
              type="button"
              onClick={() => router.push("/")}
              className="inline-block text-[#00C8DC] text-sm font-bold hover:underline"
            >
              Back to home
            </button>
          </div>
        )}

        {pageState === "form" && (
          <form
            onSubmit={handleSubmit}
            className="bg-white/5 border border-white/10 rounded-2xl p-8 space-y-6"
          >
            <div>
              <h1 className="text-xl font-black italic uppercase tracking-tighter mb-1">
                Set new password
              </h1>
              <p className="text-white/50 text-sm">Choose a new password for your account.</p>
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <div className="space-y-3">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="New password"
                required
                minLength={6}
                className="w-full bg-[#0E1523] border border-[#687FA3]/20 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-[#687FA3]/50 focus:outline-none focus:border-[#00C8DC]/50 transition-colors"
              />
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Confirm new password"
                required
                minLength={6}
                className="w-full bg-[#0E1523] border border-[#687FA3]/20 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-[#687FA3]/50 focus:outline-none focus:border-[#00C8DC]/50 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#00C8DC] text-[#0E1523] py-3 rounded-xl font-bold text-sm hover:bg-white transition-colors disabled:opacity-50"
            >
              {loading ? "Updating…" : "Update password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
