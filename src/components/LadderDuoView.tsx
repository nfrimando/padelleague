"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PlayerCard from "@/components/PlayerCard";
import LadderDuoPanel from "@/components/LadderDuoPanel";
import { tierIconSrc, StarBadge, CushionBadge } from "@/components/LadderTierBadge";
import { describeLadderEvent } from "@/lib/ladderEventDisplay";
import type { LadderCompletedCycle } from "@/lib/ladderData";
import type {
  LadderDuoCycleResult,
  LadderDuoEntry,
  LadderDuoPageData,
  LadderDuoPendingMatch,
  LadderDuoPlayer,
} from "@/lib/ladderDuoData";

function DuoPlayers({ players }: { players: [LadderDuoPlayer, LadderDuoPlayer] }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 min-w-0">
      {players.map((p) => (
        <PlayerCard key={p.player_id} player={p} size="sm" showLatestRating={false} openInNewTab />
      ))}
    </div>
  );
}

function DuoMatchCard({ match, tierName }: { match: LadderDuoPendingMatch; tierName: string }) {
  return (
    <div className="shrink-0 w-60 flex flex-col gap-1.5 rounded-lg border border-[#162032] bg-[#0f1729] px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[#687FA3]">
          <img src={tierIconSrc(tierName)} alt="" className="w-3.5 h-3.5 object-contain shrink-0" />
          {tierName}
        </span>
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
            match.status === "scheduled" ? "bg-blue-500/10 text-blue-300" : "bg-amber-500/10 text-amber-300"
          }`}
        >
          {match.status}
        </span>
      </div>
      <p className="text-sm text-[#e2e8f0] leading-snug break-words">
        {match.team1.label}
        <span className="text-[#687FA3]"> vs </span>
        {match.team2.label}
      </p>
      <p className="text-[10px] text-[#687FA3]/70">
        {match.status === "scheduled" ? (
          <>
            {match.dateLocal ?? "date TBD"}
            {match.timeLocal ? ` at ${match.timeLocal}` : ""}
            {match.venue ? ` · ${match.venue}` : ""}
          </>
        ) : (
          "Not yet scheduled"
        )}
      </p>
    </div>
  );
}

function DuoRow({ duo, showCushion, tiers }: { duo: LadderDuoEntry; showCushion: boolean; tiers: LadderDuoPageData["tiers"] }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-[#162032] bg-[#0f1729] px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="font-bold text-white truncate min-w-0">{duo.label}</p>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-semibold text-[#687FA3]/60 tabular-nums">{duo.winsThisCycle}W</span>
          {showCushion && (
            <CushionBadge cushionAvailable={duo.cushionAvailable} atRisk={duo.stars === 0 && !duo.cushionAvailable} />
          )}
          <StarBadge stars={duo.stars} />
        </div>
      </div>
      <DuoPlayers players={duo.players} />
      <p className="pl-1 text-[10px] text-[#687FA3]/60">{describeLadderEvent(duo.lastEvent, tiers)}</p>
    </div>
  );
}

function DuoResultRow({ result }: { result: LadderDuoCycleResult }) {
  const record =
    result.matchesPlayed > 0
      ? `${result.matchesPlayed} ${result.matchesPlayed === 1 ? "match" : "matches"} · ${result.wins}W-${result.losses}L`
      : "No duo matches";
  const climbed =
    result.startTierRank !== null && result.startTierName !== null ? result.tierRank - result.startTierRank : null;

  return (
    <div className="flex items-start gap-2 rounded-lg border border-[#162032] bg-[#0f1729] px-3 py-2">
      <span className="w-7 shrink-0 text-right font-black tabular-nums text-[#687FA3] pt-0.5">
        {result.overallRank ?? "—"}
      </span>
      <img src={tierIconSrc(result.tierName)} alt={result.tierName} className="w-6 h-6 object-contain shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-bold text-white truncate">{result.label}</p>
        <DuoPlayers players={result.players} />
        <p className="pl-1 mt-0.5 text-[10px] text-[#687FA3]/60">
          {result.tierName}
          {result.tierPosition !== null ? ` #${result.tierPosition}` : ""} · {record}
          {climbed !== null && (
            <>
              {" · started "}
              {result.startTierName}{" "}
              {climbed > 0 ? (
                <span className="text-emerald-400/80">▲{climbed}</span>
              ) : climbed < 0 ? (
                <span className="text-rose-400/80">▼{-climbed}</span>
              ) : (
                "held"
              )}
            </>
          )}
        </p>
      </div>
      <StarBadge stars={result.stars} />
    </div>
  );
}

function DuoResults({
  completedCycles,
  resultsByCycle,
}: {
  completedCycles: LadderCompletedCycle[];
  resultsByCycle: LadderDuoPageData["resultsByCycle"];
}) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const cycles = completedCycles.filter((c) => (resultsByCycle[c.id] ?? []).length > 0);
  if (cycles.length === 0) {
    return (
      <p className="text-sm text-[#687FA3]">
        No Duo Ladder cycle has finished yet. Final duo tiers and stars are recorded here when a cycle closes.
      </p>
    );
  }

  return (
    <div>
      {cycles.map((cycle) => {
        const results = resultsByCycle[cycle.id] ?? [];
        const ranked = results.filter((r) => r.badgeEligible);
        const unranked = results.filter((r) => !r.badgeEligible);
        return (
          <section key={cycle.id} className="mb-10">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 className="text-lg font-black uppercase tracking-tight text-white">{cycle.label}</h2>
              <span className="text-[10px] text-[#687FA3]/60">#{cycle.id}</span>
            </div>
            {ranked.length === 0 ? (
              <p className="text-sm text-[#687FA3]">No duo played enough matches to place in this cycle.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {ranked.map((r) => (
                  <DuoResultRow key={r.duoId} result={r} />
                ))}
              </div>
            )}
            {unranked.length > 0 && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setExpanded((prev) => ({ ...prev, [cycle.id]: !prev[cycle.id] }))}
                  className="text-[10px] font-black uppercase tracking-widest text-[#687FA3]/60 hover:text-white transition-colors cursor-pointer"
                >
                  {expanded[cycle.id] ? "Hide" : "Show"} {unranked.length} duo{unranked.length === 1 ? "" : "s"} with
                  fewer than 3 matches
                </button>
                {expanded[cycle.id] && (
                  <div className="mt-2 flex flex-col gap-2 opacity-70">
                    {unranked.map((r) => (
                      <DuoResultRow key={r.duoId} result={r} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

// /ladder?mode=duo — the Duo Ladder. Same tiers, stars and cushion as the solo ladder, but each row
// is a fixed pair placed by the average of its two ratings.
export default function LadderDuoView({
  duo,
  view,
  completedCycles,
  isLinked,
  hasActiveCycle,
  isCycleClosed,
}: {
  duo: LadderDuoPageData;
  view: "standings" | "results";
  completedCycles: LadderCompletedCycle[];
  isLinked: boolean;
  hasActiveCycle: boolean;
  isCycleClosed: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { tiers, groupedDuos, pendingMatchesByTier } = duo;

  const tierNames = tiers.map((t) => t.name);
  const rawTier = searchParams.get("tier");
  const activeTierName = tierNames.includes(rawTier ?? "") ? (rawTier as string) : (tierNames[0] ?? "");
  const activeTier = tiers.find((t) => t.name === activeTierName) ?? null;
  const activeDuos = activeTier ? (groupedDuos[activeTier.id] ?? []) : [];
  const showCushion = activeTier != null && activeTier.rank > (tiers[0]?.rank ?? 1);

  const pendingMatches = useMemo(() => {
    const flat: Array<{ match: LadderDuoPendingMatch; tierName: string }> = [];
    for (const tier of tiers) {
      for (const match of pendingMatchesByTier[tier.id] ?? []) flat.push({ match, tierName: tier.name });
    }
    return flat.sort((a, b) => {
      if (a.match.status !== b.match.status) return a.match.status === "scheduled" ? -1 : 1;
      return a.match.matchId - b.match.matchId;
    });
  }, [tiers, pendingMatchesByTier]);

  const selectTier = (name: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tier", name);
    router.push(`/ladder?${params.toString()}`);
  };

  if (view === "results") {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <DuoResults completedCycles={completedCycles} resultsByCycle={duo.resultsByCycle} />
      </div>
    );
  }

  return (
    <>
      {isLinked && <LadderDuoPanel cycleOpen={hasActiveCycle && !isCycleClosed} />}

      {!hasActiveCycle ? (
        <p className="max-w-4xl mx-auto px-4 sm:px-6 text-sm text-[#687FA3]">The ladder hasn&apos;t started yet.</p>
      ) : (
        <>
          {pendingMatches.length > 0 && (
            <div className="mb-6">
              <h2 className="max-w-4xl mx-auto px-4 sm:px-6 mb-2 text-[10px] font-black uppercase tracking-widest text-[#687FA3]/60">
                Duo Matches
              </h2>
              <div className="flex gap-3 overflow-x-auto pb-2 px-4 sm:px-6" style={{ scrollbarWidth: "none" }}>
                {pendingMatches.map(({ match, tierName }) => (
                  <DuoMatchCard key={match.matchId} match={match} tierName={tierName} />
                ))}
              </div>
            </div>
          )}

          <div className="max-w-4xl mx-auto px-4 sm:px-6">
            <div className="flex gap-2 overflow-x-auto pb-1 mb-6" style={{ scrollbarWidth: "none" }}>
              {tiers.map((tier) => {
                const isActive = tier.name === activeTierName;
                return (
                  <button
                    key={tier.id}
                    type="button"
                    onClick={() => selectTier(tier.name)}
                    className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-widest transition-colors cursor-pointer ${
                      isActive ? "bg-[#1a2540] text-white" : "text-[#687FA3] hover:text-white"
                    }`}
                  >
                    <img src={tierIconSrc(tier.name)} alt="" className="w-5 h-5 object-contain shrink-0" />
                    {tier.name}
                    <span className="text-[10px] font-normal text-[#687FA3]">{(groupedDuos[tier.id] ?? []).length}</span>
                  </button>
                );
              })}
            </div>

            {activeDuos.length === 0 ? (
              <p className="text-sm text-[#687FA3]">No duos in this tier yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {activeDuos.map((entry) => (
                  <DuoRow key={entry.duoId} duo={entry} showCushion={showCushion} tiers={tiers} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
