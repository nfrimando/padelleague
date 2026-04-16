import { TeamWithPlayers } from "@/lib/types";
import PlayerCard from "./PlayerCard";

interface TeamCardProps {
  team: TeamWithPlayers | undefined;
  isWinner: boolean;
  highlightPlayerId?: string | number;
}

export default function TeamCard({
  team,
  isWinner,
  highlightPlayerId,
}: TeamCardProps) {
  const playerRatings = [
    team?.player_1?.pre_match_rating,
    team?.player_2?.pre_match_rating,
  ].filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value),
  );
  const averageTeamRating =
    playerRatings.length > 0
      ? playerRatings.reduce((sum, value) => sum + value, 0) /
        playerRatings.length
      : null;

  return (
    <div
      className={`flex-1 min-w-0 p-2 lg:p-3 rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900 ${
        isWinner ? "ring-2 ring-green-300 dark:ring-green-600" : ""
      }`}
    >
      <div className="flex items-center justify-between mb-1.5 lg:mb-2">
        <div className="text-xs lg:text-sm font-semibold text-slate-700 dark:text-slate-200">
          Team {team?.team_number || "?"}
          {averageTeamRating !== null ? (
            <span className="ml-1 text-[10px] lg:text-xs font-medium text-sky-700 dark:text-sky-300">
              {averageTeamRating.toFixed(2)}
            </span>
          ) : null}
        </div>
        {isWinner && (
          <span className="hidden sm:flex items-center gap-1 text-xs font-bold text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/40 px-2 py-0.5 rounded-full">
            🏆 Winner
          </span>
        )}
      </div>
      <div className="flex flex-col lg:flex-row items-center justify-center gap-1.5 lg:gap-2">
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
