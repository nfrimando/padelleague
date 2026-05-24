"use client";

import { useRef, useEffect } from "react";
import Link from "next/link";
import { useSimilarPlayers, SimilarPlayer } from "@/lib/useSimilarPlayers";

function relativeDate(dateStr: string | null): string {
  if (!dateStr) return "no matches";
  const days = Math.floor(
    (Date.now() - new Date(`${dateStr}T00:00:00`).getTime()) / 86_400_000,
  );
  if (days === 0) return "today";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function SkeletonCards() {
  return (
    <>
      {Array.from({ length: 9 }).map((_, i) => (
        <div
          key={i}
          className="w-16 flex-shrink-0 flex flex-col items-center gap-1.5"
        >
          <div className="h-12 w-12 rounded-full bg-[#1a2540] animate-pulse" />
          <div className="h-2.5 w-12 rounded bg-[#1a2540] animate-pulse" />
          <div className="h-2 w-8 rounded bg-[#1a2540] animate-pulse" />
        </div>
      ))}
    </>
  );
}

function CurrentPlayerCard({ player }: { player: SimilarPlayer }) {
  const hasCustomImage = !!(player.image_link && player.image_link !== "null");
  const imageSrc = hasCustomImage ? player.image_link! : "/default-avatar.webp";

  return (
    <div className="w-24 flex-shrink-0 flex flex-col items-center gap-1.5">
      <img
        src={imageSrc}
        alt={player.name || "You"}
        className="h-20 w-20 rounded-full object-cover ring-2 ring-sky-500"
      />
      <span className="text-[9px] uppercase tracking-widest text-sky-400 font-black leading-none">
        You
      </span>
      <div className="text-base font-bold tabular-nums text-sky-300 leading-none">
        {player.latestRating.toFixed(2)}
      </div>
      <div className="text-xs text-slate-100 text-center line-clamp-1 w-20 leading-snug">
        {player.name ?? "—"}
      </div>
    </div>
  );
}

function PeerCard({ player }: { player: SimilarPlayer }) {
  const hasCustomImage = !!(player.image_link && player.image_link !== "null");
  const imageSrc = hasCustomImage ? player.image_link! : "/default-avatar.webp";

  return (
    <Link
      href={`/players/${player.id}`}
      className="w-16 flex-shrink-0 flex flex-col items-center gap-1 group focus-visible:outline-none"
    >
      <img
        src={imageSrc}
        alt={player.name || "Player"}
        className="h-12 w-12 rounded-full object-cover ring-1 ring-white/10 group-hover:ring-sky-500/60 transition-all"
      />
      <div className="text-xs font-semibold tabular-nums text-sky-300 leading-none">
        {player.latestRating.toFixed(2)}
      </div>
      <div className="text-[11px] text-slate-300 text-center line-clamp-1 w-16 leading-snug">
        {player.name ?? "—"}
      </div>
      <div className="text-[10px] text-slate-500 leading-none">
        {relativeDate(player.lastMatchDate)}
      </div>
    </Link>
  );
}

type Props = {
  playerId: string | number | null;
  currentPlayerRating: number | null;
};

export default function SimilarPlayersSection({ playerId }: Props) {
  const { players, currentPlayerIndex, loading } = useSimilarPlayers(playerId);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentCardRef = useRef<HTMLDivElement>(null);

  // Hook returns players sorted descending (highest first).
  // Reverse for display so lowest rating is on the left and highest on the right.
  const displayPlayers = [...players].reverse();
  const displayIndex =
    currentPlayerIndex >= 0
      ? players.length - 1 - currentPlayerIndex
      : -1;

  useEffect(() => {
    if (loading) return;
    const raf = requestAnimationFrame(() => {
      if (!containerRef.current || !currentCardRef.current) return;
      const container = containerRef.current;
      const card = currentCardRef.current;
      // Attempt to center; browser naturally clamps to [0, maxScrollLeft].
      container.scrollLeft =
        card.offsetLeft - container.clientWidth / 2 + card.offsetWidth / 2;
    });
    return () => cancelAnimationFrame(raf);
  }, [loading]);

  return (
    <section className="bg-[#162032] border border-[#687FA3]/10 sm:rounded-3xl overflow-hidden">
      <div className="px-6 pt-5 pb-3">
        <h2 className="text-xs font-black uppercase tracking-widest text-[#687FA3]">
          Similar Level
        </h2>
        <p className="mt-0.5 text-[10px] text-slate-600">
          ← lower rating · ±24 player range · higher rating →
        </p>
      </div>

      <div
        ref={containerRef}
        className="relative overflow-x-auto"
        style={{
          scrollbarWidth: "none",
          paddingTop: "12px",
          paddingBottom: "20px",
          paddingLeft: "24px",
          paddingRight: "24px",
          WebkitMaskImage:
            "linear-gradient(to right, transparent 0%, black 56px, black calc(100% - 56px), transparent 100%)",
          maskImage:
            "linear-gradient(to right, transparent 0%, black 56px, black calc(100% - 56px), transparent 100%)",
        }}
      >
        <div className="flex gap-4 items-center">
          {loading ? (
            <SkeletonCards />
          ) : (
            displayPlayers.map((player, idx) => {
              if (idx === displayIndex) {
                return (
                  <div key={player.id} ref={currentCardRef}>
                    <CurrentPlayerCard player={player} />
                  </div>
                );
              }
              return <PeerCard key={player.id} player={player} />;
            })
          )}
        </div>
      </div>
    </section>
  );
}
