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
      className={`flex items-center gap-4 flex-1 rounded-lg p-1 ${highlight ? "ring-2 ring-blue-400 dark:ring-blue-500 bg-blue-50 dark:bg-blue-900/30" : ""}`}
    >
      {playerHref ? (
        <Link href={playerHref}>
          <img
            src={imageSrc}
            alt={player?.name || "Player"}
            title={
              !hasCustomImage
                ? "Send url image to Nigel to update this pic!"
                : undefined
            }
            className={`${isLg ? "w-16 h-16" : "w-12 h-12"} rounded-full object-cover cursor-pointer`}
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
              className="hover:underline text-slate-900 dark:text-slate-100"
            >
              {player?.name || "N/A"}
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
