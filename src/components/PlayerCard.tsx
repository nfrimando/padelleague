"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Player } from "@/lib/types";

interface PlayerCardProps {
  player: Player | null | undefined;
  size?: "sm" | "lg";
  highlight?: boolean;
  layout?: "default" | "matchCompact";
}

export default function PlayerCard({
  player,
  size = "sm",
  highlight = false,
  layout = "default",
}: PlayerCardProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isLg = size === "lg";
  const hasCustomImage = !!(player?.image_link && player.image_link !== "null");
  const imageSrc = hasCustomImage
    ? (player?.image_link as string)
    : "/default-avatar.webp";
  const playerHref = (() => {
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

  return (
    <div
      className={`group/player rounded-lg p-1 ${
        isMatchCompact
          ? "flex flex-col items-center gap-2 w-[72px] lg:w-[140px]"
          : "flex items-center gap-4 flex-1"
      } ${highlight ? "ring-2 ring-blue-400 dark:ring-blue-500 bg-blue-50 dark:bg-blue-900/30" : ""}`}
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
      <div className={isMatchCompact ? "text-center" : ""}>
        <div
          className={`${
            isMatchCompact
              ? "text-xs font-semibold"
              : isLg
                ? "text-xl font-semibold"
                : "text-sm font-medium"
          } text-slate-900 dark:text-slate-100`}
        >
          {playerHref ? (
            <Link
              href={playerHref}
              className={`text-slate-900 dark:text-slate-100 decoration-transparent underline-offset-2 transition-colors duration-150 hover:text-sky-700 dark:hover:text-sky-300 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/70 focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900 ${
                isMatchCompact
                  ? "inline-block"
                  : "inline-flex items-center gap-1"
              }`}
            >
              {isMatchCompact ? (
                <>
                  <span className="inline lg:hidden">{displayLabel}</span>
                  <span className="hidden lg:inline">{displayName}</span>
                </>
              ) : (
                displayName
              )}
              {!isMatchCompact && (
                <span className="text-sky-600/80 dark:text-sky-300/80 opacity-0 translate-x-[-2px] transition-all duration-150 group-hover/player:opacity-100 group-hover/player:translate-x-0">
                  {"->"}
                </span>
              )}
            </Link>
          ) : isMatchCompact ? (
            <>
              <span className="inline lg:hidden">{displayLabel}</span>
              <span className="hidden lg:inline">{displayName}</span>
            </>
          ) : (
            displayName
          )}
        </div>
        {isMatchCompact ? (
          <div className="hidden lg:block text-[11px] text-slate-500 dark:text-slate-400">
            {displayLabel}
          </div>
        ) : (
          <div
            className={`${isLg ? "text-sm" : "text-xs"} text-slate-500 dark:text-slate-400`}
          >
            {displayLabel}
          </div>
        )}
      </div>
    </div>
  );
}
