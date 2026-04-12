"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  LeaderboardRow,
  LeaderboardRatingRow,
  SeasonFilter,
  TypeFilter,
  MinMatchesFilter,
} from "@/lib/types";
import PlayerAvatar from "@/components/PlayerAvatar";

type Mode = "performance" | "rating";

const SEASONS: SeasonFilter[] = ["ALL", "S8", "S7", "S6", "S5", "S4", "S3", "S2", "S1"];
const TYPES: { value: TypeFilter; label: string }[] = [
  { value: "ALL", label: "All Types" },
  { value: "duel", label: "Duel" },
  { value: "doubles", label: "Doubles" },
  { value: "kotc", label: "KOTC" },
  { value: "team", label: "Team" },
];
const MIN_MATCHES: { value: MinMatchesFilter; label: string }[] = [
  { value: 0, label: "All" },
  { value: 5, label: "5+" },
  { value: 10, label: "10+" },
  { value: 15, label: "15+" },
  { value: 20, label: "20+" },
];

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
        active
          ? "bg-accent text-bg"
          : "bg-surface text-sec border border-bdr hover:border-accent/50 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function fmtDate(d?: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1)
    return <span className="font-mono font-bold text-gold text-sm">1</span>;
  if (rank === 2)
    return <span className="font-mono font-bold text-sec text-sm">2</span>;
  if (rank === 3)
    return <span className="font-mono font-bold text-[#CD7F32] text-sm">3</span>;
  return <span className="font-mono text-muted text-sm">{rank}</span>;
}

export default function LeaderboardPage() {
  const [mode, setMode] = useState<Mode>("performance");

  // Performance state
  const [perfSeason, setPerfSeason] = useState<SeasonFilter>("S8");
  const [perfType, setPerfType] = useState<TypeFilter>("ALL");
  const [perfData, setPerfData] = useState<LeaderboardRow[]>([]);

  // Rating state
  const [ratingType, setRatingType] = useState<TypeFilter>("ALL");
  const [minMatches, setMinMatches] = useState<MinMatchesFilter>(0);
  const [ratingData, setRatingData] = useState<LeaderboardRatingRow[]>([]);

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (mode !== "performance") return;
    setLoading(true);
    supabase
      .rpc("get_leaderboard", {
        season_filter: perfSeason,
        type_filter: perfType,
      })
      .then(({ data }) => {
        setPerfData(data || []);
        setLoading(false);
      });
  }, [mode, perfSeason, perfType]);

  useEffect(() => {
    if (mode !== "rating") return;
    setLoading(true);
    supabase
      .rpc("get_leaderboard_ratings", {
        season_filter: "ALL",
        type_filter: ratingType,
        formula_filter: "v2",
        min_matches: minMatches,
      })
      .then(({ data }) => {
        setRatingData(data || []);
        setLoading(false);
      });
  }, [mode, ratingType, minMatches]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-4xl text-white italic">Leaderboard</h1>
          <p className="text-sec text-sm mt-1">Season standings and ratings</p>
        </div>

        {/* Mode toggle */}
        <div className="flex bg-surface border border-bdr rounded-xl p-1 gap-1">
          <button
            onClick={() => setMode("performance")}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
              mode === "performance"
                ? "bg-accent text-bg"
                : "text-sec hover:text-white"
            }`}
          >
            Performance
          </button>
          <button
            onClick={() => setMode("rating")}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
              mode === "rating"
                ? "bg-accent text-bg"
                : "text-sec hover:text-white"
            }`}
          >
            Rating
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-surface border border-bdr rounded-xl p-4 mb-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted uppercase tracking-wider">Filters</span>
          {loading && (
            <div className="flex items-center gap-1.5 text-xs text-sec">
              <span className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse" />
              Updating…
            </div>
          )}
        </div>

        {mode === "performance" ? (
          <>
            <div className="flex flex-wrap gap-2">
              {SEASONS.map((s) => (
                <Pill key={s} active={perfSeason === s} onClick={() => setPerfSeason(s)}>
                  {s === "ALL" ? "All Seasons" : s}
                </Pill>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {TYPES.map((t) => (
                <Pill key={t.value} active={perfType === t.value} onClick={() => setPerfType(t.value)}>
                  {t.label}
                </Pill>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {TYPES.map((t) => (
                <Pill key={t.value} active={ratingType === t.value} onClick={() => setRatingType(t.value)}>
                  {t.label}
                </Pill>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs text-muted">Min matches:</span>
              {MIN_MATCHES.map((m) => (
                <Pill key={m.value} active={minMatches === m.value} onClick={() => setMinMatches(m.value)}>
                  {m.label}
                </Pill>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Table */}
      <div className="bg-surface border border-bdr rounded-xl overflow-hidden">
        {loading ? (
          <div className="space-y-px">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-14 bg-elevated/50 animate-pulse" />
            ))}
          </div>
        ) : mode === "performance" ? (
          <PerfTable data={perfData} />
        ) : (
          <RatingTable data={ratingData} />
        )}
      </div>
    </div>
  );
}

function PerfTable({ data }: { data: LeaderboardRow[] }) {
  if (!data.length)
    return <div className="py-16 text-center text-sec text-sm">No data.</div>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-bdr text-xs text-muted">
            <th className="px-4 py-3 text-left w-8">#</th>
            <th className="px-4 py-3 text-left">Player</th>
            <th className="px-3 py-3 text-right text-win">W</th>
            <th className="px-3 py-3 text-right text-loss">L</th>
            <th className="px-3 py-3 text-right hidden md:table-cell">Win%</th>
            <th className="px-3 py-3 text-right hidden md:table-cell">Pts</th>
            <th className="px-3 py-3 text-right text-win hidden lg:table-cell">Sw</th>
            <th className="px-3 py-3 text-right text-loss hidden lg:table-cell">Sl</th>
            <th className="px-3 py-3 text-right hidden md:table-cell">Last</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr
              key={row.player_id}
              className="border-b border-bdr/50 hover:bg-elevated/50 transition-colors"
            >
              <td className="px-4 py-3 text-center">
                <RankBadge rank={row.rank} />
              </td>
              <td className="px-4 py-3">
                <Link
                  href={`/players/${row.player_id}`}
                  className="flex items-center gap-3 hover:text-accent transition-colors"
                >
                  <PlayerAvatar
                    name={row.player_name}
                    imageLink={row.image_link}
                    size={32}
                  />
                  <div>
                    <div className="font-medium text-white text-sm">
                      {row.player_name}
                    </div>
                    {row.nickname && (
                      <div className="text-xs text-muted">"{row.nickname}"</div>
                    )}
                  </div>
                </Link>
              </td>
              <td className="px-3 py-3 text-right font-mono text-win">{row.wins}</td>
              <td className="px-3 py-3 text-right font-mono text-loss">{row.losses}</td>
              <td className="px-3 py-3 text-right font-mono text-sec hidden md:table-cell">
                {(row.win_pct * 100).toFixed(0)}%
              </td>
              <td className="px-3 py-3 text-right font-mono text-white hidden md:table-cell">
                {row.points}
              </td>
              <td className="px-3 py-3 text-right font-mono text-win hidden lg:table-cell">
                {row.sets_won}
              </td>
              <td className="px-3 py-3 text-right font-mono text-loss hidden lg:table-cell">
                {row.sets_lost}
              </td>
              <td className="px-3 py-3 text-right text-xs text-sec hidden md:table-cell">
                {fmtDate(row.last_match_date)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RatingTable({ data }: { data: LeaderboardRatingRow[] }) {
  if (!data.length)
    return <div className="py-16 text-center text-sec text-sm">No data.</div>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-bdr text-xs text-muted">
            <th className="px-4 py-3 text-left w-8">#</th>
            <th className="px-4 py-3 text-left">Player</th>
            <th className="px-3 py-3 text-right text-accent">Rating</th>
            <th className="px-3 py-3 text-right text-win">W</th>
            <th className="px-3 py-3 text-right text-loss">L</th>
            <th className="px-3 py-3 text-right text-win hidden lg:table-cell">Sw</th>
            <th className="px-3 py-3 text-right text-loss hidden lg:table-cell">Sl</th>
            <th className="px-3 py-3 text-right hidden md:table-cell">Peak</th>
            <th className="px-3 py-3 text-right hidden md:table-cell">Last</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr
              key={row.player_id}
              className="border-b border-bdr/50 hover:bg-elevated/50 transition-colors"
            >
              <td className="px-4 py-3 text-center">
                <RankBadge rank={row.rank} />
              </td>
              <td className="px-4 py-3">
                <Link
                  href={`/players/${row.player_id}`}
                  className="flex items-center gap-3 hover:text-accent transition-colors"
                >
                  <PlayerAvatar
                    name={row.player_name}
                    imageLink={row.image_link}
                    size={32}
                  />
                  <div>
                    <div className="font-medium text-white text-sm">
                      {row.player_name}
                    </div>
                    {row.nickname && (
                      <div className="text-xs text-muted">"{row.nickname}"</div>
                    )}
                  </div>
                </Link>
              </td>
              <td className="px-3 py-3 text-right font-mono text-accent font-semibold">
                {row.current_rating?.toFixed(2) ?? "—"}
              </td>
              <td className="px-3 py-3 text-right font-mono text-win">{row.wins}</td>
              <td className="px-3 py-3 text-right font-mono text-loss">{row.losses}</td>
              <td className="px-3 py-3 text-right font-mono text-win hidden lg:table-cell">
                {row.sets_won}
              </td>
              <td className="px-3 py-3 text-right font-mono text-loss hidden lg:table-cell">
                {row.sets_lost}
              </td>
              <td className="px-3 py-3 text-right font-mono text-sec hidden md:table-cell">
                {row.peak_rating?.toFixed(2) ?? "—"}
              </td>
              <td className="px-3 py-3 text-right text-xs text-sec hidden md:table-cell">
                {fmtDate(row.last_match_date)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
