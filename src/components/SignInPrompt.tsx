"use client";

import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import EmailAuthForm from "@/components/EmailAuthForm";
import { supabase } from "@/lib/supabase";

type SignInPromptProps = {
  redirectTo: string;
  title?: string;
  message?: string;
  showJoinLink?: boolean;
};

// Inline sign-in UI for any page that gates content behind sign-in. Anchors
// both Google OAuth and EmailAuthForm to `redirectTo` so the visitor lands
// back on the page they were trying to reach, instead of a fixed default.
export default function SignInPrompt({
  redirectTo,
  title = "Sign In",
  message = "Sign in to access this page.",
  showJoinLink = true,
}: SignInPromptProps) {
  async function handleGoogleSignIn() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}${redirectTo}`,
        queryParams: { prompt: "select_account" },
      },
    });
  }

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
              {title}
            </h1>
            <p className="text-white/50 text-sm">{message}</p>
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
            <EmailAuthForm redirectTo={redirectTo} />
          </div>

          {showJoinLink && (
            <p className="text-center text-xs text-white/40">
              New to the league?{" "}
              <Link
                href="/join"
                className="text-[#00C8DC] font-bold hover:underline"
              >
                Apply to join →
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
