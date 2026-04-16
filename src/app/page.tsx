"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  ChevronRight,
  Sword,
  Zap,
  Flame,
  Crown,
  Share2,
  Shield,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { MatchWithTeams, MatchSet, Player } from "@/lib/types";
import { formatMatchDate } from "@/lib/utils";
import type { User } from "@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────────────────

type LeagueStats = {
  players: number;
  completedMatches: number;
  latestSeason: number | null;
  setsPlayed: number;
};

type TopPlayer = {
  player_id: string;
  name: string;
  wins: number;
  matches_played: number;
  latest_rating: number | null;
};

type MatchTeamRow = {
  uuid: string;
  match_id: number;
  team_number: number | null;
  sets_won: number | null;
  player_1: Player | null;
  player_2: Player | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMatchScore(match: MatchWithTeams): string {
  const t1 = match.teams.find((t) => t.team_number === 1);
  const t2 = match.teams.find((t) => t.team_number === 2);
  if (!t1 || !t2) return "–";
  return `${t1.sets_won ?? 0} – ${t2.sets_won ?? 0}`;
}

function getTeamLabel(match: MatchWithTeams, teamNumber: 1 | 2): string {
  const team = match.teams.find((t) => t.team_number === teamNumber);
  if (!team) return "TBD";
  const parts = [team.player_1?.name, team.player_2?.name].filter(Boolean);
  return parts.join(" & ") || "TBD";
}

function getSetScores(match: MatchWithTeams): string {
  if (!match.sets || match.sets.length === 0) return "";
  return match.sets.map((s) => `${s.team_1_games}‑${s.team_2_games}`).join("  ");
}

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
  const [topPlayers, setTopPlayers] = useState<TopPlayer[]>([]);
  const [lastSeason, setLastSeason] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [authUser, setAuthUser] = useState<User | null>(null);

  // Sticky nav shadow
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Auth state
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAuthUser(data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setAuthUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Fetch all homepage data
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      // ── 1. League stats ──────────────────────────────────────────────────
      const [
        { count: playerCount },
        { data: matchCountData },
        { data: latestSeasonData },
        { count: setsCount },
      ] = await Promise.all([
        supabase.from("players").select("*", { count: "exact", head: true }),
        supabase
          .from("matches")
          .select("match_id", { count: "exact" })
          .eq("status", "completed"),
        supabase
          .from("matches")
          .select("season_id")
          .not("season_id", "is", null)
          .order("season_id", { ascending: false })
          .limit(1),
        supabase.from("match_sets").select("*", { count: "exact", head: true }),
      ]);

      const latestSeason: number | null =
        latestSeasonData?.[0]?.season_id ?? null;

      if (!cancelled) {
        setStats({
          players: playerCount ?? 0,
          completedMatches: matchCountData?.length ?? 0,
          latestSeason,
          setsPlayed: setsCount ?? 0,
        });
        setLastSeason(latestSeason);
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

      // ── 3. Top players of last season (by rating) ────────────────────────
      if (latestSeason !== null) {
        const { data: lbData } = await supabase.rpc("get_leaderboard_ratings", {
          season_filter: latestSeason,
          type_filter: null,
          formula_filter: null,
          min_matches: 3,
        });

        if (lbData && !cancelled) {
          const top5: TopPlayer[] = (lbData as any[])
            .slice(0, 5)
            .map((row) => ({
              player_id: String(row.player_id),
              name: row.name ?? "Unknown",
              wins: Number(row.wins ?? 0),
              matches_played: Number(row.matches_played ?? 0),
              latest_rating:
                row.latest_rating !== null && row.latest_rating !== undefined
                  ? Number(row.latest_rating)
                  : null,
            }));
          setTopPlayers(top5);
        }
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
      value: stats?.completedMatches != null ? String(stats.completedMatches) : "–",
      icon: Sword,
    },
    {
      label: "SEASON",
      value: stats?.latestSeason != null ? `S${stats.latestSeason}` : "–",
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

      {/* ── Navigation ───────────────────────────────────────────────────── */}
      <nav
        className={`fixed w-full z-50 transition-all duration-500 ${
          scrolled
            ? "bg-[#0E1523]/95 backdrop-blur-xl border-b border-[#162032] py-3"
            : "bg-transparent py-6"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex justify-between items-center">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="bg-[#00C8DC] p-1.5 rounded-md shadow-[0_0_15px_rgba(0,200,220,0.4)]">
              <div className="border border-[#0E1523] p-0.5 rounded-sm">
                <Zap className="text-[#0E1523] w-5 h-5" fill="currentColor" />
              </div>
            </div>
            <div className="flex flex-col leading-none">
              <span className="font-black text-xl tracking-tighter uppercase italic">
                PADEL LEAGUE
              </span>
              <span className="font-bold text-[#687FA3] text-[9px] tracking-[0.4em] uppercase">
                PHILIPPINES
              </span>
            </div>
          </div>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-10 font-bold text-[11px] uppercase tracking-[0.2em] text-[#687FA3]">
            <span className="text-white border-b-2 border-[#00C8DC] pb-1 cursor-default">
              Home
            </span>
            <Link href="/players" className="hover:text-[#00C8DC] transition-colors">
              Players
            </Link>
            <Link href="/leaderboard" className="hover:text-[#00C8DC] transition-colors">
              Leaderboard
            </Link>
            <Link href="/admin" className="hover:text-[#00C8DC] transition-colors">
              Admin
            </Link>
            {authUser ? (
              <Link
                href="/dashboard"
                className="flex items-center gap-2 bg-[#00C8DC]/10 border border-[#00C8DC]/30 text-[#00C8DC] px-4 py-2 rounded-full hover:bg-[#00C8DC]/20 transition-all"
              >
                {authUser.user_metadata?.avatar_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={authUser.user_metadata.avatar_url}
                    alt="avatar"
                    className="w-5 h-5 rounded-full"
                  />
                )}
                My Dashboard
              </Link>
            ) : (
              <Link
                href="/register"
                className="bg-[#00C8DC] text-[#0E1523] px-4 py-2 rounded-full hover:bg-white transition-all"
              >
                Sign In
              </Link>
            )}
          </div>

          {/* Mobile links */}
          <div className="flex md:hidden items-center gap-5 font-bold text-[10px] uppercase tracking-[0.15em] text-[#687FA3]">
            <Link href="/players" className="hover:text-[#00C8DC] transition-colors">
              Players
            </Link>
            <Link href="/leaderboard" className="hover:text-[#00C8DC] transition-colors">
              Board
            </Link>
            {authUser ? (
              <Link href="/dashboard" className="text-[#00C8DC] hover:text-white transition-colors">
                Me
              </Link>
            ) : (
              <Link href="/register" className="text-[#00C8DC] hover:text-white transition-colors">
                Join
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* ── Hero + Stats (single flex-col section) ───────────────────────── */}
      {/* Stats live inside the hero as the last row so they can never
          overlap the hero content regardless of viewport height.          */}
      <section className="relative flex flex-col overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-t from-[#0E1523] via-[#0E1523]/60 to-transparent z-10" />
          <div className="absolute inset-0 bg-[#0E1523]/40 z-10" />
          <img
            src="https://images.unsplash.com/photo-1599423300746-b625028aa721?q=80&w=2070&auto=format&fit=crop"
            className="w-full h-full object-cover opacity-30 grayscale-[0.5]"
            alt="Padel Court"
          />
        </div>

        {/* Hero content — fills available height, centers text vertically */}
        <div className="relative z-20 flex items-center min-h-[75vh] w-full">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 w-full pt-24">
            <div className="max-w-3xl space-y-4 md:space-y-6">
              <div className="inline-block bg-[#00C8DC]/10 text-[#00C8DC] px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase">
                {stats?.latestSeason ? `Season ${stats.latestSeason} · Now Live` : "Philippines' Premier Circuit"}
              </div>
              <h1 className="text-5xl sm:text-7xl md:text-[9rem] font-black italic leading-[0.85] tracking-tighter uppercase">
                Padel League{" "}
                <span className="text-[#00C8DC]">PH.</span>
              </h1>
              <p className="text-base md:text-xl text-[#687FA3] font-medium leading-relaxed max-w-xl">
                Track every match, climb the rankings, and follow the best padel players in the Philippines.
              </p>
              <div className="flex flex-wrap gap-3 md:gap-4 pt-2 md:pt-4 pb-12 md:pb-16">
                <Link
                  href="/leaderboard"
                  className="bg-[#00C8DC] text-[#0E1523] px-8 md:px-10 py-3 md:py-4 rounded-full font-black text-[11px] tracking-widest hover:bg-white transition-all flex items-center gap-2 group"
                >
                  VIEW RANKINGS
                  <ChevronRight className="group-hover:translate-x-1 transition-transform" />
                </Link>
                {authUser ? (
                  <Link
                    href="/dashboard"
                    className="bg-[#162032] border border-[#00C8DC]/40 text-[#00C8DC] px-8 md:px-10 py-3 md:py-4 rounded-full font-black text-[11px] tracking-widest hover:border-[#00C8DC] transition-all"
                  >
                    MY DASHBOARD
                  </Link>
                ) : (
                  <Link
                    href="/register"
                    className="bg-[#162032] border border-[#687FA3]/20 text-white px-8 md:px-10 py-3 md:py-4 rounded-full font-black text-[11px] tracking-widest hover:border-[#00C8DC] transition-all"
                  >
                    JOIN THE LEAGUE
                  </Link>
                )}
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
                  {loading ? (
                    <span className="text-[#687FA3] text-xl animate-pulse">...</span>
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
            <p className="text-[#687FA3] text-sm font-medium">No completed matches yet.</p>
          ) : (
            <div className="space-y-3">
              {recentMatches.map((match) => {
                const isWinnerTeam1 = match.winner_team === 1;
                const setScores = getSetScores(match);

                return (
                  <div
                    key={match.match_id}
                    className="bg-[#162032]/50 border border-[#687FA3]/10 hover:border-[#00C8DC]/30 rounded-2xl p-5 md:p-6 transition-all duration-300"
                  >
                    {/* Meta row */}
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                      <span className="text-[#687FA3] text-[10px] font-black uppercase tracking-widest">
                        {formatMatchDate(match.date_local)}
                      </span>
                      {match.season_id && (
                        <span className="bg-[#00C8DC]/10 text-[#00C8DC] text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full">
                          S{match.season_id}
                        </span>
                      )}
                      {match.type && (
                        <span className="bg-[#687FA3]/10 text-[#687FA3] text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full">
                          {match.type}
                        </span>
                      )}
                      {match.venue && (
                        <span className="text-[#687FA3]/50 text-[10px] font-bold ml-auto hidden md:block">
                          {match.venue}
                        </span>
                      )}
                    </div>

                    {/* Teams vs score */}
                    <div className="flex items-center gap-3 md:gap-6">
                      <div className={`flex-1 text-right ${isWinnerTeam1 ? "text-white" : "text-[#687FA3]"}`}>
                        <div className="font-black text-sm md:text-base leading-tight">
                          {getTeamLabel(match, 1)}
                        </div>
                        {isWinnerTeam1 && (
                          <div className="text-[#00C8DC] text-[9px] font-black uppercase tracking-widest mt-0.5">
                            Winner
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col items-center shrink-0">
                        <div className="bg-[#0E1523] border border-[#687FA3]/20 rounded-xl px-4 py-2 font-black text-lg md:text-xl tracking-tighter text-[#00C8DC]">
                          {getMatchScore(match)}
                        </div>
                        {setScores && (
                          <div className="text-[#687FA3]/60 text-[9px] font-bold mt-1 tracking-wide">
                            {setScores}
                          </div>
                        )}
                      </div>

                      <div className={`flex-1 ${!isWinnerTeam1 ? "text-white" : "text-[#687FA3]"}`}>
                        <div className="font-black text-sm md:text-base leading-tight">
                          {getTeamLabel(match, 2)}
                        </div>
                        {!isWinnerTeam1 && match.winner_team !== null && (
                          <div className="text-[#00C8DC] text-[9px] font-black uppercase tracking-widest mt-0.5">
                            Winner
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ── Top Players of Last Season ────────────────────────────────────── */}
      <section className="py-16 md:py-24 px-4 sm:px-6 bg-[#0a1020]">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-end mb-10 gap-4">
            <div>
              <div className="inline-block bg-[#00C8DC]/10 text-[#00C8DC] px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase mb-4">
                Elite Circuit
              </div>
              <h2 className="text-4xl md:text-5xl font-black italic uppercase tracking-tighter">
                {lastSeason ? `Season ${lastSeason}` : "Season"}{" "}
                <span className="text-[#00C8DC]">Top Players</span>
              </h2>
            </div>
            <Link
              href="/leaderboard"
              className="text-[11px] font-black tracking-[0.3em] text-[#687FA3] hover:text-white transition-colors uppercase whitespace-nowrap"
            >
              Full Leaderboard →
            </Link>
          </div>

          <div className="bg-[#162032]/50 border border-[#687FA3]/10 rounded-3xl overflow-hidden backdrop-blur-sm">
            {loading ? (
              <div className="p-12 flex items-center justify-center">
                <span className="text-[#687FA3] text-sm font-bold uppercase tracking-widest animate-pulse">
                  Loading rankings...
                </span>
              </div>
            ) : topPlayers.length === 0 ? (
              <div className="p-12 text-center text-[#687FA3] text-sm font-medium">
                No ranking data available.
              </div>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[#687FA3]/10 text-[#687FA3] text-[10px] font-black tracking-[0.2em] uppercase">
                    <th className="px-6 md:px-8 py-5">#</th>
                    <th className="px-6 md:px-8 py-5">Player</th>
                    <th className="px-6 md:px-8 py-5 text-center hidden sm:table-cell">W</th>
                    <th className="px-6 md:px-8 py-5 text-center hidden sm:table-cell">Played</th>
                    <th className="px-6 md:px-8 py-5 text-right">Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {topPlayers.map((player, index) => (
                    <tr
                      key={player.player_id}
                      className="border-b border-[#687FA3]/5 hover:bg-[#00C8DC]/5 transition-colors"
                    >
                      <td className="px-6 md:px-8 py-5 font-black text-[#00C8DC] italic text-lg">
                        {index === 0 ? (
                          <Crown className="w-5 h-5 text-amber-400 inline" />
                        ) : (
                          index + 1
                        )}
                      </td>
                      <td className="px-6 md:px-8 py-5">
                        <Link
                          href={`/players?playerId=${encodeURIComponent(player.player_id)}`}
                          className="font-bold hover:text-[#00C8DC] transition-colors"
                        >
                          {player.name}
                        </Link>
                      </td>
                      <td className="px-6 md:px-8 py-5 text-center text-[#687FA3] font-mono hidden sm:table-cell">
                        {player.wins}
                      </td>
                      <td className="px-6 md:px-8 py-5 text-center text-[#687FA3] font-mono hidden sm:table-cell">
                        {player.matches_played}
                      </td>
                      <td className="px-6 md:px-8 py-5 text-right font-mono font-black text-[#00C8DC] tracking-tighter">
                        {player.latest_rating !== null ? (
                          <span className="bg-[#00C8DC]/10 px-3 py-1 rounded-md">
                            {player.latest_rating.toFixed(0)}
                          </span>
                        ) : (
                          <span className="text-[#687FA3]">–</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
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
            <div className="bg-[#00C8DC] p-1.5 rounded-md">
              <Zap className="text-[#0E1523] w-4 h-4" fill="currentColor" />
            </div>
            <span className="font-black text-lg tracking-tighter uppercase italic">
              PADEL LEAGUE PH
            </span>
          </div>

          <div className="flex gap-8 text-[10px] font-black uppercase tracking-[0.2em] text-[#687FA3]">
            <Link href="/leaderboard" className="hover:text-white transition-colors">
              Leaderboard
            </Link>
            <Link href="/players" className="hover:text-white transition-colors">
              Players
            </Link>
            <Link href="/admin" className="hover:text-white transition-colors">
              Admin
            </Link>
          </div>

          <div className="flex gap-4">
            <div className="w-10 h-10 border border-[#687FA3]/20 rounded-full flex items-center justify-center hover:bg-[#00C8DC] hover:text-[#0E1523] transition-all cursor-pointer">
              <Share2 size={16} />
            </div>
            <div className="w-10 h-10 border border-[#687FA3]/20 rounded-full flex items-center justify-center hover:bg-[#00C8DC] hover:text-[#0E1523] transition-all cursor-pointer">
              <Share2 size={16} />
            </div>
          </div>
        </div>

        <div className="mt-10 text-center text-[#687FA3]/30 text-[9px] font-bold tracking-widest uppercase">
          PADELPH.COM · ALL RIGHTS RESERVED
        </div>
      </footer>
    </div>
  );
}
