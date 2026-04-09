"use client";

import { useState } from "react";
import { formatMatchDate, formatMatchTime } from "@/lib/utils";
import { MatchWithTeams } from "@/lib/types";
import TeamCard from "./TeamCard";

interface MatchCardProps {
  match: MatchWithTeams;
  highlightPlayerId?: string;
}

export default function MatchCard({
  match,
  highlightPlayerId,
}: MatchCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const team1 = match.teams.find((t) => t.team_number === 1);
  const team2 = match.teams.find((t) => t.team_number === 2);

  return (
    <div
      key={match.match_id}
      className="border rounded-lg shadow p-4 bg-white dark:bg-gray-800"
    >
      <div className="flex justify-between items-center mb-2">
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {formatMatchDate(match.date_local)}{" "}
          {formatMatchTime(match.time_local)}
        </div>
        <div className="flex items-center gap-2">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {match.venue || "N/A"}
          </div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
            aria-label={
              isExpanded ? "Collapse match details" : "Expand match details"
            }
          >
            {isExpanded ? (
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 15l7-7 7 7"
                />
              </svg>
            ) : (
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            )}
          </button>
        </div>
      </div>

      <div className="mb-2 flex items-center gap-2">
        <span className="font-semibold">
          {(match.type || "Match").charAt(0).toUpperCase() +
            (match.type || "Match").slice(1)}
        </span>
        {match.is_forfeit && (
          <span className="text-xs font-bold text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/40 px-2 py-0.5 rounded-full">
            Forfeit
          </span>
        )}
      </div>

      {isExpanded && (
        <>
          <div className="flex flex-col lg:flex-row items-stretch justify-center gap-4">
            {/* Team 1 */}
            <TeamCard
              team={team1}
              isWinner={match.winner_team === 1}
              highlightPlayerId={highlightPlayerId}
            />

            <div className="flex flex-col items-center justify-center px-3">
              <div className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">
                VS
              </div>
              <div className="text-lg font-bold text-slate-700 dark:text-slate-300">
                {team1?.sets_won ?? 0} - {team2?.sets_won ?? 0}
              </div>
            </div>

            {/* Team 2 */}
            <TeamCard
              team={team2}
              isWinner={match.winner_team === 2}
              highlightPlayerId={highlightPlayerId}
            />
          </div>

          {match.is_forfeit && (
            <div className="mt-3 text-sm text-red-600 dark:text-red-400">
              This match was decided by forfeit.
            </div>
          )}
        </>
      )}
    </div>
  );
}
