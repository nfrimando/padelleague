import Link from "next/link";
import { Player } from "@/lib/types";
import { formatMatchDateRelative } from "@/lib/utils";

type PlayerDiscoveryCardProps = {
  player: Player;
  href: string;
  lifetimeMatches?: number | null;
  loadingLifetimeMatches?: boolean;
  latestMatchDate?: string | null;
  latestRating?: number | null;
};

export default function PlayerDiscoveryCard({
  player,
  href,
  lifetimeMatches,
  loadingLifetimeMatches = false,
  latestMatchDate = null,
  latestRating = null,
}: PlayerDiscoveryCardProps) {
  const hasName =
    typeof player.name === "string" && player.name.trim().length > 0;
  const hasNickname =
    typeof player.nickname === "string" && player.nickname.trim().length > 0;
  const hasCustomImage = !!(player.image_link && player.image_link !== "null");
  const imageSrc = hasCustomImage ? player.image_link : "/default-avatar.webp";
  const cardRating =
    typeof latestRating === "number" && Number.isFinite(latestRating)
      ? latestRating
      : null;
  const effectiveLatestMatchDate =
    latestMatchDate ?? player.latest_match_date ?? null;
  const hasLatestMatchDate =
    typeof effectiveLatestMatchDate === "string" &&
    effectiveLatestMatchDate.trim().length > 0;

  return (
    <Link
      href={href}
      className="group flex flex-col gap-3 overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-900 p-4 transition-all duration-200 hover:bg-slate-800/70 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/80"
    >
      <div className="flex items-start gap-2 sm:gap-3">
        <img
          src={imageSrc || "/default-avatar.webp"}
          alt={player.name || "Player"}
          className="h-12 w-12 sm:h-16 sm:w-16 shrink-0 rounded-xl object-cover ring-1 ring-white/10"
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold leading-snug text-slate-100 line-clamp-2">
            {hasName ? player.name : "-"}
          </div>
          {hasNickname && (
            <div className="mt-0.5 text-[11px] text-slate-400 truncate">
              {player.nickname}
            </div>
          )}
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-widest text-slate-500">
              Rating
            </span>
            <span className="text-sm font-bold tabular-nums text-sky-300">
              {!loadingLifetimeMatches ? (
                cardRating != null ? (
                  cardRating.toFixed(2)
                ) : (
                  <span className="text-slate-500 text-xs font-normal">—</span>
                )
              ) : (
                <span className="inline-block h-4 w-10 rounded bg-slate-700/60 animate-pulse" />
              )}
            </span>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-700/60" />

      <div className="flex items-center gap-2 text-xs text-slate-400">
        {loadingLifetimeMatches ? (
          <span className="inline-block h-3.5 w-24 rounded bg-slate-700/60 animate-pulse" />
        ) : (
          <>
            <span className="font-medium text-slate-300">
              {typeof lifetimeMatches === "number" ? lifetimeMatches : "—"}
            </span>
            <span>matches</span>
            {hasLatestMatchDate && (
              <>
                <span className="text-slate-600">·</span>
                <span>Last {formatMatchDateRelative(effectiveLatestMatchDate)}</span>
              </>
            )}
          </>
        )}
      </div>
    </Link>
  );
}
