"use client";

import Link from "next/link";
import { formatMatchDate } from "@/lib/utils";
import { Player } from "@/lib/types";
import PlayerCardMatchCompact from "./PlayerCardMatchCompact";
import RatingSparkline, { RatingSparklinePoint } from "./RatingSparkline";

interface PlayerCardProps {
  player: Player | null | undefined;
  size?: "sm" | "lg";
  highlight?: boolean;
  layout?: "default" | "matchCompact";
  disableLink?: boolean;
  showLatestRating?: boolean;
  ratingHistory?: RatingSparklinePoint[];
  loadingRating?: boolean;
  hrefBuilder?: (playerId: string) => string;
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
  hrefBuilder,
}: PlayerCardProps) {
  const isLg = size === "lg";
  const hasCustomImage = !!(player?.image_link && player.image_link !== "null");
  const imageSrc = hasCustomImage
    ? (player?.image_link as string)
    : "/default-avatar.webp";
  const playerHref = (() => {
    if (disableLink) return null;
    if (!player?.player_id) return null;
    const id = String(player.player_id);
    if (hrefBuilder) return hrefBuilder(id);
    return `/players?playerId=${encodeURIComponent(id)}`;
  })();
  const displayName = player?.name || "N/A";
  const displayLabel = player?.nickname || "—";
  const preMatchRating = player?.pre_match_rating;
  const latestRating = player?.latest_rating;
  const hasLatestRating =
    typeof latestRating === "number" && Number.isFinite(latestRating);
  const latestMatchDate = player?.latest_match_date;
  const hasLatestMatchDate =
    typeof latestMatchDate === "string" && latestMatchDate.trim().length > 0;
  if (layout === "matchCompact") {
    return (
      <div
        className={`group/player rounded-lg p-1 flex flex-col items-center gap-2 w-[72px] lg:w-[140px] ${
          highlight
            ? "ring-2 ring-blue-400 dark:ring-blue-500 bg-blue-50 dark:bg-blue-900/30"
            : "bg-white text-slate-900 dark:bg-slate-900/40 dark:text-slate-100"
        }`}
      >
        <PlayerCardMatchCompact
          player={player}
          playerHref={playerHref}
          imageSrc={imageSrc}
          hasCustomImage={hasCustomImage}
          displayName={displayName}
          displayLabel={displayLabel}
          preMatchRating={preMatchRating}
        />
      </div>
    );
  }

  return (
    <div
      className={`group/player rounded-lg p-1 flex items-center gap-4 flex-1 ${
        highlight
          ? "ring-2 ring-blue-400 dark:ring-blue-500 bg-blue-50 dark:bg-blue-900/30"
          : "bg-white text-slate-900 dark:bg-slate-900/40 dark:text-slate-100"
      }`}
    >
      {playerHref ? (
        <Link
          href={playerHref}
          className="flex-none rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900"
        >
          <img
            src={imageSrc}
            alt={player?.name || "Player"}
            title={
              !hasCustomImage
                ? "Send url image to Nigel to update this pic!"
                : undefined
            }
            className={`${isLg ? "w-16 h-16 min-w-16 min-h-16" : "w-12 h-12 min-w-12 min-h-12"} shrink-0 aspect-square rounded-full object-cover cursor-pointer transition-transform duration-150 group-hover/player:scale-[1.02]`}
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
          className={`${isLg ? "w-16 h-16 min-w-16 min-h-16" : "w-12 h-12 min-w-12 min-h-12"} shrink-0 aspect-square rounded-full object-cover`}
        />
      )}
      <div className="flex-1 min-w-0">
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
              {isLg &&
                (loadingRating ? (
                  <div className="w-20 h-8 rounded bg-sky-100 dark:bg-sky-900/30 animate-pulse" />
                ) : ratingHistory && ratingHistory.length >= 2 ? (
                  <RatingSparkline history={ratingHistory} />
                ) : null)}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
