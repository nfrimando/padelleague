"use client";

import { Suspense, useMemo, useState } from "react";
import BackToHome from "@/components/BackToHome";
import {
  useLeaderboard,
  useLeaderboardEvents,
  MATCH_TYPE_OPTIONS,
  type LeaderboardRow,
  type MatchTypeFilter,
} from "@/lib/useLeaderboard";

// ─── Display helpers ──────────────────────────────────────────────────────────

function PlayerAvatar({ imageLink, name }: { imageLink: string | null; name: string }) {
  if (imageLink) {
    return (
      <img
        src={imageLink}
        alt={name}
        className="h-8 w-8 rounded-full object-cover border border-white/10 shrink-0"
      />
    );
  }
  return (
    <div className="h-8 w-8 rounded-full bg-[#162032] border border-[#22304a] flex items-center justify-center text-xs font-bold text-[#687FA3] shrink-0">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function RatingDelta({ value }: { value: number | null }) {
  if (value === null) return <span className="text-[#687FA3]">—</span>;
  const abs = Math.abs(value).toFixed(2);
  if (value > 0) return <span className="text-emerald-400 font-semibold">+{abs}</span>;
  if (value < 0) return <span className="text-red-400 font-semibold">−{abs}</span>;
  return <span className="text-[#687FA3]">±0.00</span>;
}

type SortKey = "rating" | "ratingChange" | "matches" | "wins" | "winRate" | "setsWon";
type SortDir = "asc" | "desc";

function SortChevron({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) {
    return (
      <svg className="inline ml-1 opacity-25 w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
        <path d="M6 2l3 4H3zM6 10L3 6h6z" />
      </svg>
    );
  }
  return dir === "desc" ? (
    <svg className="inline ml-1 w-3 h-3 text-[#00C8DC]" viewBox="0 0 12 12" fill="currentColor">
      <path d="M6 10L2 4h8z" />
    </svg>
  ) : (
    <svg className="inline ml-1 w-3 h-3 text-[#00C8DC]" viewBox="0 0 12 12" fill="currentColor">
      <path d="M6 2l4 6H2z" />
    </svg>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="font-black text-yellow-400">1</span>;
  if (rank === 2) return <span className="font-black text-slate-300">2</span>;
  if (rank === 3) return <span className="font-black text-amber-600">3</span>;
  return <span className="text-[#687FA3]">{rank}</span>;
}

function getVal(row: LeaderboardRow, key: SortKey): number | null {
  switch (key) {
    case "rating": return row.currentRating;
    case "ratingChange": return row.ratingChange;
    case "matches": return row.matchesPlayed;
    case "wins": return row.wins;
    case "setsWon": return row.setsWon;
    case "winRate": return row.matchesPlayed > 0 ? row.wins / row.matchesPlayed : null;
  }
}

function sortRows(rows: LeaderboardRow[], key: SortKey, dir: SortDir): LeaderboardRow[] {
  return [...rows].sort((a, b) => {
    const aVal = getVal(a, key);
    const bVal = getVal(b, key);

    if (aVal === null && bVal === null) return a.name.localeCompare(b.name);
    if (aVal === null) return 1;
    if (bVal === null) return -1;

    const primary = dir === "desc" ? bVal - aVal : aVal - bVal;
    if (primary !== 0) return primary;

    // Tiebreakers: wins → win rate → sets won
    if (key !== "wins") {
      const diff = b.wins - a.wins;
      if (diff !== 0) return diff;
    }
    if (key !== "winRate") {
      const aWr = a.matchesPlayed > 0 ? a.wins / a.matchesPlayed : 0;
      const bWr = b.matchesPlayed > 0 ? b.wins / b.matchesPlayed : 0;
      const diff = bWr - aWr;
      if (diff !== 0) return diff;
    }
    if (key !== "setsWon") {
      const diff = b.setsWon - a.setsWon;
      if (diff !== 0) return diff;
    }
    return a.name.localeCompare(b.name);
  });
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <tr key={i} className="border-b border-[#162032]">
          <td className="px-3 py-3">
            <div className="h-4 w-4 rounded bg-[#22304a] animate-pulse mx-auto" />
          </td>
          <td className="px-3 py-3">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-full bg-[#22304a] animate-pulse shrink-0" />
              <div className="space-y-1.5">
                <div className="h-3 w-24 rounded bg-[#22304a] animate-pulse" />
                <div className="h-2.5 w-16 rounded bg-[#22304a] animate-pulse" />
              </div>
            </div>
          </td>
          {[1, 2, 3, 4, 5, 6].map((j) => (
            <td key={j} className="px-3 py-3">
              <div className="h-3 w-10 rounded bg-[#22304a] animate-pulse" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ─── Main content ─────────────────────────────────────────────────────────────

function LeaderboardContent() {
  const { events, loading: eventsLoading } = useLeaderboardEvents();

  const [selectedEventId, setSelectedEventId] = useState<number | "all" | null>(null);
  const [matchType, setMatchType] = useState<MatchTypeFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("wins");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Default to the most recent event once events load
  const effectiveEventId = useMemo<number | "all">(() => {
    if (selectedEventId !== null) return selectedEventId;
    return events[0]?.event_id ?? "all";
  }, [selectedEventId, events]);

  const selectedEvent = useMemo(
    () => (typeof effectiveEventId === "number" ? events.find((e) => e.event_id === effectiveEventId) : undefined),
    [effectiveEventId, events],
  );

  const { rows, loading, error } = useLeaderboard(effectiveEventId, selectedEvent?.status, matchType);

  const displayRows = useMemo(() => sortRows(rows, sortKey, sortDir), [rows, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  const isCompleted = selectedEvent?.status === "completed";
  const thBase = "px-3 py-3 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-[#687FA3] cursor-pointer select-none whitespace-nowrap hover:text-[#00C8DC] transition-colors";

  return (
    <>
      <BackToHome />
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Leaderboard</h1>
            <p className="mt-1 text-xs text-[#687FA3]">
              {isCompleted ? "Final standings — event complete" : "Event standings — click any column to sort"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#687FA3]">Event</label>
              {eventsLoading ? (
                <div className="h-8 w-44 rounded-md bg-[#162032] animate-pulse" />
              ) : (
                <select
                  value={effectiveEventId}
                  onChange={(e) =>
                    setSelectedEventId(e.target.value === "all" ? "all" : Number(e.target.value))
                  }
                  className="text-sm bg-[#162032] border border-[#22304a] text-white rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#00C8DC] cursor-pointer"
                >
                  <option value="all">All Time</option>
                  {events.map((ev) => (
                    <option key={ev.event_id} value={ev.event_id}>
                      {ev.name ?? `Event ${ev.event_id}`}
                      {ev.status === "completed" ? " ✓" : ev.status === "ongoing" ? " ●" : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex items-center gap-2">
              <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#687FA3]">Type</label>
              <select
                value={matchType}
                onChange={(e) => setMatchType(e.target.value as MatchTypeFilter)}
                className="text-sm bg-[#162032] border border-[#22304a] text-white rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#00C8DC] cursor-pointer"
              >
                {MATCH_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded border border-red-800 bg-red-900/20 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-[#22304a] bg-[#0E1523]">
          <table className="w-full min-w-[580px]">
            <thead>
              <tr className="border-b border-[#22304a]">
                <th className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-[0.15em] text-[#687FA3] w-10">#</th>
                <th className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-[#687FA3]">Player</th>
                <th className={thBase} onClick={() => handleSort("rating")}>
                  Rating <SortChevron active={sortKey === "rating"} dir={sortDir} />
                </th>
                <th className={thBase} onClick={() => handleSort("ratingChange")}>
                  <span className="hidden sm:inline">Change</span>
                  <span className="sm:hidden">±</span>
                  <SortChevron active={sortKey === "ratingChange"} dir={sortDir} />
                </th>
                <th className={`${thBase} hidden sm:table-cell`} onClick={() => handleSort("wins")}>
                  W / L <SortChevron active={sortKey === "wins"} dir={sortDir} />
                </th>
                <th className={`${thBase} hidden sm:table-cell`} onClick={() => handleSort("matches")}>
                  Played <SortChevron active={sortKey === "matches"} dir={sortDir} />
                </th>
                <th className={`${thBase} hidden sm:table-cell`} onClick={() => handleSort("setsWon")}>
                  Sets <SortChevron active={sortKey === "setsWon"} dir={sortDir} />
                </th>
                <th className={thBase} onClick={() => handleSort("winRate")}>
                  <span className="hidden sm:inline">Win %</span>
                  <span className="sm:hidden">W%</span>
                  <SortChevron active={sortKey === "winRate"} dir={sortDir} />
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows />
              ) : displayRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm text-[#687FA3]">
                    No completed matches found for this event.
                  </td>
                </tr>
              ) : (
                displayRows.map((row, index) => {
                  const winRate = row.matchesPlayed > 0 ? (row.wins / row.matchesPlayed) * 100 : null;
                  const rank = index + 1;
                  return (
                    <tr
                      key={row.playerId}
                      className={`border-b border-[#162032] last:border-0 hover:bg-[#162032]/70 transition-colors ${rank <= 3 ? "bg-[#162032]/30" : ""}`}
                    >
                      <td className="px-3 py-3 text-center text-sm font-bold">
                        <RankBadge rank={rank} />
                      </td>
                      <td className="px-3 py-3">
                        <a href={`/players/${encodeURIComponent(row.playerId)}`} className="flex items-center gap-2.5 group">
                          <PlayerAvatar imageLink={row.imageLink} name={row.name} />
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-white group-hover:text-[#00C8DC] transition-colors truncate leading-tight">
                              {row.name}
                            </div>
                            {row.nickname && (
                              <div className="text-xs text-[#687FA3] truncate leading-tight">{row.nickname}</div>
                            )}
                          </div>
                        </a>
                      </td>
                      <td className="px-3 py-3 font-mono font-bold text-sm text-white tabular-nums">
                        {row.currentRating != null ? row.currentRating.toFixed(2) : "—"}
                      </td>
                      <td className="px-3 py-3 text-sm tabular-nums">
                        <RatingDelta value={row.ratingChange} />
                      </td>
                      <td className="px-3 py-3 hidden sm:table-cell text-sm tabular-nums">
                        <span className="text-emerald-400">{row.wins}</span>
                        <span className="text-[#687FA3]"> / </span>
                        <span className="text-red-400">{row.losses}</span>
                      </td>
                      <td className="px-3 py-3 hidden sm:table-cell text-sm text-[#687FA3] tabular-nums">
                        {row.matchesPlayed}
                      </td>
                      <td className="px-3 py-3 hidden sm:table-cell text-sm text-[#687FA3] tabular-nums">
                        {row.setsWon}
                      </td>
                      <td className="px-3 py-3 text-sm tabular-nums">
                        {winRate != null ? (
                          <span className="text-white font-medium">{winRate.toFixed(0)}%</span>
                        ) : (
                          <span className="text-[#687FA3]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {!loading && displayRows.length > 0 && (
          <p className="mt-3 text-xs text-[#687FA3]">
            {displayRows.length} player{displayRows.length === 1 ? "" : "s"} · ranked by wins, then win rate, then sets won
            {isCompleted && <span className="ml-2 text-emerald-600/70">· Final standings — data frozen</span>}
          </p>
        )}
      </div>
    </>
  );
}

export default function LeaderboardPage() {
  return (
    <Suspense fallback={<div className="p-6 max-w-xl mx-auto text-sm text-slate-500">Loading...</div>}>
      <LeaderboardContent />
    </Suspense>
  );
}
