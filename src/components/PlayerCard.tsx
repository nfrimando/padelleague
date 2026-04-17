"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { formatMatchDate } from "@/lib/utils";
import { Player } from "@/lib/types";

interface RatingSparklinePoint {
  rating: number;
  date?: string | null;
}

function RatingSparkline({ history }: { history: RatingSparklinePoint[] }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  if (history.length < 2) return null;
  const W = 80;
  const H = 32;
  const PAD = 3;
  const ratings = history.map((h) => h.rating);
  const min = Math.min(...ratings);
  const max = Math.max(...ratings);
  const range = max - min || 0.01;
  const toX = (i: number) => PAD + (i / (history.length - 1)) * (W - PAD * 2);
  const toY = (r: number) => PAD + (1 - (r - min) / range) * (H - PAD * 2);
  const pts = history.map((h, i) => ({ x: toX(i), y: toY(h.rating) }));
  // Polyline and dots start from index 1 (index 0 is the hidden baseline)
  const polyline = pts
    .slice(1)
    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
  const lineColor = "#0ea5e9"; // sky-500
  const dotColor = (i: number) => {
    const delta = ratings[i] - ratings[i - 1];
    if (delta > 0.005) return "#22c55e"; // green-500
    if (delta < -0.005) return "#ef4444"; // red-500
    return "#0ea5e9";
  };

  return (
    <div className="relative">
      {hoveredIdx !== null && (
        <div
          className="absolute pointer-events-none z-10 -translate-x-1/2 text-[10px] font-bold tabular-nums bg-sky-900/90 text-sky-100 rounded px-1.5 py-0.5 whitespace-nowrap shadow"
          style={{
            left: `${(pts[hoveredIdx].x / W) * 100}%`,
            bottom: "calc(100% + 3px)",
          }}
        >
          {history[hoveredIdx].rating.toFixed(2)}
        </div>
      )}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-20 h-8"
        fill="none"
        aria-hidden="true"
      >
        <polyline
          points={polyline}
          stroke={lineColor}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.85"
        />
        {pts.map((p, i) => {
          if (i === 0) return null; // baseline only, not rendered
          return (
            <g key={i}>
              <circle
                cx={p.x.toFixed(1)}
                cy={p.y.toFixed(1)}
                r={hoveredIdx === i ? 3.5 : i === pts.length - 1 ? 2.5 : 1.5}
                fill={dotColor(i)}
              />
              {/* invisible hit area */}
              <circle
                cx={p.x.toFixed(1)}
                cy={p.y.toFixed(1)}
                r="8"
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

interface PlayerCardProps {
  player: Player | null | undefined;
  size?: "sm" | "lg";
  highlight?: boolean;
  layout?: "default" | "matchCompact";
  disableLink?: boolean;
  showLatestRating?: boolean;
  ratingHistory?: RatingSparklinePoint[];
  loadingRating?: boolean;
}

export default function PlayerCard({
  player,
  size = "sm",
  highlight = false,
  layout = "default",
  disableLink = false,
  showLatestRating = true,
  ratingHistory,
  loadingRating = false,
}: PlayerCardProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isLg = size === "lg";
  const hasCustomImage = !!(player?.image_link && player.image_link !== "null");
  const imageSrc = hasCustomImage
    ? (player?.image_link as string)
    : "/default-avatar.webp";
  const playerHref = (() => {
    if (disableLink) {
      return null;
    }

    if (!player?.player_id) {
      return null;
    }

    // Preserve active players-page filters when navigating between player profiles.
    if (pathname === "/players") {
      const params = new URLSearchParams(searchParams.toString());
      params.set("playerId", String(player.player_id));
      params.delete("playerid");
      return `${pathname}?${params.toString()}`;
    }

    return `/players?playerId=${encodeURIComponent(String(player.player_id))}`;
  })();
  const isMatchCompact = layout === "matchCompact";
  const displayName = player?.name || "N/A";
  const displayLabel = player?.nickname || "—";
  const preMatchRating = player?.pre_match_rating;
  const hasPreMatchRating =
    typeof preMatchRating === "number" && Number.isFinite(preMatchRating);
  const latestRating = player?.latest_rating;
  const hasLatestRating =
    typeof latestRating === "number" && Number.isFinite(latestRating);
  const latestMatchDate = player?.latest_match_date;
  const hasLatestMatchDate =
    typeof latestMatchDate === "string" && latestMatchDate.trim().length > 0;

  return (
    <div
      className={`group/player rounded-lg p-1 ${
        isMatchCompact
          ? "flex flex-col items-center gap-2 w-[72px] lg:w-[140px]"
          : "flex items-center gap-4 flex-1"
      } ${
        highlight
          ? "ring-2 ring-blue-400 dark:ring-blue-500 bg-blue-50 dark:bg-blue-900/30"
          : "bg-white text-slate-900 dark:bg-slate-900/40 dark:text-slate-100"
      }`}
    >
      {playerHref ? (
        <Link
          href={playerHref}
          className={`flex-none rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900 ${
            isMatchCompact ? "inline-flex" : ""
          }`}
        >
          <img
            src={imageSrc}
            alt={player?.name || "Player"}
            title={
              !hasCustomImage
                ? "Send url image to Nigel to update this pic!"
                : undefined
            }
            className={`${
              isMatchCompact
                ? "w-9 h-9 min-w-9 min-h-9 lg:w-12 lg:h-12 lg:min-w-12 lg:min-h-12"
                : isLg
                  ? "w-16 h-16 min-w-16 min-h-16"
                  : "w-12 h-12 min-w-12 min-h-12"
            } shrink-0 aspect-square rounded-full object-cover cursor-pointer transition-transform duration-150 group-hover/player:scale-[1.02]`}
          />
        </Link>
      ) : (
        <img
          src={imageSrc}
          alt={player?.name || "Player"}
          title={
            !hasCustomImage
              ? "Send url image to Nigel to update this pic!"
              : undefined
          }
          className={`${
            isMatchCompact
              ? "w-9 h-9 min-w-9 min-h-9 lg:w-12 lg:h-12 lg:min-w-12 lg:min-h-12"
              : isLg
                ? "w-16 h-16 min-w-16 min-h-16"
                : "w-12 h-12 min-w-12 min-h-12"
          } shrink-0 aspect-square rounded-full object-cover`}
        />
      )}
      <div className={isMatchCompact ? "text-center" : "flex-1 min-w-0"}>
        {isMatchCompact ? (
          <>
            <div className="text-[10px] lg:text-xs font-semibold text-slate-900 dark:text-slate-100">
              {playerHref ? (
                <Link
                  href={playerHref}
                  className="inline-block text-slate-900 dark:text-slate-100 decoration-transparent underline-offset-2 transition-colors duration-150 hover:text-sky-700 dark:hover:text-sky-300 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/70 focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900"
                >
                  <span className="inline lg:hidden">{displayLabel}</span>
                  <span className="hidden lg:inline">{displayName}</span>
                </Link>
              ) : (
                <>
                  <span className="inline lg:hidden">{displayLabel}</span>
                  <span className="hidden lg:inline">{displayName}</span>
                </>
              )}
            </div>
            <div className="hidden lg:block text-[11px] text-slate-500 dark:text-slate-400">
              {displayLabel}
            </div>
          </>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div
                className={`${isLg ? "text-xl font-semibold" : "text-sm font-medium"} text-slate-900 dark:text-slate-100`}
              >
                {playerHref ? (
                  <Link
                    href={playerHref}
                    className="inline-flex items-center gap-1 text-slate-900 dark:text-slate-100 decoration-transparent underline-offset-2 transition-colors duration-150 hover:text-sky-700 dark:hover:text-sky-300 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/70 focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900"
                  >
                    {displayName}
                    <span className="text-sky-600/80 dark:text-sky-300/80 opacity-0 translate-x-[-2px] transition-all duration-150 group-hover/player:opacity-100 group-hover/player:translate-x-0">
                      {"->"}
                    </span>
                  </Link>
                ) : (
                  displayName
                )}
              </div>
              <div
                className={`${isLg ? "text-sm" : "text-xs"} text-slate-500 dark:text-slate-400`}
              >
                {displayLabel}
              </div>
              {loadingRating ? (
                <div className="mt-0.5 h-4 w-28 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
              ) : hasLatestMatchDate ? (
                <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  Last Match: {formatMatchDate(latestMatchDate)}
                </div>
              ) : null}
            </div>
            {(showLatestRating && (hasLatestRating || loadingRating)) ||
            (isLg && ratingHistory && ratingHistory.length >= 2) ? (
              <div className="flex flex-col items-end gap-1.5">
                {showLatestRating &&
                  (loadingRating ? (
                    <div
                      className={`inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-6 py-1 dark:border-sky-700/60 dark:bg-sky-900/30 ${isLg ? "text-base" : "text-sm"} font-bold tabular-nums text-sky-700 dark:text-sky-300 whitespace-nowrap leading-none shadow-sm animate-pulse`}
                    >
                      &nbsp;
                    </div>
                  ) : hasLatestRating ? (
                    <div
                      className={`inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 dark:border-sky-700/60 dark:bg-sky-900/30 ${isLg ? "text-base" : "text-sm"} font-bold tabular-nums text-sky-700 dark:text-sky-300 whitespace-nowrap leading-none shadow-sm`}
                    >
                      {latestRating.toFixed(2)}
                    </div>
                  ) : null)}
                {isLg && (
                  loadingRating ? (
                    <div className="w-20 h-8 rounded bg-sky-100 dark:bg-sky-900/30 animate-pulse" />
                  ) : ratingHistory && ratingHistory.length >= 2 ? (
                    <RatingSparkline history={ratingHistory} />
                  ) : null
                )}
              </div>
            ) : null}
          </div>
        )}
        {isMatchCompact && hasPreMatchRating && (
          <div className="mt-0.5 text-[10px] lg:text-[11px] font-medium text-sky-700 dark:text-sky-300">
            {preMatchRating.toFixed(2)}
          </div>
        )}
      </div>
    </div>
  );
}
