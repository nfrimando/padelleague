"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import PlayerCard from "@/components/PlayerCard";
import { tierIconSrc, StarBadge } from "@/components/LadderTierBadge";
import { useCurrentPlayer } from "@/lib/useCurrentPlayer";
import { supabase } from "@/lib/supabase";
import { describeLadderEvent } from "@/lib/ladderEventDisplay";
import type { LadderPendingMatch, LadderPlayer, LadderTier } from "@/lib/ladderData";

function OptedInDot() {
  return (
    <span
      title="Opted into the ladder"
      className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"
    />
  );
}

function pendingMatchTeamLabel(team: LadderPendingMatch["team1"]): string {
  const label = (p: LadderPendingMatch["team1"][number]) => p.nickname || p.name;
  return `${label(team[0])} & ${label(team[1])}`;
}

// Compact fixed-width card for the top-of-page horizontal ladder matches strip. Shows a
// tier icon since this strip spans all tiers, unlike the old per-tier list this replaces.
function LadderMatchScrollCard({
  match,
  tierName,
  now,
}: {
  match: LadderPendingMatch;
  tierName: string;
  now: number | null;
}) {
  const deadline = match.scheduleDeadlineAt ? new Date(match.scheduleDeadlineAt) : null;
  const hoursLeft =
    deadline && now !== null ? (deadline.getTime() - now) / (1000 * 60 * 60) : null;
  const urgent = hoursLeft !== null && hoursLeft < 48;
  const expired = hoursLeft !== null && hoursLeft < 0;

  const deadlineLabel = deadline
    ? deadline.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

  return (
    <div className="shrink-0 w-56 flex flex-col gap-1.5 rounded-lg border border-[#162032] bg-[#0f1729] px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[#687FA3]">
          <img
            src={tierIconSrc(tierName)}
            alt=""
            className="w-3.5 h-3.5 object-contain shrink-0"
          />
          {tierName}
        </span>
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
            match.status === "scheduled"
              ? "bg-blue-500/10 text-blue-300"
              : "bg-amber-500/10 text-amber-300"
          }`}
        >
          {match.status}
        </span>
      </div>
      <p className="text-sm text-[#e2e8f0] leading-snug">
        {pendingMatchTeamLabel(match.team1)}
        <span className="text-[#687FA3]"> vs </span>
        {pendingMatchTeamLabel(match.team2)}
      </p>
      <p className="text-[10px] text-[#687FA3]/70">
        {match.status === "scheduled" ? (
          <>
            {match.dateLocal ?? "date TBD"}
            {match.timeLocal ? ` at ${match.timeLocal}` : ""}
            {match.venue ? ` · ${match.venue}` : ""}
          </>
        ) : deadlineLabel ? (
          <span className={expired ? "text-rose-400" : urgent ? "text-amber-400" : ""}>
            {expired ? "Deadline passed — " : "Schedule by "}
            {deadlineLabel}
          </span>
        ) : (
          "Not yet scheduled"
        )}
      </p>
    </div>
  );
}

function LadderViewContent({
  hasActiveCycle,
  activeCycle,
  tiers,
  groupedPlayers,
  pendingMatchesByTier,
}: {
  hasActiveCycle: boolean;
  activeCycle: { id: number; label: string } | null;
  tiers: LadderTier[];
  groupedPlayers: Record<number, LadderPlayer[]>;
  pendingMatchesByTier: Record<number, LadderPendingMatch[]>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { player: currentPlayer, isLinked } = useCurrentPlayer();

  const [localGroupedPlayers, setLocalGroupedPlayers] = useState(groupedPlayers);
  useEffect(() => {
    setLocalGroupedPlayers(groupedPlayers);
  }, [groupedPlayers]);

  // Deferred to a mount effect (rather than read directly during render) to avoid
  // SSR/client hydration mismatches on the deadline urgency styling below.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
  }, []);

  const [optIn, setOptIn] = useState(false);
  const [savingOptIn, setSavingOptIn] = useState(false);
  useEffect(() => {
    setOptIn(currentPlayer?.is_ladder_opt_in ?? false);
  }, [currentPlayer?.is_ladder_opt_in]);

  const tierNames = tiers.map((t) => t.name);
  const rawTier = searchParams.get("tier");
  const activeTierName = tierNames.includes(rawTier ?? "")
    ? (rawTier as string)
    : (tierNames[0] ?? "");
  const activeTier = tiers.find((t) => t.name === activeTierName) ?? null;
  const allActivePlayers = activeTier ? (localGroupedPlayers[activeTier.id] ?? []) : [];

  // Cross-tier, chronological (earliest→latest) list for the top-of-page horizontal strip.
  // Scheduled matches sort by their actual date/time; undated "assigned" matches (still
  // needing to be scheduled) have no date to sort by, so they're appended at the end —
  // sorted among themselves by deadline — putting the most actionable matches rightmost.
  const allPendingMatches = useMemo(() => {
    const flat: Array<{ match: LadderPendingMatch; tierName: string }> = [];
    for (const tier of tiers) {
      for (const match of pendingMatchesByTier[tier.id] ?? []) {
        flat.push({ match, tierName: tier.name });
      }
    }

    const scheduled = flat
      .filter((entry) => entry.match.status === "scheduled")
      .sort((a, b) => {
        const aKey = `${a.match.dateLocal ?? ""}T${a.match.timeLocal ?? ""}`;
        const bKey = `${b.match.dateLocal ?? ""}T${b.match.timeLocal ?? ""}`;
        return aKey.localeCompare(bKey);
      });

    const assigned = flat
      .filter((entry) => entry.match.status === "assigned")
      .sort((a, b) => {
        const aDeadline = a.match.scheduleDeadlineAt
          ? new Date(a.match.scheduleDeadlineAt).getTime()
          : Infinity;
        const bDeadline = b.match.scheduleDeadlineAt
          ? new Date(b.match.scheduleDeadlineAt).getTime()
          : Infinity;
        return aDeadline - bDeadline;
      });

    return [...scheduled, ...assigned];
  }, [tiers, pendingMatchesByTier]);

  const matchStripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = matchStripRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [allPendingMatches.length]);

  type LadderFilter = "optedIn" | "played" | "either" | "all";
  const rawFilter = searchParams.get("filter");
  const filter: LadderFilter =
    rawFilter === "optedIn" || rawFilter === "played" || rawFilter === "all"
      ? rawFilter
      : "either";

  const activePlayers = allActivePlayers.filter((p) => {
    if (filter === "all") return true;
    if (filter === "optedIn") return p.isOptedIn;
    if (filter === "played") return p.hasPlayedThisCycle;
    return p.isOptedIn || p.hasPlayedThisCycle;
  });

  const selectTier = (name: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tier", name);
    router.push(`/ladder?${params.toString()}`);
  };

  const setFilter = (next: LadderFilter) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "either") params.delete("filter");
    else params.set("filter", next);
    router.push(`/ladder?${params.toString()}`);
  };

  async function toggleOptIn() {
    if (!currentPlayer) return;
    const next = !optIn;
    setOptIn(next); // optimistic
    setSavingOptIn(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("No session");
      const res = await fetch("/api/players/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ is_ladder_opt_in: next }),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);

      const meId = String(currentPlayer.player_id);
      setLocalGroupedPlayers((prev) => {
        const updated: Record<number, LadderPlayer[]> = {};
        for (const [tierId, players] of Object.entries(prev)) {
          updated[Number(tierId)] = players.map((p) =>
            p.player_id === meId ? { ...p, isOptedIn: next } : p,
          );
        }
        return updated;
      });
    } catch (err) {
      console.error("[ladder] opt-in save error:", err);
      setOptIn(!next); // revert
    } finally {
      setSavingOptIn(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0E1523]">
      <SiteHeader activePath="/ladder" />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-24 pb-20">
        <div className="mb-8 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-white">
              Tier Ladder
            </h1>
            <p className="mt-2 text-[#687FA3]">
              Standings for the current cycle, grouped by tier.
            </p>
          </div>
          {activeCycle && (
            <span className="shrink-0 text-[10px] text-[#687FA3]/50 whitespace-nowrap pt-1">
              {activeCycle.label} · #{activeCycle.id}
            </span>
          )}
        </div>

        {!hasActiveCycle ? (
          <p className="text-sm text-[#687FA3]">
            The ladder hasn&apos;t started yet.
          </p>
        ) : tiers.length === 0 ? (
          <p className="text-sm text-[#687FA3]">No tiers have been set up yet.</p>
        ) : (
          <>
            {allPendingMatches.length > 0 && (
              <div className="mb-6">
                <h2 className="mb-2 text-[10px] font-black uppercase tracking-widest text-[#687FA3]/60">
                  Ladder Matches
                </h2>
                <div
                  ref={matchStripRef}
                  className="flex gap-3 overflow-x-auto pb-2"
                  style={{ scrollbarWidth: "none" }}
                >
                  {allPendingMatches.map(({ match, tierName }) => (
                    <LadderMatchScrollCard
                      key={match.matchId}
                      match={match}
                      tierName={tierName}
                      now={now}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 rounded-full border border-[#687FA3]/20 bg-[#687FA3]/5 p-1">
                  <button
                    type="button"
                    onClick={() => setFilter("optedIn")}
                    className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors cursor-pointer ${
                      filter === "optedIn"
                        ? "bg-[#1a2540] text-white"
                        : "text-[#687FA3] hover:text-white"
                    }`}
                  >
                    Opted In Only
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilter("played")}
                    className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors cursor-pointer ${
                      filter === "played"
                        ? "bg-[#1a2540] text-white"
                        : "text-[#687FA3] hover:text-white"
                    }`}
                  >
                    Played Only
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilter("either")}
                    className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors cursor-pointer ${
                      filter === "either"
                        ? "bg-[#1a2540] text-white"
                        : "text-[#687FA3] hover:text-white"
                    }`}
                  >
                    Either
                  </button>
                </div>

                {filter !== "all" && (
                  <button
                    type="button"
                    onClick={() => setFilter("all")}
                    className="px-2 py-1 text-[10px] font-black uppercase tracking-widest text-[#687FA3]/60 hover:text-white transition-colors cursor-pointer"
                  >
                    Clear filters
                  </button>
                )}
              </div>

              {isLinked ? (
                <button
                  type="button"
                  onClick={toggleOptIn}
                  disabled={savingOptIn}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full border text-[11px] font-black uppercase tracking-widest transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${
                    optIn
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                      : "bg-[#00C8DC] border-[#00C8DC] text-[#0E1523] shadow-[0_0_20px_rgba(0,200,220,0.45)] hover:bg-white hover:border-white hover:shadow-[0_0_24px_rgba(0,200,220,0.6)]"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${optIn ? "bg-emerald-400" : "bg-[#0E1523]"}`}
                  />
                  {optIn ? "In the ladder" : "Join the ladder"}
                </button>
              ) : (
                <Link
                  href="/join"
                  className="text-[10px] font-black uppercase tracking-widest text-[#687FA3] hover:text-[#00C8DC] transition-colors"
                >
                  Link your profile to join →
                </Link>
              )}
            </div>

            <div
              className="flex gap-2 overflow-x-auto pb-1 mb-6"
              style={{ scrollbarWidth: "none" }}
            >
              {tiers.map((tier) => {
                const isActive = tier.name === activeTierName;
                const count = (localGroupedPlayers[tier.id] ?? []).length;
                return (
                  <button
                    key={tier.id}
                    type="button"
                    onClick={() => selectTier(tier.name)}
                    className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-widest transition-colors cursor-pointer ${
                      isActive
                        ? "bg-[#1a2540] text-white"
                        : "text-[#687FA3] hover:text-white"
                    }`}
                  >
                    <img
                      src={tierIconSrc(tier.name)}
                      alt=""
                      className="w-5 h-5 object-contain shrink-0"
                    />
                    {tier.name}
                    <span className="text-[10px] font-normal text-[#687FA3]">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {activePlayers.length === 0 ? (
              <p className="text-sm text-[#687FA3]">
                {allActivePlayers.length === 0
                  ? "No players in this tier yet."
                  : "No one matches this filter yet — tap “Clear filters” to see the full tier."}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {activePlayers.map((player) => (
                  <div
                    key={player.player_id}
                    className="flex flex-col gap-1 rounded-lg border border-[#162032] bg-[#0f1729] px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <PlayerCard
                        player={player}
                        size="sm"
                        showLatestRating={false}
                        openInNewTab
                      />
                      <div className="flex items-center gap-2 shrink-0">
                        {player.isOptedIn && <OptedInDot />}
                        <span className="text-[10px] font-semibold text-[#687FA3]/60 tabular-nums">
                          {player.winsThisCycle}W
                        </span>
                        <StarBadge stars={player.stars} />
                      </div>
                    </div>
                    <p className="pl-1 text-[10px] text-[#687FA3]/60">
                      {describeLadderEvent(player.lastEvent, tiers)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default function LadderView(props: {
  hasActiveCycle: boolean;
  activeCycle: { id: number; label: string } | null;
  tiers: LadderTier[];
  groupedPlayers: Record<number, LadderPlayer[]>;
  pendingMatchesByTier: Record<number, LadderPendingMatch[]>;
}) {
  return (
    <Suspense fallback={null}>
      <LadderViewContent {...props} />
    </Suspense>
  );
}
