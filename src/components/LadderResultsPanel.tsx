"use client";

import { useState } from "react";
import PlayerCard from "@/components/PlayerCard";
import { tierIconSrc, StarBadge } from "@/components/LadderTierBadge";
import type { LadderCompletedCycle, LadderCycleResult } from "@/lib/ladderData";

// Matches RankBadge in src/components/LeaderboardView.tsx so a podium finish reads the same
// everywhere on the site.
function RankNumber({ rank }: { rank: number }) {
  const className =
    rank === 1
      ? "text-yellow-400"
      : rank === 2
        ? "text-slate-300"
        : rank === 3
          ? "text-amber-600"
          : "text-[#687FA3]";
  return (
    <span className={`w-7 shrink-0 text-right font-black tabular-nums ${className}`}>
      {rank}
    </span>
  );
}

function formatCycleDates(cycle: LadderCompletedCycle): string | null {
  const format = (value: string | null) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? null
      : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };

  const start = format(cycle.startsAt);
  const end = format(cycle.endsAt);
  if (start && end) return `${start} – ${end}`;
  return end ? `Ended ${end}` : start ? `Started ${start}` : null;
}

// Start → finish within the cycle, by tier. null when the snapshot has no starting tier.
function ClimbLabel({ result }: { result: LadderCycleResult }) {
  if (result.startTierName === null || result.startTierRank === null) return null;

  const climbed = result.tierRank - result.startTierRank;
  const change =
    climbed > 0 ? (
      <span className="text-emerald-400/80">▲{climbed}</span>
    ) : climbed < 0 ? (
      <span className="text-rose-400/80">▼{-climbed}</span>
    ) : (
      <span>held</span>
    );

  return (
    <p className="pl-1 mt-0.5 flex items-center gap-1 text-[10px] text-[#687FA3]/60">
      <span>Started</span>
      <img
        src={tierIconSrc(result.startTierName)}
        alt=""
        className="w-3.5 h-3.5 object-contain"
      />
      <span>{result.startTierName}</span>
      <span aria-hidden>→</span>
      <span>{result.tierName}</span>
      <span>·</span>
      {change}
    </p>
  );
}

function ResultRow({ result }: { result: LadderCycleResult }) {
  const record =
    result.matchesPlayed > 0
      ? `${result.matchesPlayed} ${result.matchesPlayed === 1 ? "match" : "matches"} · ${result.wins}W-${result.losses}L`
      : "No ladder matches";

  return (
    <div className="flex items-center gap-2 rounded-lg border border-[#162032] bg-[#0f1729] px-3 py-2">
      {result.overallRank !== null ? (
        <RankNumber rank={result.overallRank} />
      ) : (
        <span className="w-7 shrink-0 text-right text-[#687FA3]/40">—</span>
      )}

      <img
        src={tierIconSrc(result.tierName)}
        alt={result.tierName}
        className="w-6 h-6 object-contain shrink-0"
      />

      <div className="min-w-0 flex-1">
        <PlayerCard
          player={{
            player_id: result.player_id,
            name: result.name,
            nickname: result.nickname,
            image_link: result.image_link,
          }}
          size="sm"
          showLatestRating={false}
          openInNewTab
        />
        <p className="pl-1 mt-0.5 text-[10px] text-[#687FA3]/60">
          {result.tierName}
          {result.tierPosition !== null ? ` #${result.tierPosition}` : ""} · {record}
        </p>
        <ClimbLabel result={result} />
      </div>

      <StarBadge stars={result.stars} />
    </div>
  );
}

function CycleSection({
  cycle,
  results,
}: {
  cycle: LadderCompletedCycle;
  results: LadderCycleResult[];
}) {
  const [showUnranked, setShowUnranked] = useState(false);

  const ranked = results.filter((r) => r.badgeEligible);
  const unranked = results.filter((r) => !r.badgeEligible);
  const dates = formatCycleDates(cycle);

  return (
    <section className="mb-10">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-lg font-black uppercase tracking-tight text-white">
          {cycle.label}
        </h2>
        <span className="text-[10px] text-[#687FA3]/60">
          {dates ? `${dates} · ` : ""}#{cycle.id}
        </span>
      </div>

      {ranked.length === 0 ? (
        <p className="text-sm text-[#687FA3]">
          No one played enough ladder matches to place in this cycle.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {ranked.map((result) => (
            <ResultRow key={result.player_id} result={result} />
          ))}
        </div>
      )}

      {unranked.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowUnranked((prev) => !prev)}
            className="text-[10px] font-black uppercase tracking-widest text-[#687FA3]/60 hover:text-white transition-colors cursor-pointer"
          >
            {showUnranked ? "Hide" : "Show"} {unranked.length} player
            {unranked.length === 1 ? "" : "s"} with fewer than 3 matches
          </button>

          {showUnranked && (
            <div className="mt-2 flex flex-col gap-2 opacity-70">
              {unranked.map((result) => (
                <ResultRow key={result.player_id} result={result} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// Final standings for every closed cycle — the permanent record written when an admin closes a
// cycle. Ranks and badges cover players with at least 3 completed ladder matches; everyone else is
// recorded but tucked behind a disclosure.
export default function LadderResultsPanel({
  completedCycles,
  resultsByCycle,
}: {
  completedCycles: LadderCompletedCycle[];
  resultsByCycle: Record<number, LadderCycleResult[]>;
}) {
  if (completedCycles.length === 0) {
    return (
      <p className="text-sm text-[#687FA3]">
        No cycle has finished yet. Final tiers and stars are recorded here when a cycle closes.
      </p>
    );
  }

  return (
    <div>
      {completedCycles.map((cycle) => (
        <CycleSection
          key={cycle.id}
          cycle={cycle}
          results={resultsByCycle[cycle.id] ?? []}
        />
      ))}
    </div>
  );
}
