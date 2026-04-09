import { Player } from "@/lib/types";

interface PlayerCardProps {
  player: Player | null | undefined;
}

export default function PlayerCard({ player }: PlayerCardProps) {
  return (
    <div className="flex items-center gap-3 flex-1">
      <img
        src={player?.image_link || "/default-avatar.webp"}
        alt={player?.name || "Player"}
        className="w-12 h-12 rounded-full object-cover"
      />
      <div>
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
          {player?.name || "N/A"}
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400">
          {player?.nickname || "Player"}
        </div>
      </div>
    </div>
  );
}
