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
  const statusLabel = String(match.status || "completed").toUpperCase();
  const statusBadgeClass =
    match.status === "scheduled"
      ? "text-sky-700 dark:text-sky-300 bg-sky-100 dark:bg-sky-900/40"
      : match.status === "forfeit"
        ? "text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/40"
        : match.status === "cancelled"
          ? "text-slate-700 dark:text-slate-300 bg-slate-200 dark:bg-slate-700"
          : "text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/40";
  const statusCardClass =
    match.status === "scheduled"
      ? "border-sky-300 dark:border-sky-700 ring-1 ring-sky-200 dark:ring-sky-900/60"
      : match.status === "forfeit"
        ? "border-red-300 dark:border-red-700 ring-1 ring-red-200 dark:ring-red-900/60"
        : match.status === "cancelled"
          ? "border-slate-300 dark:border-slate-600 ring-1 ring-slate-200 dark:ring-slate-800"
          : "border-emerald-300 dark:border-emerald-700 ring-1 ring-emerald-200 dark:ring-emerald-900/60";
  const team1 = match.teams.find((t) => t.team_number === 1);
  const team2 = match.teams.find((t) => t.team_number === 2);

  return (
    <div
      key={match.match_id}
      className={`border rounded-lg shadow p-4 bg-white dark:bg-gray-800 ${statusCardClass}`}
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
        {match.season_id !== null && (
          <span className="text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 rounded-full">
            Season {match.season_id}
          </span>
        )}
        <span className="text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">
          Match #{match.match_id}
        </span>
        <span
          className={`text-xs font-bold px-2 py-0.5 rounded-full ${statusBadgeClass}`}
        >
          {statusLabel}
        </span>
      </div>

      {isExpanded && (
        <>
          <div className="flex items-stretch justify-center gap-1.5 lg:gap-3 pb-1">
            {/* Team 1 */}
            <TeamCard
              team={team1}
              isWinner={match.winner_team === 1}
              highlightPlayerId={highlightPlayerId}
            />

            <div className="flex flex-col items-center justify-center px-1 lg:px-2 min-w-[72px] lg:min-w-[124px]">
              <div className="text-xs lg:text-base font-bold text-blue-600 dark:text-blue-400 mb-1 px-1.5 lg:px-2.5 py-0.5 lg:py-1 bg-blue-50 dark:bg-blue-900/20 rounded">
                {team1?.sets_won ?? 0} - {team2?.sets_won ?? 0}
              </div>
              <div className="text-[10px] lg:text-[11px] font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300 mb-1">
                VS
              </div>
              {/* Game Scores */}
              {match.sets && match.sets.length > 0 && (
                <div className="text-[10px] lg:text-[11px] text-center text-slate-600 dark:text-slate-400 leading-tight">
                  {match.sets
                    .map((set) => `${set.team_1_games}-${set.team_2_games}`)
                    .join(", ")}
                </div>
              )}
            </div>

            {/* Team 2 */}
            <TeamCard
              team={team2}
              isWinner={match.winner_team === 2}
              highlightPlayerId={highlightPlayerId}
            />
          </div>
        </>
      )}
    </div>
  );
}
