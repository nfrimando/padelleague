import Link from "next/link";
import { Player } from "@/lib/types";

type PlayerDiscoveryCardProps = {
  player: Player;
  href: string;
  lifetimeMatches?: number | null;
  loadingLifetimeMatches?: boolean;
};

export default function PlayerDiscoveryCard({
  player,
  href,
  lifetimeMatches,
  loadingLifetimeMatches = false,
}: PlayerDiscoveryCardProps) {
  const hasCustomImage = !!(player.image_link && player.image_link !== "null");
  const imageSrc = hasCustomImage ? player.image_link : "/default-avatar.webp";
  const cardRating =
    typeof player.latest_rating === "number" &&
    Number.isFinite(player.latest_rating)
      ? player.latest_rating
      : typeof player.pre_match_rating === "number" &&
          Number.isFinite(player.pre_match_rating)
        ? player.pre_match_rating
        : typeof player.initial_rating === "number" &&
            Number.isFinite(player.initial_rating)
          ? player.initial_rating
          : null;

  return (
    <Link
      href={href}
      className="group relative overflow-hidden rounded-2xl border border-slate-300/90 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-[0_14px_28px_-22px_rgba(15,23,42,0.65)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_36px_-24px_rgba(15,23,42,0.7)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/80"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-500 via-cyan-500 to-blue-600" />
      <div className="flex items-start justify-between gap-3">
        <div className="relative">
          <img
            src={imageSrc || "/default-avatar.webp"}
            alt={player.name || "Player"}
            className="h-14 w-14 rounded-xl object-cover ring-2 ring-white dark:ring-slate-800"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {player.name || "Unknown Player"}
          </div>
          <div className="mt-1 inline-flex max-w-full items-center rounded-md border border-slate-200/90 dark:border-slate-700 bg-slate-50/90 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
            <span className="truncate">{player.nickname || "No nickname"}</span>
          </div>
        </div>
        <div className="rounded-lg border border-sky-200 dark:border-sky-900/80 bg-sky-50/80 dark:bg-sky-950/25 px-2.5 py-1 text-right shrink-0">
          <div className="text-[10px] uppercase tracking-[0.12em] text-sky-700/90 dark:text-sky-300/85">
            Rating
          </div>
          <div className="mt-0.5 text-lg font-bold tabular-nums text-sky-900 dark:text-sky-200">
            {cardRating != null ? cardRating.toFixed(2) : "-"}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-end justify-between rounded-xl border border-slate-200/90 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/70 px-3 py-2.5">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
            Lifetime Matches
          </div>
          {loadingLifetimeMatches ? (
            <div className="mt-1 h-6 w-12 rounded-md bg-slate-200/70 dark:bg-slate-700/70 animate-pulse" />
          ) : (
            <div className="mt-1 text-2xl font-bold leading-none text-slate-900 dark:text-slate-100 tabular-nums">
              {typeof lifetimeMatches === "number" ? lifetimeMatches : "-"}
            </div>
          )}
        </div>
        <div className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 dark:text-slate-200">
          View profile
          <span className="transition-transform duration-200 group-hover:translate-x-1">
            {">"}
          </span>
        </div>
      </div>
    </Link>
  );
}
