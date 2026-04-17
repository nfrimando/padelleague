"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Zap } from "lucide-react";
import { ReactNode, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type SiteHeaderProps = {
  activePath?: string;
  rightSlot?: ReactNode;
};

const NAV_LINKS = [
  { href: "/matches", label: "Calendar" },
  { href: "/players", label: "Players" },
  { href: "/leaderboard", label: "Leaderboard" },
] as const;

export default function SiteHeader({ activePath, rightSlot }: SiteHeaderProps) {
  const pathname = usePathname();
  const currentPath = activePath ?? pathname;
  const [user, setUser] = useState<User | null>(null);
  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;

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
      }
    };

    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

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
        <Link href="/" className="flex items-center gap-3">
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
        </Link>

        <div className="hidden md:flex items-center gap-10 font-bold text-[11px] uppercase tracking-[0.2em]">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={desktopLinkClass(link.href)}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-4">
            {user && (
              <Link href="/dashboard" className={dashboardLinkClass}>
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="Profile"
                    className="h-5 w-5 rounded-full border border-white/20 object-cover"
                  />
                ) : (
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/20 bg-[#0E1523]/40 text-[9px] font-black text-white">
                    {user.email?.charAt(0).toUpperCase() ?? "M"}
                  </span>
                )}
                My Dashboard
              </Link>
            )}
            {rightSlot}
          </div>

          {rightSlot ? (
            <div className="flex md:hidden items-center gap-4 font-bold text-[10px] uppercase tracking-[0.15em] text-[#687FA3]">
              {user && (
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-1.5 text-[#00C8DC] hover:text-white transition-colors"
                >
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="Profile"
                      className="h-4 w-4 rounded-full border border-white/20 object-cover"
                    />
                  ) : null}
                  Me
                </Link>
              )}
              {!user && (
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  className="text-[#00C8DC] hover:text-white transition-colors"
                >
                  Sign In
                </button>
              )}
              {rightSlot}
            </div>
          ) : (
            <div className="flex md:hidden gap-6 font-bold text-[10px] uppercase tracking-[0.15em] text-[#687FA3]">
              <Link
                href="/matches"
                className="hover:text-[#00C8DC] transition-colors"
              >
                Calendar
              </Link>
              <Link
                href="/players"
                className="hover:text-[#00C8DC] transition-colors"
              >
                Players
              </Link>
              <Link
                href="/leaderboard"
                className="hover:text-[#00C8DC] transition-colors"
              >
                Board
              </Link>
              {user && (
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-1.5 text-[#00C8DC] hover:text-white transition-colors"
                >
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="Profile"
                      className="h-4 w-4 rounded-full border border-white/20 object-cover"
                    />
                  ) : null}
                  Me
                </Link>
              )}
              {!user && (
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  className="text-[#00C8DC] hover:text-white transition-colors"
                >
                  Sign In
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
