import { formatMatchDate, formatMatchTime } from "@/lib/utils";
import { Player, TeamWithPlayers, MatchWithTeams } from "@/lib/types";

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

      <div className="flex flex-col md:flex-row items-stretch justify-center gap-4">
        {/* Team 1 */}
        <div
          className={`flex-1 min-w-[220px] p-4 rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900 ${
            match.winner_team === 1
              ? "ring-2 ring-green-300 dark:ring-green-600"
              : ""
          }`}
        >
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">
            Team 1
          </div>
          <div className="grid gap-3">
            {[team1?.player_1, team1?.player_2].map((p, i) => (
              <div key={i} className="flex items-center gap-3">
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

        <div className="flex flex-col items-center justify-center px-3">
          <div className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">
            VS
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-400">
            {team1?.sets_won ?? 0} - {team2?.sets_won ?? 0}
          </div>
        </div>

        {/* Team 2 */}
        <div
          className={`flex-1 min-w-[220px] p-4 rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900 ${
            match.winner_team === 2
              ? "ring-2 ring-green-300 dark:ring-green-600"
              : ""
          }`}
        >
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">
            Team 2
          </div>
          <div className="grid gap-3">
            {[team2?.player_1, team2?.player_2].map((p, i) => (
              <div key={i} className="flex items-center gap-3">
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
      </div>

      {match.is_forfeit && (
        <div className="mt-2 text-red-500 font-semibold">Forfeit Match</div>
      )}
    </div>
  );
}
