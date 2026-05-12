"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

type Mode = "sign_in" | "sign_up";
type View = "collapsed" | "form" | "check_email" | "forgot_password" | "reset_sent";

interface EmailAuthFormProps {
  redirectTo?: string;
  onSuccess?: () => void;
}

export default function EmailAuthForm({ redirectTo, onSuccess }: EmailAuthFormProps) {
  const [view, setView] = useState<View>("collapsed");
  const [mode, setMode] = useState<Mode>("sign_in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailRedirectTo = redirectTo
    ? `${typeof window !== "undefined" ? window.location.origin : ""}${redirectTo}`
    : `${typeof window !== "undefined" ? window.location.origin : ""}/join`;

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setError(null);
  };

  const handleToggle = () => {
    if (view === "collapsed") {
      setView("form");
      setMode("sign_in");
      resetForm();
    } else {
      setView("collapsed");
      resetForm();
    }
  };

  const handleModeSwitch = () => {
    setMode((m) => (m === "sign_in" ? "sign_up" : "sign_in"));
    setError(null);
    setPassword("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (mode === "sign_in") {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) {
        setError(err.message);
      } else {
        onSuccess?.();
      }
    } else {
      const { error: err } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo },
      });
      if (err) {
        setError(err.message);
      } else {
        setView("check_email");
      }
    }

    setLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/reset-password`,
    });

    if (err) {
      setError(err.message);
    } else {
      setView("reset_sent");
    }

    setLoading(false);
  };

  if (view === "collapsed") {
    return (
      <div className="mt-3 text-center">
        <button
          type="button"
          onClick={handleToggle}
          className="text-xs text-[#687FA3] hover:text-[#00C8DC] transition-colors"
        >
          or sign in with email
        </button>
      </div>
    );
  }

  if (view === "check_email") {
    return (
      <div className="mt-3 rounded-xl border border-[#687FA3]/20 bg-[#162032] px-4 py-4 text-center space-y-2">
        <p className="text-sm font-bold text-white">Check your email</p>
        <p className="text-xs text-[#687FA3]">
          We sent a verification link to <span className="text-white">{email}</span>. Click it to activate your account.
        </p>
        <button
          type="button"
          onClick={() => { setView("collapsed"); resetForm(); }}
          className="text-xs text-[#00C8DC] hover:underline"
        >
          Back
        </button>
      </div>
    );
  }

  if (view === "reset_sent") {
    return (
      <div className="mt-3 rounded-xl border border-[#687FA3]/20 bg-[#162032] px-4 py-4 text-center space-y-2">
        <p className="text-sm font-bold text-white">Check your email</p>
        <p className="text-xs text-[#687FA3]">
          We sent a password reset link to <span className="text-white">{email}</span>.
        </p>
        <button
          type="button"
          onClick={() => { setView("form"); setMode("sign_in"); setError(null); }}
          className="text-xs text-[#00C8DC] hover:underline"
        >
          Back to sign in
        </button>
      </div>
    );
  }

  if (view === "forgot_password") {
    return (
      <form
        onSubmit={handleForgotPassword}
        className="mt-3 rounded-xl border border-[#687FA3]/20 bg-[#162032] px-4 py-4 space-y-3"
      >
        <p className="text-xs font-bold text-white">Reset your password</p>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
          className="w-full bg-[#0E1523] border border-[#687FA3]/20 rounded-lg px-3 py-2 text-sm text-white placeholder:text-[#687FA3]/50 focus:outline-none focus:border-[#00C8DC]/50 transition-colors"
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#00C8DC] text-[#0E1523] py-2 rounded-lg text-sm font-bold hover:bg-white transition-colors disabled:opacity-50"
        >
          {loading ? "Sending…" : "Send reset link"}
        </button>
        <button
          type="button"
          onClick={() => { setView("form"); setError(null); }}
          className="w-full text-xs text-[#687FA3] hover:text-white transition-colors"
        >
          Back to sign in
        </button>
      </form>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 rounded-xl border border-[#687FA3]/20 bg-[#162032] px-4 py-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-white">
          {mode === "sign_in" ? "Sign in with email" : "Create an account"}
        </p>
        <button
          type="button"
          onClick={handleToggle}
          className="text-[#687FA3] hover:text-white transition-colors"
          aria-label="Collapse"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        required
        className="w-full bg-[#0E1523] border border-[#687FA3]/20 rounded-lg px-3 py-2 text-sm text-white placeholder:text-[#687FA3]/50 focus:outline-none focus:border-[#00C8DC]/50 transition-colors"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        required
        minLength={6}
        className="w-full bg-[#0E1523] border border-[#687FA3]/20 rounded-lg px-3 py-2 text-sm text-white placeholder:text-[#687FA3]/50 focus:outline-none focus:border-[#00C8DC]/50 transition-colors"
      />

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-[#00C8DC] text-[#0E1523] py-2 rounded-lg text-sm font-bold hover:bg-white transition-colors disabled:opacity-50"
      >
        {loading
          ? mode === "sign_in" ? "Signing in…" : "Creating account…"
          : mode === "sign_in" ? "Sign In" : "Create Account"}
      </button>

      <div className="flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={handleModeSwitch}
          className="text-[#687FA3] hover:text-[#00C8DC] transition-colors"
        >
          {mode === "sign_in" ? "Create an account" : "Sign in instead"}
        </button>
        {mode === "sign_in" && (
          <button
            type="button"
            onClick={() => { setView("forgot_password"); setError(null); }}
            className="text-[#687FA3] hover:text-[#00C8DC] transition-colors"
          >
            Forgot password?
          </button>
        )}
      </div>
    </form>
  );
}
