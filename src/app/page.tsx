// app/page.tsx
"use client";

const WEBSITE_VERSION = "0.8.30";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, ChevronRight, Sword, Flame, Shield } from "lucide-react";
import MatchCard from "@/components/MatchCard";
import SiteHeader from "@/components/SiteHeader";
import { supabase } from "@/lib/supabase";
import { MatchWithTeams, MatchSet, Player } from "@/lib/types";
import type { User } from "@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────────────────

type LeagueStats = {
  players: number;
  completedMatches: number;
  latestEvent: { event_id: number; name: string } | null;
  setsPlayed: number;
};

type MatchTeamRow = {
  uuid: string;
  match_id: number;
  team_number: number | null;
  sets_won: number | null;
  player_1: Player | null;
  player_2: Player | null;
};

// ─── Sponsor placeholder data ─────────────────────────────────────────────────

const SPONSORS = [
  { name: "SPONSOR A", tagline: "Official Venue Partner" },
  { name: "SPONSOR B", tagline: "Official Racket Partner" },
  { name: "SPONSOR C", tagline: "Official Ball Partner" },
  { name: "SPONSOR D", tagline: "Community Partner" },
];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [scrolled, setScrolled] = useState(false);
  const [stats, setStats] = useState<LeagueStats | null>(null);
  const [recentMatches, setRecentMatches] = useState<MatchWithTeams[]>([]);
  const [loading, setLoading] = useState(true);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);

  // Sticky nav shadow
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Auth state
  useEffect(() => {
    let active = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!active) {
        return;
      }
      setAuthUser(data.user);
      setAuthResolved(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setAuthUser(session?.user ?? null);
      setAuthResolved(true);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const isAuthenticated = hasMounted && authResolved && authUser !== null;

  // Fetch all homepage data
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setStats(null);
      setRecentMatches([]);

      // ── 1. League stats ──────────────────────────────────────────────────
      const [
        { count: playerCount },
        { data: matchCountData },
        { data: latestEventData },
        { count: setsCount },
      ] = await Promise.all([
        supabase.from("players").select("*", { count: "exact", head: true }),
        supabase
          .from("matches")
          .select("match_id", { count: "exact" })
          .eq("status", "completed"),
        supabase
          .from("events")
          .select("event_id,name,start_date")
          .order("start_date", { ascending: false })
          .limit(1),
        supabase.from("match_sets").select("*", { count: "exact", head: true }),
      ]);

      const latestEvent: { event_id: number; name: string } | null =
        latestEventData?.[0]
          ? {
              event_id: latestEventData[0].event_id,
              name: latestEventData[0].name,
            }
          : null;

      if (!cancelled) {
        setStats({
          players: playerCount ?? 0,
          completedMatches: matchCountData?.length ?? 0,
          latestEvent,
          setsPlayed: setsCount ?? 0,
        });
      }

      // ── 2. Recent completed matches ──────────────────────────────────────
      const { data: matchRows } = await supabase
        .from("matches")
        .select("*")
        .eq("status", "completed")
        .order("date_local", { ascending: false, nullsFirst: false })
        .order("match_id", { ascending: false })
        .limit(5);

      if (matchRows && matchRows.length > 0 && !cancelled) {
        const matchIds = matchRows.map((m) => m.match_id);

        const [{ data: teamsData }, { data: setsData }] = await Promise.all([
          supabase
            .from("match_teams")
            .select(
              "*, player_1:player_1_id(player_id,name,nickname,image_link), player_2:player_2_id(player_id,name,nickname,image_link)",
            )
            .in("match_id", matchIds),
          supabase
            .from("match_sets")
            .select("*")
            .in("match_id", matchIds)
            .order("set_number", { ascending: true }),
        ]);

        const typedTeams = (teamsData ?? []) as MatchTeamRow[];
        const typedSets = (setsData ?? []) as MatchSet[];

        const assembled: MatchWithTeams[] = matchRows.map((m) => ({
          ...m,
          teams: typedTeams
            .filter((t) => t.match_id === m.match_id)
            .map((t) => ({
              uuid: t.uuid,
              team_number: t.team_number,
              sets_won: t.sets_won,
              player_1: t.player_1,
              player_2: t.player_2,
            })),
          sets: typedSets.filter((s) => s.match_id === m.match_id),
        }));

        if (!cancelled) setRecentMatches(assembled);
      }

      if (!cancelled) setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Stat cards config ─────────────────────────────────────────────────────
  const statCards = [
    {
      label: "PLAYERS",
      value: stats?.players != null ? String(stats.players) : "–",
      icon: Users,
    },
    {
      label: "MATCHES",
      value:
        stats?.completedMatches != null ? String(stats.completedMatches) : "–",
      icon: Sword,
    },
    {
      label: "EVENT",
      value: stats?.latestEvent != null ? stats.latestEvent.name : "–",
      icon: Flame,
    },
    {
      label: "SETS PLAYED",
      value: stats?.setsPlayed != null ? String(stats.setsPlayed) : "–",
      icon: Shield,
    },
  ];

  return (
    <div className="min-h-screen bg-[#0E1523] text-white font-sans selection:bg-[#00C8DC] selection:text-[#0E1523]">
      <div
        className={`fixed w-full z-50 transition-all duration-500 ${
          scrolled ? "opacity-100" : "opacity-100"
        }`}
      >
        <SiteHeader activePath="/" />
      </div>

      {/* ── Hero + Stats (single flex-col section) ───────────────────────── */}
      {/* Stats live inside the hero as the last row so they can never
          overlap the hero content regardless of viewport height.          */}
      <section className="relative flex flex-col overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-t from-[#0E1523] via-[#0E1523]/60 to-transparent z-10" />
          <div className="absolute inset-0 bg-[#0E1523]/40 z-10" />
        </div>

        {/* Hero content — fills available height, centers text vertically */}
        <div className="relative z-20 flex items-center min-h-[75vh] w-full">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 w-full pt-28">
            <div className="max-w-3xl space-y-4 md:space-y-6">
              <div className="inline-block bg-[#00C8DC]/10 text-[#00C8DC] px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase">
                {stats?.latestEvent
                  ? `${stats.latestEvent.name} · Now Live`
                  : "Philippines' Premier Circuit"}
              </div>
              <h1 className="text-5xl sm:text-7xl md:text-[9rem] font-black italic leading-[0.85] tracking-tighter uppercase">
                Padel League <span className="text-[#00C8DC]">PH.</span>
              </h1>
              <p className="text-base md:text-xl text-[#687FA3] font-medium leading-relaxed max-w-xl">
                Track every match, climb the rankings, and follow the best padel
                players in the Philippines.
              </p>
              <div className="flex flex-wrap gap-3 md:gap-4 pt-2 md:pt-4 pb-12 md:pb-16">
                {!hasMounted ? (
                  <span
                    aria-hidden="true"
                    className="inline-flex h-[46px] w-[208px] rounded-full bg-[#162032] border border-[#00C8DC]/25 animate-pulse"
                  />
                ) : isAuthenticated ? (
                  <Link
                    href="/dashboard"
                    className="bg-[#00C8DC] text-[#0E1523] px-8 md:px-10 py-3 md:py-4 rounded-full font-black text-[11px] tracking-widest hover:bg-white transition-all flex items-center gap-2 group"
                  >
                    MY DASHBOARD
                    <ChevronRight className="group-hover:translate-x-1 transition-transform" />
                  </Link>
                ) : (
                  <Link
                    href="/join"
                    className="bg-[#00C8DC] text-[#0E1523] px-8 md:px-10 py-3 md:py-4 rounded-full font-black text-[11px] tracking-widest hover:bg-white transition-all flex items-center gap-2 group"
                  >
                    JOIN THE LEAGUE
                    <ChevronRight className="group-hover:translate-x-1 transition-transform" />
                  </Link>
                )}
                <Link
                  href="/matches"
                  className="bg-[#162032] border border-[#00C8DC]/40 text-[#00C8DC] px-8 md:px-10 py-3 md:py-4 rounded-full font-black text-[11px] tracking-widest hover:border-[#00C8DC] transition-all"
                >
                  VIEW MATCHES
                </Link>
                <Link
                  href="/events"
                  className="bg-[#162032] border border-[#00C8DC]/40 text-[#00C8DC] px-8 md:px-10 py-3 md:py-4 rounded-full font-black text-[11px] tracking-widest hover:border-[#00C8DC] transition-all"
                >
                  EVENTS
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Stats — pinned below hero content, inside the same section */}
        <div className="relative z-20 px-4 sm:px-6 pb-10 md:pb-12">
          <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            {statCards.map((stat, i) => (
              <div
                key={i}
                className="bg-[#162032] border border-[#687FA3]/10 p-5 sm:p-6 md:p-8 rounded-2xl shadow-2xl group hover:border-[#00C8DC]/50 transition-all duration-500"
              >
                <div className="text-3xl md:text-4xl font-black mb-1 tracking-tighter group-hover:text-[#00C8DC] transition-colors">
                  {loading || stats === null ? (
                    <span className="inline-flex h-9 md:h-10 w-16 md:w-24 animate-pulse rounded-md bg-[#687FA3]/30" />
                  ) : (
                    stat.value
                  )}
                </div>
                <div className="text-[#687FA3] font-black text-[9px] md:text-[10px] uppercase tracking-[0.2em]">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Recent Matches ────────────────────────────────────────────────── */}
      <section className="pt-16 pb-20 md:pt-20 md:pb-24 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-end mb-10 gap-4">
            <div>
              <div className="inline-block bg-[#00C8DC]/10 text-[#00C8DC] px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase mb-4">
                Latest Action
              </div>
              <h2 className="text-4xl md:text-5xl font-black italic uppercase tracking-tighter">
                Recent <span className="text-[#00C8DC]">Matches</span>
              </h2>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="bg-[#162032]/50 border border-[#687FA3]/10 rounded-2xl h-24 animate-pulse"
                />
              ))}
            </div>
          ) : recentMatches.length === 0 ? (
            <p className="text-[#687FA3] text-sm font-medium">
              No completed matches yet.
            </p>
          ) : (
            <div className="space-y-3">
              {recentMatches.map((match) => (
                <MatchCard key={match.match_id} match={match} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Sponsors ─────────────────────────────────────────────────────── */}
      <section className="py-16 md:py-24 px-4 sm:px-6 border-t border-[#162032]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <div className="inline-block bg-[#00C8DC]/10 text-[#00C8DC] px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase mb-4">
              Our Partners
            </div>
            <h2 className="text-4xl font-black italic uppercase tracking-tighter">
              Powered by <span className="text-[#00C8DC]">Champions</span>
            </h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {SPONSORS.map((sponsor) => (
              <div
                key={sponsor.name}
                className="bg-[#162032] border border-[#687FA3]/10 hover:border-[#00C8DC]/40 rounded-2xl p-8 flex flex-col items-center justify-center gap-2 transition-all duration-300 group cursor-pointer"
              >
                <span className="font-black text-xl tracking-tighter group-hover:text-[#00C8DC] transition-colors">
                  {sponsor.name}
                </span>
                <span className="text-[#687FA3] text-[9px] font-bold uppercase tracking-widest text-center">
                  {sponsor.tagline}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="py-16 border-t border-[#162032]">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-3 opacity-50">
            <span className="font-black text-lg tracking-tighter uppercase italic">
              PADEL LEAGUE PH
            </span>
          </div>

          <div className="flex gap-8 text-[10px] font-black uppercase tracking-[0.2em] text-[#687FA3]">
            <Link
              href="/players"
              className="hover:text-white transition-colors"
            >
              Players
            </Link>
            <Link href="/events" className="hover:text-white transition-colors">
              Events
            </Link>
            <Link
              href="/matches"
              className="hover:text-white transition-colors"
            >
              Matches
            </Link>
          </div>
        </div>
      </footer>

      <div className="fixed bottom-3 right-3 text-[11px] text-gray-500 dark:text-gray-400">
        {WEBSITE_VERSION}
      </div>
    </div>
  );
}
