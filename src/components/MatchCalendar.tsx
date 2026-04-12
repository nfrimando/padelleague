"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MatchWithTeams } from "@/lib/types";
import { formatMatchDate, formatMatchTime } from "@/lib/utils";

const pad = (n: number) => String(n).padStart(2, "0");

interface MatchCalendarProps {
  className?: string;
  matches: MatchWithTeams[];
  loading?: boolean;
}

function playerLabel(p: { name: string; nickname: string } | null): string {
  return p?.nickname || p?.name || "TBD";
}

function teamLabel(team: MatchWithTeams["teams"][number] | undefined): string {
  if (!team) return "TBA";
  return `${playerLabel(team.player_1)} / ${playerLabel(team.player_2)}`;
}

function teamLineWithWinner(
  match: MatchWithTeams,
  team: MatchWithTeams["teams"][number] | undefined,
  className: string,
  withImages = false,
) {
  if (!team) return <span className={className}>TBA</span>;

  const isWinningTeam =
    match.status === "completed" &&
    match.winner_team != null &&
    team.team_number === match.winner_team;

  const firstHref = team.player_1?.player_id
    ? `/players?playerId=${encodeURIComponent(String(team.player_1.player_id))}`
    : null;
  const secondHref = team.player_2?.player_id
    ? `/players?playerId=${encodeURIComponent(String(team.player_2.player_id))}`
    : null;

  const firstName = playerLabel(team.player_1);
  const secondName = playerLabel(team.player_2);

  const renderPlayer = (
    href: string | null,
    player: MatchWithTeams["teams"][number]["player_1"],
    label: string,
  ) => {
    const content = withImages ? (
      <span className="inline-flex items-center gap-1 align-middle">
        {player?.image_link ? (
          <img
            src={player.image_link}
            alt={label}
            className="h-4 w-4 rounded-full object-cover border border-slate-200 dark:border-slate-700"
          />
        ) : (
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-[9px] font-semibold text-slate-500 dark:text-slate-400">
            {label.charAt(0).toUpperCase()}
          </span>
        )}
        <span>{label}</span>
      </span>
    ) : (
      <span>{label}</span>
    );

    if (!href) {
      return content;
    }

    return (
      <Link
        href={href}
        className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60 rounded"
      >
        {content}
      </Link>
    );
  };

  return (
    <div className={className}>
      {isWinningTeam ? "🏆 " : ""}
      {renderPlayer(firstHref, team.player_1, firstName)}
      <span> / </span>
      {renderPlayer(secondHref, team.player_2, secondName)}
    </div>
  );
}

function matchTopLine(match: MatchWithTeams): string {
  if (match.status === "completed" && match.sets && match.sets.length > 0) {
    return [...match.sets]
      .sort((a, b) => a.set_number - b.set_number)
      .map((s) => `${s.team_1_games}-${s.team_2_games}`)
      .join(", ");
  }

  const venue = match.venue || "No venue";
  const time = formatMatchTime(match.time_local);
  return time ? `${venue} · ${time}` : venue;
}

function versusLabel(match: MatchWithTeams): string {
  const type = String(match.type || "").toLowerCase();
  if (type === "kotc") return "👑";
  if (type === "duel") return "⚔️";
  return "vs";
}

function viewStartSunday(year: number, month: number): string {
  const firstDow = new Date(year, month, 1).getDay();
  const d = new Date(year, month, 1 - firstDow);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function viewEndSaturday(year: number, month: number): string {
  const firstDow = new Date(year, month, 1).getDay();
  const dim = new Date(year, month + 1, 0).getDate();
  const trailing = (firstDow + dim) % 7 === 0 ? 0 : 7 - ((firstDow + dim) % 7);
  const d = new Date(year, month, dim + trailing);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function dayLabel(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function statusBadgeClass(status: MatchWithTeams["status"]) {
  if (status === "scheduled") {
    return "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300";
  }
  if (status === "forfeit") {
    return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
  }
  if (status === "cancelled") {
    return "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300";
  }
  return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
}

function mobileTeamInline(
  team: MatchWithTeams["teams"][number] | undefined,
  side: "left" | "right",
  isWinner: boolean,
) {
  if (!team) {
    return (
      <span className="text-xs text-slate-500 dark:text-slate-400">TBA</span>
    );
  }

  const firstName = playerLabel(team.player_1);
  const secondName = playerLabel(team.player_2);
  const href = team.player_1?.player_id
    ? `/players?playerId=${encodeURIComponent(String(team.player_1.player_id))}`
    : null;

  const avatar = team.player_1?.image_link ? (
    <img
      src={team.player_1.image_link}
      alt={firstName}
      className="h-5 w-5 rounded-full object-cover border border-slate-200 dark:border-slate-700"
    />
  ) : (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
      {firstName.charAt(0).toUpperCase()}
    </span>
  );

  const label = `${firstName} / ${secondName}`;
  const labelNode = href ? (
    <Link
      href={href}
      className="truncate hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60 rounded"
    >
      {label}
    </Link>
  ) : (
    <span className="truncate">{label}</span>
  );

  return (
    <span
      className={`inline-flex min-w-0 items-center gap-1 text-xs font-medium ${
        isWinner
          ? "text-emerald-700 dark:text-emerald-300"
          : "text-slate-800 dark:text-slate-100"
      }`}
    >
      {side === "right" ? avatar : labelNode}
      {side === "right" ? labelNode : avatar}
    </span>
  );
}

function renderMatchPreview(match: MatchWithTeams, compact: boolean) {
  if (compact) {
    return (
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-2">
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

  const t1 = match.teams.find((t) => t.team_number === 1);
  const t2 = match.teams.find((t) => t.team_number === 2);
  const setScores =
    match.sets && match.sets.length > 0
      ? [...match.sets]
          .sort((a, b) => a.set_number - b.set_number)
          .map((s) => `${s.team_1_games}-${s.team_2_games}`)
          .join(", ")
      : "No set scores";

  const avatarSizeClass = "h-8 w-8";
  const avatarFallbackClass = "text-xs";

  const renderPlayerLine = (
    href: string | null,
    player: MatchWithTeams["teams"][number]["player_1"],
    label: string,
    avatarAfter: boolean,
  ) => {
    const avatar = player?.image_link ? (
      <img
        src={player.image_link}
        alt={label}
        className={`${avatarSizeClass} rounded-full object-cover border border-slate-200 dark:border-slate-700`}
      />
    ) : (
      <span
        className={`inline-flex ${avatarSizeClass} items-center justify-center rounded-full border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 ${avatarFallbackClass} font-semibold text-slate-500 dark:text-slate-400`}
      >
        {label.charAt(0).toUpperCase()}
      </span>
    );

    const content = (
      <span className="inline-flex items-center gap-1.5 align-middle">
        {avatarAfter ? <span className="truncate">{label}</span> : avatar}
        {avatarAfter ? avatar : <span className="truncate">{label}</span>}
      </span>
    );

    if (!href) return content;

    return (
      <Link
        href={href}
        className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60 rounded"
      >
        {content}
      </Link>
    );
  };

  const renderTeamBlock = (
    team: MatchWithTeams["teams"][number] | undefined,
    isWinner: boolean,
    side: "left" | "right",
  ) => {
    const isLeftSide = side === "left";
    const textAlignClass = isLeftSide ? "text-right" : "text-left";
    const rowJustifyClass = isLeftSide
      ? "flex justify-end"
      : "flex justify-start";

    if (!team) {
      return (
        <div className={`min-w-0 flex-1 ${textAlignClass}`}>
          <div className="text-xs text-slate-500 dark:text-slate-400">TBA</div>
        </div>
      );
    }

    const p1Name = playerLabel(team.player_1);
    const p2Name = playerLabel(team.player_2);
    const p1Href = team.player_1?.player_id
      ? `/players?playerId=${encodeURIComponent(String(team.player_1.player_id))}`
      : null;
    const p2Href = team.player_2?.player_id
      ? `/players?playerId=${encodeURIComponent(String(team.player_2.player_id))}`
      : null;

    return (
      <div
        className={`min-w-0 flex-1 rounded-md p-1 ${textAlignClass} ${
          isWinner
            ? "bg-emerald-50 dark:bg-emerald-900/25 border border-emerald-200 dark:border-emerald-700"
            : ""
        }`}
      >
        <div className="space-y-1">
          <div className={rowJustifyClass}>
            {renderPlayerLine(p1Href, team.player_1, p1Name, isLeftSide)}
          </div>
          <div className={rowJustifyClass}>
            {renderPlayerLine(p2Href, team.player_2, p2Name, isLeftSide)}
          </div>
        </div>
      </div>
    );
  };

  const team1IsWinner =
    match.status === "completed" &&
    match.winner_team != null &&
    match.winner_team === 1;
  const team2IsWinner =
    match.status === "completed" &&
    match.winner_team != null &&
    match.winner_team === 2;

  return (
    <div
      className={`rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl ${compact ? "p-2" : "p-2.5"}`}
    >
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
        {renderTeamBlock(t1, team1IsWinner, "left")}
        <div className="shrink-0 self-stretch px-1 text-center flex flex-col items-center justify-center">
          <div className="text-xs font-bold text-slate-600 dark:text-slate-300">
            {versusLabel(match)}
          </div>
          <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
            {t1?.sets_won ?? 0} - {t2?.sets_won ?? 0}
          </div>
        </div>
        {renderTeamBlock(t2, team2IsWinner, "right")}
      </div>
    </div>
  );
}

export default function MatchCalendar({
  className,
  matches,
  loading,
}: MatchCalendarProps) {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [mobilePreviewMatchId, setMobilePreviewMatchId] = useState<
    number | null
  >(null);
  const mobileAgendaRef = useRef<HTMLDivElement | null>(null);

  // Allowed range: 2 months ago → 1 month ahead
  const minDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const maxDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const atMin =
    viewYear === minDate.getFullYear() && viewMonth === minDate.getMonth();
  const atMax =
    viewYear === maxDate.getFullYear() && viewMonth === maxDate.getMonth();

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDayOfWeek = getFirstDayOfWeek(viewYear, viewMonth);
  const daysInPrevMonth = getDaysInMonth(
    viewMonth === 0 ? viewYear - 1 : viewYear,
    viewMonth === 0 ? 11 : viewMonth - 1,
  );

  const goToPrevMonth = () => {
    if (atMin) return;
    const newYear = viewMonth === 0 ? viewYear - 1 : viewYear;
    const newMonth = viewMonth === 0 ? 11 : viewMonth - 1;
    setViewYear(newYear);
    setViewMonth(newMonth);
  };

  const goToNextMonth = () => {
    if (atMax) return;
    const newYear = viewMonth === 11 ? viewYear + 1 : viewYear;
    const newMonth = viewMonth === 11 ? 0 : viewMonth + 1;
    setViewYear(newYear);
    setViewMonth(newMonth);
  };

  const goToToday = () => {
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
  };

  const prevYear = viewMonth === 0 ? viewYear - 1 : viewYear;
  const prevMonth = viewMonth === 0 ? 11 : viewMonth - 1;
  const nextYear = viewMonth === 11 ? viewYear + 1 : viewYear;
  const nextMonth = viewMonth === 11 ? 0 : viewMonth + 1;

  // Filter to only matches visible in the current calendar grid
  const calendarStart = viewStartSunday(viewYear, viewMonth);
  const calendarEnd = viewEndSaturday(viewYear, viewMonth);
  const calendarMatches = matches.filter(
    (m) =>
      m.date_local != null &&
      m.date_local >= calendarStart &&
      m.date_local <= calendarEnd,
  );
  const matchesByDate = (dateStr: string) =>
    calendarMatches.filter((m) => m.date_local === dateStr);

  // Build calendar grid cells
  const leadingCells = Array.from({ length: firstDayOfWeek }, (_, i) => {
    const day = daysInPrevMonth - firstDayOfWeek + 1 + i;
    return {
      day,
      type: "prev" as const,
      dateStr: `${prevYear}-${pad(prevMonth + 1)}-${pad(day)}`,
    };
  });

  const currentCells = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    return {
      day,
      type: "current" as const,
      dateStr: `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`,
    };
  });

  const mobileDates = currentCells.map((c) => c.dateStr);
  const todayDateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  useEffect(() => {
    if (typeof window === "undefined" || window.innerWidth >= 640) {
      return;
    }

    const isCurrentMonthView =
      viewYear === now.getFullYear() && viewMonth === now.getMonth();

    if (!isCurrentMonthView) {
      return;
    }

    const target = document.getElementById(`mobile-day-${todayDateStr}`);
    target?.scrollIntoView({ block: "center", behavior: "auto" });
  }, [todayDateStr, viewMonth, viewYear]);

  const totalCells = leadingCells.length + currentCells.length;
  const trailingCount = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  const trailingCells = Array.from({ length: trailingCount }, (_, i) => {
    const day = i + 1;
    return {
      day,
      type: "next" as const,
      dateStr: `${nextYear}-${pad(nextMonth + 1)}-${pad(day)}`,
    };
  });

  const allCells = [...leadingCells, ...currentCells, ...trailingCells];

  const isToday = (day: number, type: string) =>
    type === "current" &&
    day === now.getDate() &&
    viewMonth === now.getMonth() &&
    viewYear === now.getFullYear();

  return (
    <div
      className={`relative rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-visible ${className ?? ""}`}
    >
      {loading && (
        <div className="absolute inset-0 z-10 bg-white/60 dark:bg-slate-900/60 backdrop-blur-[1px] flex items-start justify-center pt-6">
          <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 shadow-sm">
            Loading matches…
          </div>
        </div>
      )}

      {/* Calendar Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {MONTH_NAMES[viewMonth]} {viewYear}
          </h2>
          <button
            onClick={goToToday}
            className="text-xs font-medium text-sky-700 dark:text-sky-300 border border-sky-300 dark:border-sky-700 px-2 py-0.5 rounded hover:bg-sky-50 dark:hover:bg-sky-900/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60"
          >
            Today
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={goToPrevMonth}
            aria-label="Previous month"
            disabled={atMin}
            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <button
            onClick={goToNextMonth}
            aria-label="Next month"
            disabled={atMax}
            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile agenda */}
      <div className="sm:hidden border-t border-slate-200 dark:border-slate-700">
        <div ref={mobileAgendaRef} className="max-h-[65vh] overflow-y-auto">
          {mobileDates.map((dateStr) => {
            const dayMatches = matchesByDate(dateStr);
            const [y, m, d] = dateStr.split("-").map(Number);
            const isCurrentToday =
              y === now.getFullYear() &&
              m - 1 === now.getMonth() &&
              d === now.getDate();

            return (
              <div
                key={dateStr}
                id={`mobile-day-${dateStr}`}
                className="border-b border-slate-100 dark:border-slate-800"
              >
                <div className="flex items-center justify-between px-3 py-2.5 bg-slate-50/70 dark:bg-slate-950/40">
                  <div className="flex items-center gap-2">
                    {isCurrentToday && (
                      <span className="inline-flex h-2 w-2 rounded-full bg-sky-500" />
                    )}
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {dayLabel(dateStr)}
                    </span>
                  </div>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {dayMatches.length} match
                    {dayMatches.length === 1 ? "" : "es"}
                  </span>
                </div>

                {dayMatches.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500">
                    No matches
                  </div>
                ) : (
                  <div className="px-2 py-2 space-y-2">
                    {dayMatches.map((match) => {
                      const team1 = match.teams.find(
                        (t) => t.team_number === 1,
                      );
                      const team2 = match.teams.find(
                        (t) => t.team_number === 2,
                      );
                      const team1IsWinner =
                        match.status === "completed" && match.winner_team === 1;
                      const team2IsWinner =
                        match.status === "completed" && match.winner_team === 2;

                      return (
                        <div key={match.match_id}>
                          <button
                            type="button"
                            onClick={() =>
                              setMobilePreviewMatchId((prev) =>
                                prev === match.match_id ? null : match.match_id,
                              )
                            }
                            className="relative w-full text-left rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                {matchTopLine(match)}
                              </div>
                              <span
                                className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${statusBadgeClass(match.status)}`}
                              >
                                {match.status}
                              </span>
                            </div>

                            <div className="mt-1 flex items-center gap-1.5">
                              <span className="w-4 text-center text-sm leading-none">
                                {team1IsWinner ? "🏆" : ""}
                              </span>
                              <div className="min-w-0 flex-1 text-right">
                                {mobileTeamInline(team1, "left", team1IsWinner)}
                              </div>
                              <div className="shrink-0 text-xs font-bold text-slate-600 dark:text-slate-300">
                                {versusLabel(match)}
                              </div>
                              <div className="min-w-0 flex-1 text-left">
                                {mobileTeamInline(
                                  team2,
                                  "right",
                                  team2IsWinner,
                                )}
                              </div>
                              <span className="w-4 text-center text-sm leading-none">
                                {team2IsWinner ? "🏆" : ""}
                              </span>
                            </div>
                            <span className="absolute bottom-1 right-2 text-[10px] text-slate-400 dark:text-slate-500">
                              ▾
                            </span>
                          </button>
                          {mobilePreviewMatchId === match.match_id && (
                            <div className="mt-1">
                              {renderMatchPreview(match, true)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Weekday labels */}
      <div className="hidden sm:grid grid-cols-7 border-b border-slate-200 dark:border-slate-700">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="hidden sm:grid grid-cols-7">
        {allCells.map((cell, idx) => {
          const today_ = isToday(cell.day, cell.type);
          const isCurrent = cell.type === "current";
          const isLastRow = idx >= allCells.length - 7;
          const isLastCol = (idx + 1) % 7 === 0;
          const dayMatches = isCurrent ? matchesByDate(cell.dateStr) : [];

          return (
            <div
              key={idx}
              className={[
                "relative min-h-[72px] p-1.5 flex flex-col",
                !isLastRow
                  ? "border-b border-slate-100 dark:border-slate-800"
                  : "",
                !isLastCol
                  ? "border-r border-slate-100 dark:border-slate-800"
                  : "",
                isCurrent
                  ? "bg-white dark:bg-slate-900"
                  : "bg-slate-50/60 dark:bg-slate-950/40",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <span
                className={[
                  "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium mb-1 self-end",
                  today_
                    ? "bg-sky-500 text-white"
                    : isCurrent
                      ? "text-slate-800 dark:text-slate-200"
                      : "text-slate-400 dark:text-slate-600",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {cell.day}
              </span>
              {dayMatches.map((m, i) => {
                const t1 = m.teams.find((t) => t.team_number === 1);
                const t2 = m.teams.find((t) => t.team_number === 2);
                return (
                  <div
                    key={i}
                    className="group relative mt-0.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-1 py-0.5 text-center"
                    title={`${teamLabel(t1)} vs ${teamLabel(t2)}`}
                  >
                    <div className="text-[9px] font-semibold leading-tight text-slate-500 dark:text-slate-400 truncate uppercase tracking-wide">
                      {matchTopLine(m)}
                    </div>
                    {teamLineWithWinner(
                      m,
                      t1,
                      "text-[10px] font-medium leading-tight text-slate-800 dark:text-slate-100 truncate",
                    )}
                    <div className="text-[9px] leading-tight text-slate-500 dark:text-slate-400">
                      {versusLabel(m)}
                    </div>
                    {teamLineWithWinner(
                      m,
                      t2,
                      "text-[10px] font-medium leading-tight text-slate-800 dark:text-slate-100 truncate",
                    )}

                    <div className="pointer-events-none hidden sm:block absolute z-30 left-1/2 -translate-x-1/2 top-full mt-2 w-72 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                      {renderMatchPreview(m, false)}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
