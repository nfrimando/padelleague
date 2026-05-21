"use client";

import Link from "next/link";
import {
  usePredictorLeaderboard,
  type PredictorLeaderboardEntry,
} from "@/lib/usePredictorLeaderboard";

function displayName(entry: PredictorLeaderboardEntry): string {
  return entry.nickname ?? entry.name ?? "Unknown";
}

function imageSrc(entry: PredictorLeaderboardEntry): string {
  return entry.image_link && entry.image_link !== "null"
    ? entry.image_link
    : "/default-avatar.webp";
}

function RankBadge({ rank }: { rank: number }) {
  const colorClass =
    rank === 1
      ? "text-yellow-400"
      : rank === 2
        ? "text-slate-300"
        : rank === 3
          ? "text-amber-600"
          : "text-[#687FA3]";
  return (
    <span className={`text-xs font-black w-5 text-center tabular-nums shrink-0 ${colorClass}`}>
      {rank}
    </span>
  );
}

export function PredictorLeaderboard() {
  const { data, isLoading, error } = usePredictorLeaderboard();

  return (
    <div className="bg-[#162032] border border-[#687FA3]/10 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-[#687FA3]/10">
        <h2 className="text-xs font-black uppercase tracking-widest text-slate-200">
          Top Predictors
        </h2>
      </div>

      {isLoading && (
        <div className="space-y-3 px-4 py-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3 animate-pulse">
              <div className="w-5 h-3 bg-[#687FA3]/20 rounded shrink-0" />
              <div className="w-7 h-7 bg-[#687FA3]/20 rounded-full shrink-0" />
              <div className="flex-1 h-3 bg-[#687FA3]/20 rounded" />
              <div className="w-10 h-3 bg-[#687FA3]/20 rounded" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && error && (
        <p className="px-4 py-4 text-xs text-rose-400">{error}</p>
      )}

      {!isLoading && !error && data.length === 0 && (
        <p className="px-4 py-6 text-xs text-[#687FA3] text-center">
          No predictions resolved yet.
        </p>
      )}

      {!isLoading && !error && data.length > 0 && (
        <ul className="divide-y divide-[#687FA3]/10">
          {data.map((entry, idx) => {
            const rank =
              idx === 0 || data[idx - 1].points !== entry.points
                ? idx + 1
                : data.findIndex((e) => e.points === entry.points) + 1;
            return (
            <li key={entry.player_id}>
              <Link
                href={`/players/${entry.player_id}`}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors cursor-pointer"
              >
                <RankBadge rank={rank} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageSrc(entry)}
                  alt={displayName(entry)}
                  className="w-7 h-7 rounded-full object-cover shrink-0"
                />
                <span className="flex-1 text-xs font-semibold text-slate-200 truncate">
                  {displayName(entry)}
                </span>
                <span className="text-xs font-bold text-slate-200 tabular-nums shrink-0">
                  {entry.points.toFixed(2)}
                  <span className="text-[10px] font-normal text-[#687FA3] ml-0.5">
                    pts
                  </span>
                </span>
              </Link>
            </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
