import { formatMatchDate, formatMatchTime } from "@/lib/utils";
import { MatchWithTeams } from "@/lib/types";
import TeamCard from "./TeamCard";

interface MatchCardProps {
  match: MatchWithTeams;
}

export default function MatchCard({ match }: MatchCardProps) {
  const team1 = match.teams.find((t) => t.team_number === 1);
  const team2 = match.teams.find((t) => t.team_number === 2);

  return (
    <div
      key={match.match_id}
      className="border rounded-lg shadow p-4 bg-white dark:bg-gray-800"
    >
      <div className="flex justify-between mb-2 text-sm text-gray-500 dark:text-gray-400">
        <div>
          {formatMatchDate(match.date_local)}{" "}
          {formatMatchTime(match.time_local)}
        </div>
        <div>{match.venue || "N/A"}</div>
      </div>

      <div className="mb-2 font-semibold">
        {(match.type || "Match").charAt(0).toUpperCase() +
          (match.type || "Match").slice(1)}
      </div>

      <div className="flex flex-col lg:flex-row items-stretch justify-center gap-4">
        {/* Team 1 */}
        <TeamCard team={team1} isWinner={match.winner_team === 1} />

        <div className="flex flex-col items-center justify-center px-3">
          <div className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">
            VS
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-400">
            {team1?.sets_won ?? 0} - {team2?.sets_won ?? 0}
          </div>
        </div>

        {/* Team 2 */}
        <TeamCard team={team2} isWinner={match.winner_team === 2} />
      </div>

      {match.is_forfeit && (
        <div className="mt-2 text-red-500 font-semibold">Forfeit Match</div>
      )}
    </div>
  );
}
