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
  return (
    <div
      className={`flex items-center gap-4 flex-1 rounded-lg p-1 ${highlight ? "ring-2 ring-blue-400 dark:ring-blue-500 bg-blue-50 dark:bg-blue-900/30" : ""}`}
    >
      <img
        src={
          player?.image_link && player.image_link !== "null"
            ? player.image_link
            : "/default-avatar.webp"
        }
        alt={player?.name || "Player"}
        className={`${isLg ? "w-16 h-16" : "w-12 h-12"} rounded-full object-cover`}
      />
      <div>
        <div
          className={`${isLg ? "text-xl font-semibold" : "text-sm font-medium"} text-slate-900 dark:text-slate-100`}
        >
          {player?.name || "N/A"}
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
