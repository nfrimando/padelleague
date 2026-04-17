import Link from "next/link";
import { Crown } from "lucide-react";
import { formatMatchDate } from "@/lib/utils";

export type TopPlayersTableRow = {
  player_id: string | number;
  name: string;
  nickname?: string | null;
  image_link?: string | null;
  latest_match_date?: string | null;
  wins: number;
  sets_won?: number;
  sets_lost?: number;
  matches_played: number;
  latest_rating: number | null;
};

interface TopPlayersTableProps {
  rows: TopPlayersTableRow[];
  loading?: boolean;
  emptyMessage?: string;
}

export default function TopPlayersTable({
  rows,
  loading = false,
  emptyMessage = "No ranking data available.",
}: TopPlayersTableProps) {
  return (
    <div className="bg-[#162032]/50 border border-[#687FA3]/10 rounded-3xl overflow-hidden backdrop-blur-sm">
      {loading ? (
        <div className="p-12 flex items-center justify-center">
          <span className="text-[#687FA3] text-sm font-bold uppercase tracking-widest animate-pulse">
            Loading rankings...
          </span>
        </div>
      ) : rows.length === 0 ? (
        <div className="p-12 text-center text-[#687FA3] text-sm font-medium">
          {emptyMessage}
        </div>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-[#687FA3]/10 text-[#687FA3] text-[10px] font-black tracking-[0.2em] uppercase">
              <th className="px-6 md:px-8 py-5">#</th>
              <th className="px-6 md:px-8 py-5">Player</th>
              <th className="px-6 md:px-8 py-5 text-center hidden sm:table-cell">
                W
              </th>
              <th className="px-6 md:px-8 py-5 text-center hidden sm:table-cell">
                Played
              </th>
              <th className="px-6 md:px-8 py-5 text-center hidden md:table-cell">
                SW
              </th>
              <th className="px-6 md:px-8 py-5 text-center hidden md:table-cell">
                SL
              </th>
              <th className="px-6 md:px-8 py-5 text-right">Rating</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((player, index) => (
              <tr
                key={String(player.player_id)}
                className="border-b border-[#687FA3]/5 hover:bg-[#00C8DC]/5 transition-colors"
              >
                <td className="px-6 md:px-8 py-5 font-black text-[#00C8DC] italic text-lg">
                  {index === 0 ? (
                    <Crown className="w-5 h-5 text-amber-400 inline" />
                  ) : (
                    index + 1
                  )}
                </td>
                <td className="px-6 md:px-8 py-5">
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={player.image_link || "/default-avatar.webp"}
                      alt={player.name}
                      className="w-8 h-8 rounded-full object-cover border border-[#687FA3]/30 shrink-0"
                    />
                    <div className="min-w-0">
                      <Link
                        href={`/players?playerId=${encodeURIComponent(String(player.player_id))}`}
                        className="font-bold hover:text-[#00C8DC] transition-colors truncate block"
                      >
                        {player.name}
                      </Link>
                      {player.latest_match_date && (
                        <div className="hidden lg:block text-[10px] text-[#687FA3] truncate">
                          Last Match:{" "}
                          {formatMatchDate(player.latest_match_date)}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-6 md:px-8 py-5 text-center text-[#687FA3] font-mono hidden sm:table-cell">
                  {player.wins}
                </td>
                <td className="px-6 md:px-8 py-5 text-center text-[#687FA3] font-mono hidden sm:table-cell">
                  {player.matches_played}
                </td>
                <td className="px-6 md:px-8 py-5 text-center text-[#687FA3] font-mono hidden md:table-cell">
                  {player.sets_won ?? "–"}
                </td>
                <td className="px-6 md:px-8 py-5 text-center text-[#687FA3] font-mono hidden md:table-cell">
                  {player.sets_lost ?? "–"}
                </td>
                <td className="px-6 md:px-8 py-5 text-right font-mono font-black text-[#00C8DC] tracking-tighter">
                  {player.latest_rating !== null ? (
                    <span className="bg-[#00C8DC]/10 px-3 py-1 rounded-md">
                      {player.latest_rating.toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-[#687FA3]">–</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
