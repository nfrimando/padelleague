"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import BackToHome from "@/components/BackToHome";
import MatchFiltersCard from "@/components/MatchFiltersCard";
import { formatEventOptionLabel } from "@/lib/eventLabels";
import type { LeaderboardRow, LeaderboardEvent } from "@/lib/leaderboardData";
import { ALL_MATCH_FILTER } from "@/lib/matches";

type SortMode = "wins" | "ratingChange";
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

function compareLeastSetsLost(a: LeaderboardRow, b: LeaderboardRow): number {
  return a.setsLost - b.setsLost;
}

function sortByWins(rows: LeaderboardRow[]): LeaderboardRow[] {
  return [...rows].sort((a, b) => {
    if (a.wins !== b.wins) return b.wins - a.wins;
    const rateCmp = compareWinRates(a, b);
    if (rateCmp !== 0) return rateCmp;
    if (a.setsWon !== b.setsWon) return b.setsWon - a.setsWon;
    const setsLostCmp = compareLeastSetsLost(a, b);
    if (setsLostCmp !== 0) return setsLostCmp;
    return a.name.localeCompare(b.name);
  });
}

function sortByRatingChange(rows: LeaderboardRow[]): LeaderboardRow[] {
  return [...rows].sort((a, b) => {
    if (a.ratingChange === null && b.ratingChange === null)
      return a.name.localeCompare(b.name);
    if (a.ratingChange === null) return 1;
    if (b.ratingChange === null) return -1;
    if (a.ratingChange !== b.ratingChange)
      return b.ratingChange - a.ratingChange;
    return a.name.localeCompare(b.name);
  });
}

function applySortMode(
  rows: LeaderboardRow[],
  mode: SortMode,
): LeaderboardRow[] {
  return mode === "ratingChange" ? sortByRatingChange(rows) : sortByWins(rows);
}

type Props = {
  events: LeaderboardEvent[];
  rows: LeaderboardRow[];
  selectedEventId: number | "ALL";
  selectedType: string;
};

const MAX_LEADERBOARD_ROWS = 20;

export default function LeaderboardView({
  events,
  rows,
  selectedEventId,
  selectedType,
}: Props) {
  const router = useRouter();
  const [sortMode, setSortMode] = useState<SortMode>("wins");

  // Top-20 pool is determined by the active sort mode.
  const limitedRows = useMemo(
    () => applySortMode(rows, sortMode).slice(0, MAX_LEADERBOARD_ROWS),
    [rows, sortMode],
  );

  const totalRows = rows.length;

  const eventOptions = useMemo(
    () =>
      [...events]
        .sort((a, b) => {
          const aTime = a.start_date ? Date.parse(a.start_date) : Number.NaN;
          const bTime = b.start_date ? Date.parse(b.start_date) : Number.NaN;
          const aScore = Number.isFinite(aTime)
            ? aTime
            : Number.NEGATIVE_INFINITY;
          const bScore = Number.isFinite(bTime)
            ? bTime
            : Number.NEGATIVE_INFINITY;

          if (aScore !== bScore) {
            return bScore - aScore;
          }
          return b.event_id - a.event_id;
        })
        .map((ev) => ({
          id: ev.event_id,
          label: formatEventOptionLabel(ev),
        })),
    [events],
  );

  function handleEventChange(value: number | "ALL") {
    const params = new URLSearchParams();
    params.set("event", String(value));
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

  const thBase =
    "px-3 py-3 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-[#687FA3] whitespace-nowrap";

  return (
    <>
      <BackToHome />
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Leaderboard</h1>
            <p className="mt-1 text-xs text-[#687FA3]">
              Showing top {Math.min(totalRows, MAX_LEADERBOARD_ROWS)}
              {totalRows > MAX_LEADERBOARD_ROWS ? ` of ${totalRows}` : ""}{" "}
              players. Maximum visible: {MAX_LEADERBOARD_ROWS}.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label
                htmlFor="sort-mode"
                className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#687FA3]"
              >
                Sort by
              </label>
              <select
                id="sort-mode"
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                className="text-sm bg-[#162032] border border-[#22304a] text-white rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#00C8DC] cursor-pointer"
              >
                <option value="wins">Wins</option>
                <option value="ratingChange">Δ Rating</option>
              </select>
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
                <th className={`${thBase} hidden sm:table-cell`}>Played</th>
                <th className={`${thBase} hidden sm:table-cell`}>W / L</th>
                <th className={`${thBase} hidden sm:table-cell`}>Sets W / L</th>
                <th className={thBase}>
                  <span className="hidden sm:inline">Win %</span>
                  <span className="sm:hidden">W%</span>
                </th>
                <th className={thBase}>
                  <span title="Net rating change across filtered matches">
                    Δ Rating
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {limitedRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-12 text-center text-sm text-[#687FA3]"
                  >
                    No completed matches found for this event and type.
                  </td>
                </tr>
              ) : (
                limitedRows.map((row, index) => {
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

        {totalRows > 0 && (
          <p className="mt-3 text-xs text-[#687FA3]">
            {totalRows} player{totalRows === 1 ? "" : "s"} in pool
          </p>
        )}
      </div>
    </>
  );
}
