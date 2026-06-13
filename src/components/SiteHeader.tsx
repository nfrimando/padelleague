"use client";

import { usePathname } from "next/navigation";
import { Zap } from "lucide-react";
import { ReactNode, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import EmailAuthForm from "@/components/EmailAuthForm";
import { useUnvotedUpcomingCount } from "@/lib/useUnvotedUpcomingCount";
import AdminViewAsControl from "@/components/AdminViewAsControl";

type SiteHeaderProps = {
  activePath?: string;
  rightSlot?: ReactNode;
};

export default function SiteHeader({ activePath, rightSlot }: SiteHeaderProps) {
  const pathname = usePathname();
  const currentPath = activePath ?? pathname;
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSignInDropdown, setShowSignInDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;
  const unvotedCount = useUnvotedUpcomingCount(user?.email ?? null);

  const handleGoogleSignIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}${currentPath}`,
        queryParams: { prompt: "select_account" },
      },
    });
  };

  useEffect(() => {
    let mounted = true;

    const loadUser = async () => {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (mounted) {
        setUser(currentUser ?? null);
        setLoading(false);
      }
    };

    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowSignInDropdown(false);
      }
    };
    if (showSignInDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSignInDropdown]);

  const desktopLinkClass = (href: string) =>
    `hover:text-[#00C8DC] transition-colors ${
      currentPath === href
        ? "text-white border-b-2 border-[#00C8DC] pb-1"
        : "text-[#687FA3]"
    }`;
  const dashboardLinkClass =
    "inline-flex items-center gap-2 rounded-full border border-[#00C8DC]/30 bg-[#00C8DC]/10 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[#00C8DC] transition-all hover:border-[#00C8DC]/50 hover:bg-[#00C8DC]/20 hover:text-white";

  return (
    <nav className="sticky top-0 z-50 bg-[#0E1523]/95 backdrop-blur-xl border-b border-[#162032] py-3">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex justify-between items-center">
        <a href="/" className="flex items-center gap-3 flex-shrink-0">
          <div className="bg-[#00C8DC] p-1.5 rounded-md shadow-[0_0_15px_rgba(0,200,220,0.4)]">
            <div className="border border-[#0E1523] p-0.5 rounded-sm">
              <Zap className="text-[#0E1523] w-5 h-5" fill="currentColor" />
            </div>
          </div>
          <div className="hidden sm:flex flex-col leading-none">
            <span className="font-black text-xl tracking-tighter uppercase italic text-white">
              PADEL LEAGUE
            </span>
            <span className="font-bold text-[#687FA3] text-[9px] tracking-[0.4em] uppercase">
              PHILIPPINES
            </span>
          </div>
        </a>

        <div className="hidden md:flex min-w-0 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          <div className="flex items-center gap-8 font-bold text-[11px] uppercase tracking-[0.2em] whitespace-nowrap">
            <a href="/events" className={desktopLinkClass("/events")}>
              Events
            </a>
            <a href="/matches" className={desktopLinkClass("/matches")}>
              Matches
            </a>
            <a href="/players" className={desktopLinkClass("/players")}>
              Players
            </a>
            <a href="/leaderboard" className={desktopLinkClass("/leaderboard")}>
              Leaderboard
            </a>
            <a
              href="/predict"
              className={`hover:text-[#00C8DC] transition-colors inline-flex items-center gap-1 ${
                currentPath === "/predict"
                  ? "text-white border-b-2 border-[#00C8DC] pb-1"
                  : "text-amber-400/80"
              }`}
            >
              Predict
              {unvotedCount > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
              )}
              <span className="text-[8px] font-black tracking-widest text-amber-400/60">β</span>
            </a>
          </div>
        </div>

        <div className="flex items-center gap-4 min-w-0">
          <div className="hidden md:flex items-center gap-4">
            {loading ? (
              <div className="h-8 w-28 rounded-full bg-[#22304a] animate-pulse" />
            ) : user ? (
              <a href="/dashboard" className={dashboardLinkClass}>
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="Profile"
                    referrerPolicy="no-referrer"
                    className="h-5 w-5 rounded-full border border-white/20 object-cover"
                  />
                ) : (
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/20 bg-[#0E1523]/40 text-[9px] font-black text-white">
                    {user.email?.charAt(0).toUpperCase() ?? "M"}
                  </span>
                )}
                My Dashboard
              </a>
            ) : (
              !rightSlot && (
                <div className="relative" ref={dropdownRef}>
                  <button
                    type="button"
                    onClick={() => setShowSignInDropdown((v) => !v)}
                    className="bg-[#00C8DC] text-[#0E1523] px-4 py-2 rounded-full hover:bg-white transition-all text-sm font-bold"
                  >
                    Sign In
                  </button>
                  {showSignInDropdown && (
                    <div className="absolute right-0 top-full mt-2 w-72 bg-[#0E1523] border border-[#162032] rounded-2xl shadow-2xl p-4 z-50">
                      <button
                        type="button"
                        onClick={handleGoogleSignIn}
                        className="w-full flex items-center justify-center gap-3 bg-white text-[#0E1523] font-semibold py-2.5 px-4 rounded-xl hover:bg-white/90 transition-colors text-sm"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24">
                          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                        </svg>
                        Continue with Google
                      </button>
                      <EmailAuthForm redirectTo={currentPath} onSuccess={() => setShowSignInDropdown(false)} />
                    </div>
                  )}
                </div>
              )
            )}
            <AdminViewAsControl />
            {rightSlot}
          </div>

          <div className="flex md:hidden items-center min-w-0 gap-3">
            <div className="flex-1 overflow-x-auto min-w-0" style={{ scrollbarWidth: "none" }}>
              <div className="flex gap-5 font-bold text-[11px] uppercase tracking-[0.12em] w-max">
                {(
                  [
                    ["/matches", "Matches"],
                    ["/players", "Players"],
                    ["/leaderboard", "Standings"],
                  ] as const
                ).map(([href, label]) => (
                  <a
                    key={href}
                    href={href}
                    className={
                      currentPath === href
                        ? "text-[#00C8DC]"
                        : "text-white/75 hover:text-[#00C8DC] transition-colors"
                    }
                  >
                    {label}
                  </a>
                ))}
                <a
                  href="/predict"
                  className={`inline-flex items-center gap-0.5 ${currentPath === "/predict" ? "text-[#00C8DC]" : "text-amber-400/80 hover:text-[#00C8DC] transition-colors"}`}
                >
                  Predict
                  {unvotedCount > 0 && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  )}
                  <span className="text-[7px] font-black text-amber-400/60">β</span>
                </a>
              </div>
            </div>
            <div className="flex-shrink-0 font-bold text-[11px] uppercase tracking-[0.12em] flex items-center gap-2">
              <AdminViewAsControl />
              {rightSlot ?? (loading ? (
                <div className="h-6 w-10 rounded-full bg-[#22304a] animate-pulse" />
              ) : user ? (
                <a
                  href="/dashboard"
                  className="inline-flex items-center gap-1.5 text-[#00C8DC] hover:text-white transition-colors"
                >
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="Profile"
                      referrerPolicy="no-referrer"
                      className="h-4 w-4 rounded-full border border-white/20 object-cover"
                    />
                  ) : null}
                  Me
                </a>
              ) : (
                <a
                  href="/join"
                  className="text-[#00C8DC] hover:text-white transition-colors"
                >
                  Sign In
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
