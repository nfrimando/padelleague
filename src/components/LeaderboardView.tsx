"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import BackToHome from "@/components/BackToHome";
import MatchFiltersCard from "@/components/MatchFiltersCard";
import { formatEventOptionLabel } from "@/lib/eventLabels";
import type { LeaderboardRow, LeaderboardEvent } from "@/lib/leaderboardData";
import { ALL_MATCH_FILTER } from "@/lib/matches";

type SortKey = "ratingChange" | "matches" | "wins" | "setsWon" | "winRate";
type SortDir = "asc" | "desc";

function PlayerAvatar({
  imageLink,
  name,
}: {
  imageLink: string | null;
  name: string;
}) {
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
  if (value > 0)
    return <span className="text-emerald-400 font-semibold">+{abs}</span>;
  if (value < 0)
    return <span className="text-red-400 font-semibold">−{abs}</span>;
  return <span className="text-[#687FA3]">±0.00</span>;
}

function SortChevron({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) {
    return (
      <svg
        className="inline ml-1 opacity-25 w-3 h-3"
        viewBox="0 0 12 12"
        fill="currentColor"
      >
        <path d="M6 2l3 4H3zM6 10L3 6h6z" />
      </svg>
    );
  }
  return dir === "desc" ? (
    <svg
      className="inline ml-1 w-3 h-3 text-[#00C8DC]"
      viewBox="0 0 12 12"
      fill="currentColor"
    >
      <path d="M6 10L2 4h8z" />
    </svg>
  ) : (
    <svg
      className="inline ml-1 w-3 h-3 text-[#00C8DC]"
      viewBox="0 0 12 12"
      fill="currentColor"
    >
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

function winRate(row: LeaderboardRow): number | null {
  return row.matchesPlayed > 0 ? row.wins / row.matchesPlayed : null;
}

function compareWinRates(a: LeaderboardRow, b: LeaderboardRow): number {
  const aRate = winRate(a);
  const bRate = winRate(b);
  if (aRate !== null && bRate !== null && aRate !== bRate) return bRate - aRate;
  if (aRate === null && bRate !== null) return 1;
  if (aRate !== null && bRate === null) return -1;
  return 0;
}

function sortRows(
  rows: LeaderboardRow[],
  key: SortKey,
  dir: SortDir,
): LeaderboardRow[] {
  return [...rows].sort((a, b) => {
    let aVal: number | null = null;
    let bVal: number | null = null;
    switch (key) {
      case "ratingChange":
        aVal = a.ratingChange;
        bVal = b.ratingChange;
        break;
      case "matches":
        aVal = a.matchesPlayed;
        bVal = b.matchesPlayed;
        break;
      case "wins":
        aVal = a.wins;
        bVal = b.wins;
        break;
      case "winRate":
        aVal = winRate(a);
        bVal = winRate(b);
        break;
      case "setsWon":
        aVal = rowSetsWon(a);
        bVal = rowSetsWon(b);
        break;
    }
    if (aVal === null && bVal === null) return a.name.localeCompare(b.name);
    if (aVal === null) return 1;
    if (bVal === null) return -1;
    const cmp = bVal - aVal;
    const primary = dir === "desc" ? cmp : -cmp;
    if (primary !== 0) return primary;
    // Tiebreaker when sorting by wins: win rate (always descending)
    if (key === "wins") {
      const rateCmp = compareWinRates(a, b);
      if (rateCmp !== 0) return rateCmp;
    }
    return a.name.localeCompare(b.name);
  });
}

function rowSetsWon(row: LeaderboardRow): number {
  return row.setsWon;
}

type Props = {
  events: LeaderboardEvent[];
  rows: LeaderboardRow[];
  selectedEventId: number | "ALL";
  selectedEventStatus: "upcoming" | "ongoing" | "completed" | undefined;
  selectedType: string;
};

export default function LeaderboardView({
  events,
  rows,
  selectedEventId,
  selectedEventStatus,
  selectedType,
}: Props) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>("wins");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const displayRows = useMemo(
    () => sortRows(rows, sortKey, sortDir),
    [rows, sortKey, sortDir],
  );

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const eventOptions = useMemo(
    () =>
      events.map((ev) => ({
        id: ev.event_id,
        label: formatEventOptionLabel(ev),
      })),
    [events],
  );

  function handleEventChange(value: number | "ALL") {
    const params = new URLSearchParams();
    params.set("event", String(value));
    if (selectedType !== ALL_MATCH_FILTER) params.set("type", selectedType);
    router.push(
      `/leaderboard${params.toString() ? `?${params.toString()}` : ""}`,
    );
  }

  function handleTypeChange(value: string) {
    const params = new URLSearchParams();
    params.set("event", String(selectedEventId));
    if (value !== ALL_MATCH_FILTER) params.set("type", value);
    router.push(
      `/leaderboard${params.toString() ? `?${params.toString()}` : ""}`,
    );
  }

  const isCompleted = selectedEventStatus === "completed";
  const thBase =
    "px-3 py-3 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-[#687FA3] cursor-pointer select-none whitespace-nowrap hover:text-[#00C8DC] transition-colors";

  return (
    <>
      <BackToHome />
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Leaderboard</h1>
            <p className="mt-1 text-xs text-[#687FA3]">
              {isCompleted
                ? "Final standings — event complete"
                : "Event standings — click any column header to sort"}
            </p>
          </div>

          <MatchFiltersCard
            variant="dark"
            eventFilter={selectedEventId}
            events={eventOptions}
            selectedTypeFilter={selectedType}
            onEventChange={handleEventChange}
            onTypeChange={handleTypeChange}
          />
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-[#22304a] bg-[#0E1523]">
          <table className="w-full min-w-[520px]">
            <thead>
              <tr className="border-b border-[#22304a]">
                <th className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-[0.15em] text-[#687FA3] w-10">
                  #
                </th>
                <th className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-[#687FA3]">
                  Player
                </th>
                <th
                  className={`${thBase} hidden sm:table-cell`}
                  onClick={() => handleSort("matches")}
                >
                  Played{" "}
                  <SortChevron active={sortKey === "matches"} dir={sortDir} />
                </th>
                <th
                  className={`${thBase} hidden sm:table-cell`}
                  onClick={() => handleSort("wins")}
                >
                  W / L{" "}
                  <SortChevron active={sortKey === "wins"} dir={sortDir} />
                </th>
                <th
                  className={`${thBase} hidden sm:table-cell`}
                  onClick={() => handleSort("setsWon")}
                >
                  Sets W / L{" "}
                  <SortChevron active={sortKey === "setsWon"} dir={sortDir} />
                </th>
                <th className={thBase} onClick={() => handleSort("winRate")}>
                  <span className="hidden sm:inline">Win %</span>
                  <span className="sm:hidden">W%</span>
                  <SortChevron active={sortKey === "winRate"} dir={sortDir} />
                </th>
                <th
                  className={thBase}
                  onClick={() => handleSort("ratingChange")}
                >
                  <span title="Net rating change across filtered matches">
                    Δ Rating
                  </span>
                  <SortChevron
                    active={sortKey === "ratingChange"}
                    dir={sortDir}
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              {displayRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-12 text-center text-sm text-[#687FA3]"
                  >
                    No completed matches found for this event.
                  </td>
                </tr>
              ) : (
                displayRows.map((row, index) => {
                  const winRate =
                    row.matchesPlayed > 0
                      ? (row.wins / row.matchesPlayed) * 100
                      : null;
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
                        <a
                          href={`/players/${encodeURIComponent(row.playerId)}`}
                          className="flex items-center gap-2.5 group"
                        >
                          <PlayerAvatar
                            imageLink={row.imageLink}
                            name={row.name}
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-white group-hover:text-[#00C8DC] transition-colors truncate leading-tight">
                              {row.name}
                            </div>
                            {row.nickname && (
                              <div className="text-xs text-[#687FA3] truncate leading-tight">
                                {row.nickname}
                              </div>
                            )}
                          </div>
                        </a>
                      </td>
                      <td className="px-3 py-3 hidden sm:table-cell text-sm text-[#687FA3] tabular-nums">
                        {row.matchesPlayed}
                      </td>
                      <td className="px-3 py-3 hidden sm:table-cell text-sm tabular-nums">
                        <span className="text-emerald-400">{row.wins}</span>
                        <span className="text-[#687FA3]"> / </span>
                        <span className="text-red-400">{row.losses}</span>
                      </td>
                      <td className="px-3 py-3 hidden sm:table-cell text-sm tabular-nums">
                        <span className="text-emerald-400">{row.setsWon}</span>
                        <span className="text-[#687FA3]"> / </span>
                        <span className="text-red-400">{row.setsLost}</span>
                      </td>
                      <td className="px-3 py-3 text-sm tabular-nums">
                        {winRate != null ? (
                          <span className="text-white font-medium">
                            {winRate.toFixed(0)}%
                          </span>
                        ) : (
                          <span className="text-[#687FA3]">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-sm tabular-nums">
                        <RatingDelta value={row.ratingChange} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {displayRows.length > 0 && (
          <p className="mt-3 text-xs text-[#687FA3]">
            {displayRows.length} player{displayRows.length === 1 ? "" : "s"}
            {isCompleted && (
              <span className="ml-2 text-emerald-600/70">
                · Final standings — data frozen
              </span>
            )}
          </p>
        )}
      </div>
    </>
  );
}
