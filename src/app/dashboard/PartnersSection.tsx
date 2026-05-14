"use client";

import Link from "next/link";
import { Users } from "lucide-react";
import type { PartnerStat } from "@/lib/useDashboardStats";

type Props = {
  partnerStats: PartnerStat[];
  loading: boolean;
};

function PartnerRow({
  stat,
  rank,
}: {
  stat: PartnerStat;
  rank: number;
}) {
  const { player, wins, losses, winRate, matchesPlayed } = stat;
  const href = `/players/${encodeURIComponent(String(player.player_id))}`;

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-[#687FA3]/5 last:border-0">
      {/* Rank */}
      <span className="text-[10px] font-black text-[#687FA3] w-4 text-center shrink-0">
        {rank}
      </span>

      {/* Avatar */}
      <Link href={href} className="shrink-0">
        {player.image_link ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={player.image_link}
            alt={player.name}
            className="w-8 h-8 rounded-full object-cover border border-[#687FA3]/20"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-[#162032] border border-[#687FA3]/20 flex items-center justify-center">
            <Users size={12} className="text-[#687FA3]" />
          </div>
        )}
      </Link>

      {/* Name */}
      <Link
        href={href}
        className="flex-1 min-w-0 font-bold text-sm text-white hover:text-[#00C8DC] transition-colors truncate"
      >
        {player.nickname || player.name}
      </Link>

      {/* Stats */}
      <div className="text-right shrink-0 space-y-0.5">
        <p className="text-xs font-bold text-white/80">
          {wins}W–{losses}L
          <span className="text-[#687FA3] ml-1 font-normal">
            ({matchesPlayed})
          </span>
        </p>
        <p className="text-[10px] text-[#687FA3]">{winRate}% win rate</p>
      </div>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  stats,
  empty,
}: {
  title: string;
  subtitle: string;
  stats: PartnerStat[];
  empty: string;
}) {
  return (
    <div className="bg-[#1a2540] border border-[#687FA3]/10 rounded-2xl p-4">
      <div className="mb-3">
        <p className="text-xs font-black text-white">{title}</p>
        <p className="text-[10px] text-[#687FA3] mt-0.5">{subtitle}</p>
      </div>

      {stats.length === 0 ? (
        <p className="text-[#687FA3] text-xs py-2">{empty}</p>
      ) : (
        <div>
          {stats.map((stat, i) => (
            <PartnerRow key={String(stat.player.player_id)} stat={stat} rank={i + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function PartnersSection({ partnerStats, loading }: Props) {
  // Best partners: highest win % (min 2 matches together)
  const bestPartners = [...partnerStats]
    .filter((s) => s.matchesPlayed >= 2)
    .sort((a, b) => b.winRate - a.winRate || b.matchesPlayed - a.matchesPlayed)
    .slice(0, 3);

  // Most common: most matches together
  const mostCommon = [...partnerStats]
    .sort((a, b) => b.matchesPlayed - a.matchesPlayed)
    .slice(0, 3);

  const hasData = partnerStats.length > 0;

  return (
    <div className="bg-[#162032] border border-[#687FA3]/10 sm:rounded-3xl p-6 space-y-5">
      <div className="border-b border-[#687FA3]/10 pb-4">
        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#687FA3]">
          Partners
        </span>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="bg-[#1a2540] rounded-2xl h-36 animate-pulse"
            />
          ))}
        </div>
      ) : !hasData ? (
        <p className="text-[#687FA3] text-sm py-4">
          Not enough match history to compute partner stats.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Panel
            title="Best Partners"
            subtitle="Highest win rate together (min 2)"
            stats={bestPartners}
            empty="Not enough shared matches yet"
          />
          <Panel
            title="Most Common"
            subtitle="Most matches played together"
            stats={mostCommon}
            empty="No partners found"
          />
        </div>
      )}
    </div>
  );
}
