"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Star } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import PlayerCard from "@/components/PlayerCard";
import { useCurrentPlayer } from "@/lib/useCurrentPlayer";
import { supabase } from "@/lib/supabase";
import { describeLadderEvent } from "@/lib/ladderEventDisplay";
import type { LadderPlayer, LadderTier } from "@/lib/ladderData";

const MAX_STARS = 2;

function tierIconSrc(tierName: string): string {
  return `/ladder/${tierName.trim().toLowerCase()}.png`;
}

function StarBadge({ stars }: { stars: number }) {
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      {Array.from({ length: MAX_STARS }, (_, i) => (
        <Star
          key={i}
          className={
            i < stars
              ? "w-4 h-4 fill-[#00C8DC] text-[#00C8DC]"
              : "w-4 h-4 text-[#687FA3]/30"
          }
        />
      ))}
    </div>
  );
}

function OptedInDot() {
  return (
    <span
      title="Opted into the ladder"
      className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"
    />
  );
}

function LadderViewContent({
  hasActiveCycle,
  activeCycle,
  tiers,
  groupedPlayers,
}: {
  hasActiveCycle: boolean;
  activeCycle: { id: number; label: string } | null;
  tiers: LadderTier[];
  groupedPlayers: Record<number, LadderPlayer[]>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { player: currentPlayer, isLinked } = useCurrentPlayer();

  const [localGroupedPlayers, setLocalGroupedPlayers] = useState(groupedPlayers);
  useEffect(() => {
    setLocalGroupedPlayers(groupedPlayers);
  }, [groupedPlayers]);

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
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest transition-colors cursor-pointer disabled:cursor-not-allowed ${
                    optIn
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                      : "bg-[#687FA3]/5 border-[#687FA3]/20 text-[#687FA3] hover:bg-[#687FA3]/10"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${optIn ? "bg-emerald-400" : "bg-[#687FA3]/50"}`}
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
}) {
  return (
    <Suspense fallback={null}>
      <LadderViewContent {...props} />
    </Suspense>
  );
}
