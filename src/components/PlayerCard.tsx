import Link from "next/link";
import { Player } from "@/lib/types";

interface PlayerCardProps {
  player: Player | null | undefined;
  size?: "sm" | "lg";
  highlight?: boolean;
}

export default function PlayerCard({
  player,
  size = "sm",
  highlight = false,
}: PlayerCardProps) {
  const isLg = size === "lg";
  const hasCustomImage = !!(player?.image_link && player.image_link !== "null");
  const imageSrc = hasCustomImage
    ? (player?.image_link as string)
    : "/default-avatar.webp";
  const playerHref = player?.player_id
    ? `/players?playerId=${encodeURIComponent(String(player.player_id))}`
    : null;

  return (
    <div
      className={`group/player flex items-center gap-4 flex-1 rounded-lg p-1 ${highlight ? "ring-2 ring-blue-400 dark:ring-blue-500 bg-blue-50 dark:bg-blue-900/30" : ""}`}
    >
      {playerHref ? (
        <Link
          href={playerHref}
          className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900"
        >
          <img
            src={imageSrc}
            alt={player?.name || "Player"}
            title={
              !hasCustomImage
                ? "Send url image to Nigel to update this pic!"
                : undefined
            }
            className={`${isLg ? "w-16 h-16" : "w-12 h-12"} rounded-full object-cover cursor-pointer transition-transform duration-150 group-hover/player:scale-[1.02]`}
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
          className={`${isLg ? "w-16 h-16" : "w-12 h-12"} rounded-full object-cover`}
        />
      )}
      <div>
        <div
          className={`${isLg ? "text-xl font-semibold" : "text-sm font-medium"} text-slate-900 dark:text-slate-100`}
        >
          {playerHref ? (
            <Link
              href={playerHref}
              className="inline-flex items-center gap-1 text-slate-900 dark:text-slate-100 decoration-transparent underline-offset-2 transition-colors duration-150 hover:text-sky-700 dark:hover:text-sky-300 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/70 focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900"
            >
              {player?.name || "N/A"}
              <span className="text-sky-600/80 dark:text-sky-300/80 opacity-0 translate-x-[-2px] transition-all duration-150 group-hover/player:opacity-100 group-hover/player:translate-x-0">
                {"->"}
              </span>
            </Link>
          ) : (
            player?.name || "N/A"
          )}
        </div>
        <div
          className={`${isLg ? "text-sm" : "text-xs"} text-slate-500 dark:text-slate-400`}
        >
          {player?.nickname || "—"}
        </div>
      </div>
    </div>
  );
}
