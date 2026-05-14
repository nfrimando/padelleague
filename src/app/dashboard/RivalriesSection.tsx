"use client";

import Link from "next/link";
import { Users } from "lucide-react";
import type { OpponentStat } from "@/lib/useDashboardStats";

type Props = {
  opponentStats: OpponentStat[];
  loading: boolean;
};

function PlayerRow({ stat }: { stat: OpponentStat }) {
  const { player, wins, losses, winRate, matchesPlayed } = stat;
  const href = `/players/${encodeURIComponent(String(player.player_id))}`;

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-[#687FA3]/5 last:border-0">
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
          <div className="w-8 h-8 rounded-full bg-[#1a2540] border border-[#687FA3]/20 flex items-center justify-center">
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
        <p className="text-[10px] text-[#687FA3]">{winRate}%</p>
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
  stats: OpponentStat[];
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
          {stats.map((stat) => (
            <PlayerRow key={String(stat.player.player_id)} stat={stat} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function RivalriesSection({ opponentStats, loading }: Props) {
  // Biggest rival: most matches (min 2)
  const biggestRival = [...opponentStats]
    .filter((s) => s.matchesPlayed >= 2)
    .sort((a, b) => b.matchesPlayed - a.matchesPlayed)
    .slice(0, 3);

  // Nemesis: lowest win % (min 2 matches)
  const nemesis = [...opponentStats]
    .filter((s) => s.matchesPlayed >= 2)
    .sort((a, b) => a.winRate - b.winRate)
    .slice(0, 3);

  // Favorite matchup: highest win % (min 2 matches)
  const favorite = [...opponentStats]
    .filter((s) => s.matchesPlayed >= 2)
    .sort((a, b) => b.winRate - a.winRate)
    .slice(0, 3);

  // Unfinished business: 40–60% win rate, min 3 matches
  const unfinished = [...opponentStats]
    .filter((s) => s.matchesPlayed >= 3 && s.winRate >= 40 && s.winRate <= 60)
    .sort((a, b) => b.matchesPlayed - a.matchesPlayed)
    .slice(0, 3);

  const hasAnyData = opponentStats.length > 0;

  return (
    <div className="bg-[#162032] border border-[#687FA3]/10 rounded-3xl p-6 space-y-5">
      <div className="border-b border-[#687FA3]/10 pb-4">
        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#687FA3]">
          Rivalries
        </span>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-[#1a2540] rounded-2xl h-36 animate-pulse"
            />
          ))}
        </div>
      ) : !hasAnyData ? (
        <p className="text-[#687FA3] text-sm py-4">
          Not enough match history to compute rivalries.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Panel
            title="Biggest Rival"
            subtitle="Most matches faced"
            stats={biggestRival}
            empty="Not enough opponents yet"
          />
          <Panel
            title="Nemesis"
            subtitle="Lowest win rate (min 2)"
            stats={nemesis}
            empty="No qualifying opponents"
          />
          <Panel
            title="Favorite Matchup"
            subtitle="Highest win rate (min 2)"
            stats={favorite}
            empty="No qualifying opponents"
          />
          <Panel
            title="Unfinished Business"
            subtitle="40–60% win rate, min 3 matches"
            stats={unfinished}
            empty="No close rivalries yet"
          />
        </div>
      )}
    </div>
  );
}
