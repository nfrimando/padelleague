import { Player, TeamWithPlayers } from "@/lib/types";

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
          <div key={i} className="flex items-center gap-3 flex-1">
            <img
              src={p?.image_link || "/default-avatar.webp"}
              alt={p?.name || "Player"}
              className="w-12 h-12 rounded-full object-cover"
            />
            <div>
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                {p?.name || "N/A"}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {p?.nickname || "Player"}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
