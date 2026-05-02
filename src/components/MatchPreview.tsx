"use client";

import { MatchWithTeams } from "@/lib/types";
import {
  formatMatchDate,
  formatMatchTime,
  matchTopLine,
  versusLabel,
} from "@/lib/utils";
import { TeamPlayerLine } from "@/components/TeamPlayerLine";

// ─── MatchPreviewCompact ──────────────────────────────────────────────────────
// Shown in the mobile agenda when a match row is expanded.

export function MatchPreviewCompact({ match }: { match: MatchWithTeams }) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100 shadow-xl p-2">
      <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
        Venue: {match.venue || "No venue"}
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Type: {match.type || "match"}
      </div>
      {match.status === "completed" && (
        <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
          {formatMatchDate(match.date_local)}{" "}
          {formatMatchTime(match.time_local)}
        </div>
      )}
    </div>
  );
}

// ─── MatchPreviewFull ─────────────────────────────────────────────────────────
// Shown as a hover tooltip in the desktop calendar cell.

export function MatchPreviewFull({ match }: { match: MatchWithTeams }) {
  const t1 = match.teams.find((t) => t.team_number === 1);
  const t2 = match.teams.find((t) => t.team_number === 2);

  const setScores =
    match.sets && match.sets.length > 0
      ? [...match.sets]
          .sort((a, b) => a.set_number - b.set_number)
          .map((s) => `${s.team_1_games}-${s.team_2_games}`)
          .join(", ")
      : "No set scores";

  const team1IsWinner =
    match.status === "completed" &&
    match.winner_team != null &&
    match.winner_team === 1;
  const team2IsWinner =
    match.status === "completed" &&
    match.winner_team != null &&
    match.winner_team === 2;

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100 shadow-xl p-2.5">
      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
        <span className="font-medium">
          {formatMatchDate(match.date_local)}{" "}
          {formatMatchTime(match.time_local)}
        </span>
        <span className="uppercase tracking-wide">
          {String(match.status || "")}
        </span>
      </div>
      <div className="mt-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
        {matchTopLine(match)}
      </div>
      {match.status === "completed" ? (
        <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
          Venue: {match.venue || "No venue"}
        </div>
      ) : (
        <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
          Sets: {setScores}
        </div>
      )}
      <div className="mt-1 text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {match.type || "match"}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <TeamPlayerLine
          team={t1}
          isWinner={team1IsWinner}
          variant="preview-block"
          side="left"
        />
        <div className="shrink-0 self-stretch px-1 text-center flex flex-col items-center justify-center">
          <div className="text-xs font-bold text-slate-600 dark:text-slate-300">
            {versusLabel(match)}
          </div>
          <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
            {t1?.sets_won ?? 0} - {t2?.sets_won ?? 0}
          </div>
        </div>
        <TeamPlayerLine
          team={t2}
          isWinner={team2IsWinner}
          variant="preview-block"
          side="right"
        />
      </div>
    </div>
  );
}
