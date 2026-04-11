import { TeamWithPlayers } from "@/lib/types";
import PlayerCard from "./PlayerCard";

interface TeamCardProps {
  team: TeamWithPlayers | undefined;
  isWinner: boolean;
  highlightPlayerId?: string;
}

export default function TeamCard({
  team,
  isWinner,
  highlightPlayerId,
}: TeamCardProps) {
  return (
    <div
      className={`flex-1 min-w-[180px] p-3 rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900 ${
        isWinner ? "ring-2 ring-green-300 dark:ring-green-600" : ""
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          Team {team?.team_number || "?"}
        </div>
        {isWinner && (
          <span className="flex items-center gap-1 text-xs font-bold text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/40 px-2 py-0.5 rounded-full">
            🏆 Winner
          </span>
        )}
      </div>
      <div className="flex flex-col lg:flex-row items-center justify-center gap-2">
        {[team?.player_1, team?.player_2].map((p, i) => (
          <PlayerCard
            key={i}
            player={p}
            layout="matchCompact"
            highlight={
              !!highlightPlayerId && p?.player_id === highlightPlayerId
            }
          />
        ))}
      </div>
    </div>
  );
}
