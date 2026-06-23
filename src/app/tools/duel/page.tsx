"use client";

import { Suspense, useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import MembersOnlyGate from "@/components/MembersOnlyGate";
import WinProbabilityCalculator, {
  WinProbabilityCalculatorHandle,
  SlotKey,
} from "@/app/dashboard/WinProbabilityCalculator";
import { usePlayerRatingEvents } from "@/lib/usePlayerRatingEvents";
import { useDuelPool } from "@/lib/useDuelPool";
import DuelPoolSection from "./DuelPoolSection";
import type { Player } from "@/lib/types";

const SLOT_KEYS: SlotKey[] = ["t1p1", "t1p2", "t2p1", "t2p2"];

function DuelContent({ player }: { player: Player }) {
  const calcRef = useRef<WinProbabilityCalculatorHandle>(null);
  const { latestRating } = usePlayerRatingEvents(String(player.player_id));
  const { pool, loading: poolLoading, reload: reloadPool } = useDuelPool();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Opted-in player ids (the duel pool). While the pool is still loading we
  // pass `undefined` to the calculator so it doesn't briefly flag everyone red.
  const poolIds = useMemo(() => new Set(pool.map((p) => p.id)), [pool]);

  // Seed the calculator from the URL once on mount so a shared link restores the
  // exact lineup. Subsequent changes flow back out via handleSlotsChange.
  const initialPlayerIds = useMemo(() => {
    const ids: Partial<Record<SlotKey, string>> = {};
    for (const key of SLOT_KEYS) {
      const v = searchParams.get(key);
      if (v) ids[key] = v;
    }
    return ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirror the calculator's seated players: drive the pool's "selected" state,
  // and keep the lineup in the URL (?t1p1=…&t2p2=…) so the view is shareable.
  // searchStrRef holds the latest query string so this callback can stay stable
  // (deps: [router]) and self-guard against redundant replaces.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const searchStrRef = useRef(searchParams.toString());
  searchStrRef.current = searchParams.toString();

  const handleSlotsChange = useCallback(
    (ids: Partial<Record<SlotKey, string>>) => {
      setSelectedIds(Object.values(ids).filter(Boolean) as string[]);

      const params = new URLSearchParams(searchStrRef.current);
      for (const key of SLOT_KEYS) {
        const id = ids[key];
        if (id) params.set(key, id);
        else params.delete(key);
      }
      const qs = params.toString();
      if (qs === searchStrRef.current) return;
      router.replace(qs ? `/tools/duel?${qs}` : "/tools/duel", {
        scroll: false,
      });
    },
    [router],
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
          pool={pool}
          loading={poolLoading}
          reload={reloadPool}
          onAddPlayer={(p) => calcRef.current?.addPlayer(p)}
          onRemovePlayer={(id) => calcRef.current?.removePlayer(id)}
          onSetLineup={(lineup) => calcRef.current?.setLineup(lineup)}
        />

        <WinProbabilityCalculator
          ref={calcRef}
          initialPlayerIds={initialPlayerIds}
          currentPlayer={player}
          currentPlayerRating={latestRating}
          onSlotsChange={handleSlotsChange}
          poolIds={poolLoading ? undefined : poolIds}
        />
      </div>
    </div>
  );
}

export default function DuelRoulettePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#0E1523]">
          <div className="w-8 h-8 border-2 border-[#00C8DC] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <MembersOnlyGate>
        {(player) => <DuelContent player={player} />}
      </MembersOnlyGate>
    </Suspense>
  );
}
