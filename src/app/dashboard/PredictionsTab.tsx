"use client";

import { useMemo, useState } from "react";
import { useUserPredictionHistory } from "@/lib/useUserPredictionHistory";
import { usePredictionCounts } from "@/lib/usePredictionCounts";
import { PredictMatchCard } from "@/app/predict/PredictMatchCard";
import Link from "next/link";

type PredictionFilter = "all" | "scheduled" | "completed";
const PAGE_SIZE = 6;

export default function PredictionsTab({ email }: { email: string }) {
  const { entries, stats, loading } = useUserPredictionHistory(email);

  const [filter, setFilter] = useState<PredictionFilter>("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  function changeFilter(next: PredictionFilter) {
    setFilter(next);
    setVisibleCount(PAGE_SIZE);
  }

  const filteredEntries = useMemo(() => {
    if (filter === "all") return entries;
    return entries.filter((e) => e.match.status === filter);
  }, [entries, filter]);

  const visibleEntries = useMemo(
    () => filteredEntries.slice(0, visibleCount),
    [filteredEntries, visibleCount],
  );

  const hasMore = visibleCount < filteredEntries.length;
  const remaining = filteredEntries.length - visibleCount;

  const matchIds = useMemo(() => visibleEntries.map((e) => e.match.match_id), [visibleEntries]);
  const { counts: crowdCounts } = usePredictionCounts(matchIds);

  return (
    <div className="space-y-4">
      {/* ── Stats row ── */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-[#0d1520] border border-[#687FA3]/10 sm:rounded-2xl p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-[#687FA3] mb-1 leading-tight">
            Total Points
          </p>
          {loading ? (
            <div className="h-7 w-12 bg-[#1a2540] rounded-lg animate-pulse mt-1" />
          ) : (
            <p className="text-2xl font-black text-white">
              {!stats.totalRewards || isNaN(stats.totalRewards)
                ? "—"
                : stats.totalRewards % 1 === 0
                  ? stats.totalRewards.toFixed(0)
                  : stats.totalRewards.toFixed(1)}
            </p>
          )}
        </div>
        <div className="bg-[#0d1520] border border-[#687FA3]/10 sm:rounded-2xl p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-[#687FA3] mb-1 leading-tight">
            Predictions Made
          </p>
          {loading ? (
            <div className="h-7 w-8 bg-[#1a2540] rounded-lg animate-pulse mt-1" />
          ) : (
            <p className="text-2xl font-black text-white">
              {!stats.totalPredictions || isNaN(stats.totalPredictions) ? "—" : stats.totalPredictions}
            </p>
          )}
        </div>
        <div className="bg-[#0d1520] border border-[#687FA3]/10 sm:rounded-2xl p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-[#687FA3] mb-1 leading-tight">
            W/ Results
          </p>
          {loading ? (
            <div className="h-7 w-8 bg-[#1a2540] rounded-lg animate-pulse mt-1" />
          ) : (
            <p className="text-2xl font-black text-white">
              {!stats.predictionsWithResults || isNaN(stats.predictionsWithResults) ? "—" : stats.predictionsWithResults}
            </p>
          )}
        </div>
        <div className="bg-[#0d1520] border border-[#687FA3]/10 sm:rounded-2xl p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-[#687FA3] mb-1 leading-tight">
            % Correct
          </p>
          {loading ? (
            <div className="h-7 w-10 bg-[#1a2540] rounded-lg animate-pulse mt-1" />
          ) : (
            <p className="text-2xl font-black text-white">
              {(() => {
                const pct = Math.round((stats.correctPredictions / stats.predictionsWithResults) * 100);
                return !stats.predictionsWithResults || isNaN(pct) ? "—" : `${pct}%`;
              })()}
            </p>
          )}
        </div>
      </div>

      {/* ── Filter pills ── */}
      {!loading && entries.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {(
            [
              { id: "all",       label: "All" },
              { id: "scheduled", label: "Upcoming" },
              { id: "completed", label: "Completed" },
            ] as { id: PredictionFilter; label: string }[]
          ).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => changeFilter(id)}
              className={[
                "px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest transition-colors cursor-pointer",
                filter === id
                  ? "bg-[#1a2540] text-white border border-[#687FA3]/30"
                  : "text-[#687FA3] hover:text-white border border-transparent",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* ── Cards ── */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-72 bg-[#162032] border border-[#687FA3]/10 rounded-2xl animate-pulse"
            />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="bg-[#162032] border border-[#687FA3]/10 rounded-2xl px-6 py-12 flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-[#687FA3]">No predictions yet.</p>
          <Link
            href="/predict"
            className="text-[11px] font-black uppercase tracking-widest text-[#00C8DC] hover:text-white transition-colors"
          >
            Make your first pick →
          </Link>
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="bg-[#162032] border border-[#687FA3]/10 rounded-2xl px-6 py-10 flex flex-col items-center gap-2 text-center">
          <p className="text-sm text-[#687FA3]">
            No {filter === "scheduled" ? "upcoming" : "completed"} predictions yet.
          </p>
          <button
            type="button"
            onClick={() => changeFilter("all")}
            className="text-[11px] font-black uppercase tracking-widest text-[#00C8DC] hover:text-white transition-colors cursor-pointer"
          >
            Show all →
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {visibleEntries.map((entry) => (
              <PredictMatchCard
                key={entry.prediction_id}
                match={entry.match}
                existingPick={entry.existingPick}
                crowdCounts={crowdCounts.get(entry.match.match_id) ?? null}
                canPredict={false}
                onPickRequest={() => {}}
                result={entry.result}
              />
            ))}
          </div>
          {hasMore && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
                className="px-4 py-2 rounded-full text-[11px] font-black uppercase tracking-widest text-[#687FA3] border border-[#687FA3]/20 hover:border-[#687FA3]/50 hover:text-white transition-colors cursor-pointer"
              >
                Show more ({remaining} remaining)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
