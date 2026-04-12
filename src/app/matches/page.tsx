"use client";

import BackToHome from "@/components/BackToHome";
import MatchCard from "@/components/MatchCard";
import { useMatches } from "@/lib/useMatches";

export default function MatchesPage() {
  const { matches, loading, error } = useMatches();
  const latestMatches = matches.slice(0, 50);

  return (
    <>
      <BackToHome />
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Latest 50 Matches
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Showing the most recent 50 matches by season, date, time, and match
            id.
          </p>
        </div>

        {loading ? (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 text-sm text-slate-600 dark:text-slate-300">
            Loading matches...
          </div>
        ) : error ? (
          <div className="rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 p-6 text-sm text-rose-700 dark:text-rose-300">
            {error}
          </div>
        ) : latestMatches.length === 0 ? (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 text-sm text-slate-600 dark:text-slate-300">
            No matches found.
          </div>
        ) : (
          <div className="space-y-4">
            {latestMatches.map((match) => (
              <MatchCard key={match.match_id} match={match} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
