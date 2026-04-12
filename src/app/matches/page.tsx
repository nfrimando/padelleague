"use client";

import { useState } from "react";
import BackToHome from "@/components/BackToHome";
import MatchCalendar from "@/components/MatchCalendar";
import MatchCard from "@/components/MatchCard";
import { useMatches } from "@/lib/useMatches";

export default function MatchesPage() {
  const [matchLimit, setMatchLimit] = useState(10);
  const { matches, loading, error } = useMatches(matchLimit);

  return (
    <>
      <BackToHome />
      <div className="max-w-6xl mx-auto px-4 py-8">
        <MatchCalendar className="mb-10" matches={matches} loading={loading} />

        <div className="mb-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Latest Matches
              </h1>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                Showing the latest {matchLimit} matches ordered by date, time,
                season, and match id.
              </p>
            </div>
            <div className="w-full sm:w-auto">
              <label
                htmlFor="matches-limit"
                className="block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300"
              >
                Show
              </label>
              <select
                id="matches-limit"
                value={matchLimit}
                onChange={(event) => setMatchLimit(Number(event.target.value))}
                className="mt-1 w-full sm:w-28 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500/60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>
        </div>

        {error ? (
          <div className="rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 p-6 text-sm text-rose-700 dark:text-rose-300">
            {error}
          </div>
        ) : (
          <div className="relative min-h-[320px]">
            {matches.length === 0 ? (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 text-sm text-slate-600 dark:text-slate-300">
                No matches found.
              </div>
            ) : (
              <div className="space-y-4">
                {matches.map((match) => (
                  <MatchCard key={match.match_id} match={match} />
                ))}
              </div>
            )}

            {loading && (
              <div className="absolute inset-0 rounded-lg bg-white/70 dark:bg-slate-950/70 backdrop-blur-[1px] flex items-start justify-center pt-6">
                <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 shadow-sm">
                  Loading matches...
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
