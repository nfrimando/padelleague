import { TeamWithPlayers } from "@/lib/types";
import PlayerCard from "./PlayerCard";

interface TeamCardProps {
  team: TeamWithPlayers | undefined;
  isWinner: boolean;
}

export default function TeamCard({ team, isWinner }: TeamCardProps) {
  return (
    <div
      className={`flex-1 min-w-[220px] p-4 rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900 ${
        isWinner ? "ring-2 ring-green-300 dark:ring-green-600" : ""
      }`}
    >
      <div className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">
        Team {team?.team_number || "?"}
      </div>
      <div className="flex flex-col md:flex-row gap-3">
        {[team?.player_1, team?.player_2].map((p, i) => (
          <PlayerCard key={i} player={p} />
        ))}
      </div>
    </div>
  );
}
