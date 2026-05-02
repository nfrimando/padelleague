import Link from "next/link";
import { Player } from "@/lib/types";

type PlayerCardMatchCompactProps = {
  player: Player | null | undefined;
  playerHref: string | null;
  imageSrc: string;
  hasCustomImage: boolean;
  displayName: string;
  displayLabel: string;
  preMatchRating: number | null | undefined;
};

export default function PlayerCardMatchCompact({
  player,
  playerHref,
  imageSrc,
  hasCustomImage,
  displayName,
  displayLabel,
  preMatchRating,
}: PlayerCardMatchCompactProps) {
  const hasPreMatchRating =
    typeof preMatchRating === "number" && Number.isFinite(preMatchRating);

  const avatar = (
    <img
      src={imageSrc}
      alt={player?.name || "Player"}
      title={
        !hasCustomImage
          ? "Send url image to Nigel to update this pic!"
          : undefined
      }
      className="w-9 h-9 min-w-9 min-h-9 lg:w-12 lg:h-12 lg:min-w-12 lg:min-h-12 shrink-0 aspect-square rounded-full object-cover"
    />
  );

  return (
    <>
      {playerHref ? (
        <Link
          href={playerHref}
          className="inline-flex rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900"
        >
          {avatar}
        </Link>
      ) : (
        avatar
      )}

      <div className="text-center">
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
        {hasPreMatchRating && (
          <div className="mt-0.5 text-[10px] lg:text-[11px] font-medium text-sky-700 dark:text-sky-300">
            {preMatchRating.toFixed(2)}
          </div>
        )}
      </div>
    </>
  );
}
