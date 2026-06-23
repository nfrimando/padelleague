"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import MembersOnlyGate from "@/components/MembersOnlyGate";
import WinProbabilityCalculator, {
  WinProbabilityCalculatorHandle,
  SlotKey,
} from "@/app/dashboard/WinProbabilityCalculator";
import { usePlayerRatingEvents } from "@/lib/usePlayerRatingEvents";
import DuelPoolSection from "./DuelPoolSection";
import type { Player } from "@/lib/types";

function DuelContent({ player }: { player: Player }) {
  const calcRef = useRef<WinProbabilityCalculatorHandle>(null);
  const { latestRating } = usePlayerRatingEvents(String(player.player_id));

  // Mirror the calculator's seated players so the pool can show which cards are
  // already in the lineup (and let tapping one toggle it back out).
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const handleSlotsChange = useCallback(
    (ids: Partial<Record<SlotKey, string>>) =>
      setSelectedIds(Object.values(ids).filter(Boolean) as string[]),
    [],
  );

  return (
    <div className="min-h-screen bg-[#0E1523] text-white flex flex-col">
      <SiteHeader />
      <div className="flex-1 w-full max-w-2xl mx-auto sm:px-6 py-6 space-y-4">
        <header className="px-4 sm:px-0">
          <Link
            href="/tools"
            className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-[#687FA3] hover:text-white transition-colors mb-2"
          >
            <ChevronLeft size={12} />
            Tools
          </Link>
          <h1 className="text-2xl font-black italic uppercase tracking-tighter">
            Duel Roulette
          </h1>
          <p className="text-white/50 text-sm mt-1">
            Generate a fair 2v2 from opted-in members, then find the best time to
            play.
          </p>
        </header>

        <DuelPoolSection
          currentPlayer={player}
          currentPlayerRating={latestRating}
          selectedIds={selectedIds}
          onAddPlayer={(p) => calcRef.current?.addPlayer(p)}
          onRemovePlayer={(id) => calcRef.current?.removePlayer(id)}
          onSetLineup={(lineup) => calcRef.current?.setLineup(lineup)}
        />

        <WinProbabilityCalculator
          ref={calcRef}
          currentPlayer={player}
          currentPlayerRating={latestRating}
          onSlotsChange={handleSlotsChange}
        />
      </div>
    </div>
  );
}

export default function DuelRoulettePage() {
  return (
    <MembersOnlyGate>
      {(player) => <DuelContent player={player} />}
    </MembersOnlyGate>
  );
}
