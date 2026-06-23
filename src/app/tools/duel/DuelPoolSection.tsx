"use client";

import { useMemo, useState } from "react";
import { Shuffle, Loader2, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";
import RatingRangeFilter from "@/components/RatingRangeFilter";
import { useDuelPool, DuelPoolPlayer } from "@/lib/useDuelPool";
import { generateFairDuel } from "@/lib/generateFairDuel";
import type { Player } from "@/lib/types";
import type { SlotKey } from "@/app/dashboard/WinProbabilityCalculator";

function poolToPlayer(p: DuelPoolPlayer): Player {
  return {
    player_id: p.id,
    name: p.name ?? "",
    nickname: p.nickname ?? "",
    image_link: p.image_link,
    preferred_side: p.preferred_side,
    initial_rating: p.latestRating,
  };
}

function sideTag(side: DuelPoolPlayer["preferred_side"]): string | null {
  if (side === "left") return "L";
  if (side === "right") return "R";
  if (side === "both") return "L·R";
  return null;
}

function PoolCard({
  player,
  selected,
  isYou,
  onSelect,
}: {
  player: DuelPoolPlayer;
  selected: boolean;
  isYou: boolean;
  onSelect: () => void;
}) {
  const hasImg = !!(player.image_link && player.image_link !== "null");
  const src = hasImg ? player.image_link! : "/default-avatar.webp";
  const tag = sideTag(player.preferred_side);

  return (
    <button
      type="button"
      onClick={onSelect}
      title={selected ? "In the lineup — tap to remove" : "Tap to add"}
      className="w-16 flex-shrink-0 flex flex-col items-center gap-1 group focus-visible:outline-none cursor-pointer"
    >
      <div className="relative">
        <img
          src={src}
          alt={player.name ?? "Player"}
          className={`h-12 w-12 rounded-full object-cover ring-1 transition-all ${
            selected
              ? "ring-2 ring-[#00C8DC] opacity-50"
              : "ring-white/10 group-hover:ring-[#00C8DC]/60"
          }`}
        />
        {selected && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#00C8DC] text-[#0E1523]">
            <Check size={10} strokeWidth={3} />
          </span>
        )}
        {isYou && (
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[7px] font-black uppercase tracking-wider text-sky-400 bg-[#162032] border border-sky-400/30 px-1 rounded-sm leading-tight">
            You
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        <span className="text-xs font-semibold tabular-nums text-[#00C8DC] leading-none">
          {player.latestRating.toFixed(2)}
        </span>
        {tag && (
          <span className="text-[7px] font-black uppercase text-[#687FA3]/80 bg-[#687FA3]/10 border border-[#687FA3]/20 px-0.5 rounded-sm leading-none">
            {tag}
          </span>
        )}
      </div>
      <div className="text-[11px] text-slate-300 text-center line-clamp-1 w-16 leading-snug">
        {player.nickname || player.name || "—"}
      </div>
    </button>
  );
}

export default function DuelPoolSection({
  currentPlayer,
  currentPlayerRating,
  selectedIds,
  onAddPlayer,
  onRemovePlayer,
  onSetLineup,
}: {
  currentPlayer: Player;
  currentPlayerRating: number | null;
  selectedIds: string[];
  onAddPlayer: (player: Player) => void;
  onRemovePlayer: (id: string) => void;
  onSetLineup: (players: Partial<Record<SlotKey, Player>>) => void;
}) {
  const { pool, loading, reload } = useDuelPool();

  const [optIn, setOptIn] = useState<boolean>(
    currentPlayer.is_duel_roulette_opt_in ?? false,
  );
  const [savingOptIn, setSavingOptIn] = useState(false);
  const [min, setMin] = useState<number | null>(null);
  const [max, setMax] = useState<number | null>(null);

  const meId = String(currentPlayer.player_id);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  // The current player is shown in the pool too (so people can build matchups
  // that don't include themselves), but stays subject to the rating filter.
  const filteredPool = useMemo(
    () =>
      pool.filter(
        (p) =>
          (min == null || p.latestRating >= min) &&
          (max == null || p.latestRating <= max),
      ),
    [pool, min, max],
  );

  // "Generate" always seats the current player + 3 others, so gating + hints
  // count the others in range, not the full (self-inclusive) filtered pool.
  const othersInRangeCount = useMemo(
    () => filteredPool.filter((p) => p.id !== meId).length,
    [filteredPool, meId],
  );

  const byId = useMemo(() => {
    const m = new Map<string, DuelPoolPlayer>();
    for (const p of pool) m.set(p.id, p);
    return m;
  }, [pool]);

  const canGenerate = currentPlayerRating != null && othersInRangeCount >= 3;

  async function toggleOptIn() {
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
        body: JSON.stringify({ is_duel_roulette_opt_in: next }),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      reload();
    } catch (err) {
      console.error("[duel] opt-in save error:", err);
      setOptIn(!next); // revert
    } finally {
      setSavingOptIn(false);
    }
  }

  function handleGenerate() {
    if (!canGenerate || currentPlayerRating == null) return;
    const candidates = filteredPool.map((p) => ({
      id: p.id,
      rating: p.latestRating,
    }));
    const result = generateFairDuel(
      { id: meId, rating: currentPlayerRating },
      candidates,
    );
    if (!result) return;
    const partner = byId.get(result.t1p2);
    const opp1 = byId.get(result.t2p1);
    const opp2 = byId.get(result.t2p2);
    if (!partner || !opp1 || !opp2) return;
    onSetLineup({
      t1p1: currentPlayer,
      t1p2: poolToPlayer(partner),
      t2p1: poolToPlayer(opp1),
      t2p2: poolToPlayer(opp2),
    });
  }

  return (
    <section className="bg-[#162032] border border-[#687FA3]/10 sm:rounded-3xl overflow-hidden">
      {/* Header + opt-in */}
      <div className="px-6 pt-5 pb-3 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xs font-black uppercase tracking-widest text-[#687FA3]">
            Duel Pool
          </h2>
          <p className="mt-0.5 text-[10px] text-slate-600">
            Tap a player to add them, or generate a fair duel from the pool.
          </p>
        </div>
        <button
          type="button"
          onClick={toggleOptIn}
          disabled={savingOptIn}
          className={`shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest transition-colors cursor-pointer disabled:cursor-not-allowed ${
            optIn
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
              : "bg-[#687FA3]/5 border-[#687FA3]/20 text-[#687FA3] hover:bg-[#687FA3]/10"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${optIn ? "bg-emerald-400" : "bg-[#687FA3]/50"}`}
          />
          {optIn ? "In the pool" : "Join the pool"}
        </button>
      </div>

      {/* Controls */}
      <div className="px-6 pb-4 flex flex-wrap items-center justify-between gap-3">
        <RatingRangeFilter min={min} max={max} onChange={(lo, hi) => { setMin(lo); setMax(hi); }} />
        <button
          type="button"
          onClick={handleGenerate}
          disabled={!canGenerate}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-colors cursor-pointer disabled:cursor-not-allowed bg-[#00C8DC]/15 border border-[#00C8DC]/40 text-[#00C8DC] hover:bg-[#00C8DC]/25 disabled:opacity-40 disabled:hover:bg-[#00C8DC]/15"
        >
          <Shuffle size={13} />
          Generate Duel
        </button>
      </div>

      {/* Pool scroll */}
      <div
        className="relative overflow-x-auto"
        style={{
          scrollbarWidth: "none",
          paddingTop: "4px",
          paddingBottom: "20px",
          paddingLeft: "24px",
          paddingRight: "24px",
          WebkitMaskImage:
            "linear-gradient(to right, transparent 0%, black 40px, black calc(100% - 40px), transparent 100%)",
          maskImage:
            "linear-gradient(to right, transparent 0%, black 40px, black calc(100% - 40px), transparent 100%)",
        }}
      >
        {loading ? (
          <div className="flex gap-4 items-center">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="w-16 flex-shrink-0 flex flex-col items-center gap-1.5"
              >
                <div className="h-12 w-12 rounded-full bg-[#1a2540] animate-pulse" />
                <div className="h-2.5 w-12 rounded bg-[#1a2540] animate-pulse" />
              </div>
            ))}
          </div>
        ) : filteredPool.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-xs text-[#687FA3]">
              {pool.length === 0
                ? "No one's in the pool yet. Join above to get things started."
                : "No players match this rating range."}
            </p>
          </div>
        ) : (
          <div className="flex gap-4 items-center">
            {filteredPool.map((player) => {
              const selected = selectedSet.has(player.id);
              return (
                <PoolCard
                  key={player.id}
                  player={player}
                  selected={selected}
                  isYou={player.id === meId}
                  onSelect={() =>
                    selected
                      ? onRemovePlayer(player.id)
                      : onAddPlayer(poolToPlayer(player))
                  }
                />
              );
            })}
          </div>
        )}
      </div>

      {!loading && filteredPool.length > 0 && othersInRangeCount < 3 && (
        <p className="px-6 pb-4 text-[10px] text-[#687FA3]/60 flex items-center gap-1.5">
          <Loader2 size={10} />
          Need at least 3 others in range to generate a duel.
        </p>
      )}
    </section>
  );
}
