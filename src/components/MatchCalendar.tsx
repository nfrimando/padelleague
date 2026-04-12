"use client";

import { useState } from "react";
import { MatchWithTeams } from "@/lib/types";

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

export default function MatchCalendar({
  className,
  matches,
  loading,
}: MatchCalendarProps) {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

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
      className={`relative rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden ${className ?? ""}`}
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

      {/* Weekday labels */}
      <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-700">
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
      <div className="grid grid-cols-7">
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
                    className="mt-0.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-1 py-0.5 text-center"
                    title={`${teamLabel(t1)} vs ${teamLabel(t2)}`}
                  >
                    <div className="text-[9px] font-semibold leading-tight text-slate-500 dark:text-slate-400 truncate uppercase tracking-wide">
                      {m.venue || ""}
                    </div>
                    <div className="text-[10px] font-medium leading-tight text-slate-800 dark:text-slate-100 truncate">
                      {teamLabel(t1)}
                    </div>
                    <div className="text-[9px] leading-tight text-slate-500 dark:text-slate-400">
                      vs
                    </div>
                    <div className="text-[10px] font-medium leading-tight text-slate-800 dark:text-slate-100 truncate">
                      {teamLabel(t2)}
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
