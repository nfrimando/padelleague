"use client";

import { Suspense, useCallback, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Pencil } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import MembersOnlyGate from "@/components/MembersOnlyGate";
import RatingRangeFilter from "@/components/RatingRangeFilter";
import EditScheduleModal from "@/app/dashboard/EditScheduleModal";
import { useAllPlayerSchedules } from "@/lib/useAllPlayerSchedules";
import ScheduleHeatmap from "./ScheduleHeatmap";
import type { Player } from "@/lib/types";

// Rating bounds live in the URL (?min=&max=) so a filtered view is shareable.
function parseRatingParam(v: string | null): number | null {
  if (v == null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function FindContent({ player }: { player: Player }) {
  const { rows, playersById, loading, reload } = useAllPlayerSchedules();
  const router = useRouter();
  const searchParams = useSearchParams();
  const min = parseRatingParam(searchParams.get("min"));
  const max = parseRatingParam(searchParams.get("max"));
  const [editOpen, setEditOpen] = useState(false);

  const setRange = useCallback(
    (lo: number | null, hi: number | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (lo == null) params.delete("min");
      else params.set("min", String(lo));
      if (hi == null) params.delete("max");
      else params.set("max", String(hi));
      const qs = params.toString();
      router.replace(qs ? `/tools/find?${qs}` : "/tools/find");
    },
    [searchParams, router],
  );

  return (
    <div className="min-h-screen bg-[#0E1523] text-white flex flex-col">
      <SiteHeader />
      <EditScheduleModal
        playerId={Number(player.player_id)}
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={() => reload()}
      />

      <div className="flex-1 w-full max-w-3xl mx-auto sm:px-6 py-6 space-y-4">
        <header className="px-4 sm:px-0">
          <Link
            href="/tools"
            className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-[#687FA3] hover:text-white transition-colors mb-2"
          >
            <ChevronLeft size={12} />
            Tools
          </Link>
          <h1 className="text-2xl font-black italic uppercase tracking-tighter">
            Find Players
          </h1>
          <p className="text-white/50 text-sm mt-1">
            Everyone&apos;s weekly availability at a glance. Filter by rating to
            find your level. Make sure to double check with players regarding
            their availability.
          </p>
        </header>

        <div className="px-4 sm:px-0 flex flex-wrap items-center justify-between gap-3">
          <RatingRangeFilter min={min} max={max} onChange={setRange} />
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-[#00C8DC] bg-[#00C8DC]/10 border border-[#00C8DC]/25 hover:bg-[#00C8DC]/20 px-3 py-1.5 rounded-full transition-colors cursor-pointer"
          >
            <Pencil size={11} />
            Edit my schedule
          </button>
        </div>

        {loading ? (
          <div className="bg-[#162032] border border-[#687FA3]/10 sm:rounded-3xl p-10 flex items-center justify-center">
            <div className="w-7 h-7 border-2 border-[#00C8DC] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="bg-[#162032] border border-[#687FA3]/10 sm:rounded-3xl p-10 text-center space-y-2">
            <p className="text-sm text-[#687FA3]">
              No one has set a schedule yet.
            </p>
            <p className="text-xs text-[#687FA3]/60">
              Be the first — tap &quot;Edit my schedule&quot; above.
            </p>
          </div>
        ) : (
          <ScheduleHeatmap
            rows={rows}
            playersById={playersById}
            min={min}
            max={max}
          />
        )}
      </div>
    </div>
  );
}

export default function FindPlayersPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#0E1523]">
          <div className="w-8 h-8 border-2 border-[#00C8DC] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <MembersOnlyGate>
        {(player) => <FindContent player={player} />}
      </MembersOnlyGate>
    </Suspense>
  );
}
