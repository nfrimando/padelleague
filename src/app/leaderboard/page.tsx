"use client";

import { useEffect, useState } from "react";
import BackToHome from "@/components/BackToHome";
import PlayerCard from "@/components/PlayerCard";
import { supabase } from "@/lib/supabase";
import { Player } from "@/lib/types";

type LeaderboardRow = {
  player_id: number;
  name: string;
  matches_played: number;
  wins: number;
  sets_won: number;
  sets_lost: number;
  win_rate: number;
};

const ALL_TYPES = "ALL";
const ALL_SEASONS = "ALL";
const MIN_MATCHES = 5;
const MAX_LEADERBOARD_ROWS = 20;

export default function LeaderboardPage() {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [topPlayersById, setTopPlayersById] = useState<Map<number, Player>>(
    new Map(),
  );
  const [seasonFilter, setSeasonFilter] = useState<
    number | typeof ALL_SEASONS | null
  >(null);
  const [seasons, setSeasons] = useState<number[]>([]);
  const [availableTypes, setAvailableTypes] = useState<string[]>([]);
  const [selectedType, setSelectedType] = useState<string>(ALL_TYPES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadFilterOptions() {
      const { data, error: filterError } = await supabase
        .from("matches")
        .select("season,type")
        .not("season", "is", null)
        .order("season", { ascending: true });

      if (filterError || !data) {
        setLoading(false);
        setError(filterError?.message || "Failed to load filters.");
        return;
      }

      const uniqueSeasons = Array.from(
        new Set(
          data
            .map((row) => Number(row.season))
            .filter((season) => !Number.isNaN(season)),
        ),
      );

      if (uniqueSeasons.length > 0) {
        setSeasons(uniqueSeasons);
        setSeasonFilter(uniqueSeasons[uniqueSeasons.length - 1]);
      }

      const uniqueTypes = Array.from(
        new Set(
          data
            .map((row) => (row.type ? String(row.type) : null))
            .filter((type): type is string => !!type),
        ),
      ).sort((a, b) => a.localeCompare(b));

      if (uniqueTypes.length > 0) {
        setAvailableTypes(uniqueTypes);
      }

      if (uniqueSeasons.length === 0) {
        setLoading(false);
      }
    }

    loadFilterOptions();
  }, []);

  useEffect(() => {
    async function loadLeaderboard() {
      if (seasonFilter === null) {
        return;
      }

      setLoading(true);
      setError(null);

      const { data, error: rpcError } = await supabase.rpc("get_leaderboard", {
        season_filter: seasonFilter === ALL_SEASONS ? null : seasonFilter,
        type_filter: selectedType === ALL_TYPES ? null : selectedType,
      });

      if (rpcError) {
        setError(rpcError.message || "Failed to load leaderboard.");
        setRows([]);
        setLoading(false);
        return;
      }

      const normalized: LeaderboardRow[] = (data || [])
        .map((row: any) => ({
          player_id: Number(row.player_id),
          name: row.name || "Unknown",
          matches_played: Number(row.matches_played || 0),
          wins: Number(row.wins || 0),
          sets_won: Number(row.sets_won || 0),
          sets_lost: Number(row.sets_lost || 0),
          win_rate: Number(row.win_rate || 0),
        }))
        .filter((row: LeaderboardRow) => row.matches_played >= MIN_MATCHES);

      normalized.sort((a: LeaderboardRow, b: LeaderboardRow) => {
        if (b.matches_played !== a.matches_played) {
          return b.matches_played - a.matches_played;
        }
        if (b.wins !== a.wins) {
          return b.wins - a.wins;
        }
        if (b.sets_won !== a.sets_won) {
          return b.sets_won - a.sets_won;
        }
        return a.sets_lost - b.sets_lost;
      });

      const topTenIds = normalized
        .slice(0, 10)
        .map((row: LeaderboardRow) => row.player_id);
      if (topTenIds.length > 0) {
        const { data: playersData, error: playersError } = await supabase
          .from("players")
          .select("player_id,name,nickname,image_link")
          .in("player_id", topTenIds);

        if (!playersError && playersData) {
          const map = new Map<number, Player>();
          playersData.forEach((player) => {
            map.set(Number(player.player_id), {
              player_id: String(player.player_id),
              name: player.name || "Unknown",
              nickname: player.nickname || "-",
              image_link: player.image_link || null,
            });
          });
          setTopPlayersById(map);
        } else {
          setTopPlayersById(new Map());
        }
      } else {
        setTopPlayersById(new Map());
      }

      setRows(normalized);
      setLoading(false);
    }

    loadLeaderboard();
  }, [seasonFilter, selectedType]);

  let previousRow: LeaderboardRow | null = null;
  let currentRank = 0;
  const rankedRows = rows.map((row, index) => {
    if (
      previousRow &&
      row.matches_played === previousRow.matches_played &&
      row.wins === previousRow.wins &&
      row.sets_won === previousRow.sets_won &&
      row.sets_lost === previousRow.sets_lost
    ) {
      // Keep the same rank when matches and wins are tied.
    } else {
      currentRank = index + 1;
    }

    previousRow = row;
    return { ...row, rank: currentRank };
  });

  const rankedRowsWithTop20Ties = (() => {
    if (rankedRows.length <= MAX_LEADERBOARD_ROWS) {
      return rankedRows;
    }

    const baseRows = rankedRows.slice(0, MAX_LEADERBOARD_ROWS);
    const boundary = baseRows[baseRows.length - 1];
    const extraTies = rankedRows.slice(MAX_LEADERBOARD_ROWS).filter((row) => {
      return (
        row.matches_played === boundary.matches_played &&
        row.wins === boundary.wins &&
        row.sets_won === boundary.sets_won &&
        row.sets_lost === boundary.sets_lost
      );
    });

    return [...baseRows, ...extraTies];
  })();

  return (
    <>
      <BackToHome />
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">Leaderboard</h1>
        <p className="text-sm text-slate-500 mb-4">
          Only players with {MIN_MATCHES} matches or more are included.
        </p>
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <label className="text-sm text-slate-500" htmlFor="season-filter">
            Season:
          </label>
          <select
            id="season-filter"
            value={seasonFilter ?? ""}
            onChange={(e) => {
              const value = e.target.value;
              setSeasonFilter(
                value === ALL_SEASONS ? ALL_SEASONS : Number(value),
              );
            }}
            className="border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-sm bg-white dark:bg-slate-900"
          >
            <option value={ALL_SEASONS}>ALL</option>
            {seasons.map((season) => (
              <option key={season} value={season}>
                {season}
              </option>
            ))}
          </select>

          <label className="text-sm text-slate-500" htmlFor="type-filter">
            Type:
          </label>
          <select
            id="type-filter"
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-sm bg-white dark:bg-slate-900"
          >
            <option value={ALL_TYPES}>ALL</option>
            {availableTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        {loading && (
          <div className="text-slate-600">Loading leaderboard...</div>
        )}

        {!loading && error && (
          <div className="text-red-600 dark:text-red-400">Error: {error}</div>
        )}

        {!loading && !error && rows.length === 0 && (
          <div className="text-slate-600">No leaderboard data found.</div>
        )}

        {!loading && !error && rows.length > 0 && (
          <div className="overflow-x-auto border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 dark:bg-slate-800">
                <tr>
                  <th className="text-left px-4 py-3">Rank</th>
                  <th className="text-left px-4 py-3">Player</th>
                  <th className="text-right px-4 py-3">Matches</th>
                  <th className="text-right px-4 py-3">Wins</th>
                  <th className="text-right px-4 py-3">Sets Won</th>
                  <th className="text-right px-4 py-3">Sets Lost</th>
                  <th className="text-right px-4 py-3">Win Rate</th>
                </tr>
              </thead>
              <tbody>
                {rankedRowsWithTop20Ties.map((row, index) => (
                  <tr
                    key={row.player_id}
                    className={`border-t border-slate-200 dark:border-slate-700 ${
                      row.rank === 1
                        ? "bg-amber-50 dark:bg-amber-900/20"
                        : ""
                    }`}
                  >
                    <td className="px-4 py-3 font-semibold">#{row.rank}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {index < 10 ? (
                          <PlayerCard
                            player={
                              topPlayersById.get(row.player_id) || {
                                player_id: String(row.player_id),
                                name: row.name,
                                nickname: "-",
                                image_link: null,
                              }
                            }
                          />
                        ) : (
                          row.name
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {index < 10 ? (
                        <div className="inline-flex flex-col items-end leading-tight">
                          <span className="text-[10px] text-slate-500 dark:text-slate-400">
                            Matches
                          </span>
                          <span className="text-base font-semibold bg-gradient-to-r from-slate-700 to-slate-500 dark:from-slate-100 dark:to-slate-300 bg-clip-text text-transparent">
                            {row.matches_played}
                          </span>
                        </div>
                      ) : (
                        row.matches_played
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {index < 10 ? (
                        <div className="inline-flex flex-col items-end leading-tight">
                          <span className="text-[10px] text-slate-500 dark:text-slate-400">
                            Wins
                          </span>
                          <span className="text-base font-semibold bg-gradient-to-r from-emerald-600 to-lime-500 dark:from-emerald-400 dark:to-lime-300 bg-clip-text text-transparent">
                            {row.wins}
                          </span>
                        </div>
                      ) : (
                        row.wins
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {index < 10 ? (
                        <div className="inline-flex flex-col items-end leading-tight">
                          <span className="text-[10px] text-slate-500 dark:text-slate-400">
                            Sets Won
                          </span>
                          <span className="text-base font-semibold bg-gradient-to-r from-indigo-600 to-violet-500 dark:from-indigo-400 dark:to-violet-300 bg-clip-text text-transparent">
                            {row.sets_won}
                          </span>
                        </div>
                      ) : (
                        row.sets_won
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {index < 10 ? (
                        <div className="inline-flex flex-col items-end leading-tight">
                          <span className="text-[10px] text-slate-500 dark:text-slate-400">
                            Sets Lost
                          </span>
                          <span className="text-base font-semibold bg-gradient-to-r from-rose-600 to-orange-500 dark:from-rose-400 dark:to-orange-300 bg-clip-text text-transparent">
                            {row.sets_lost}
                          </span>
                        </div>
                      ) : (
                        row.sets_lost
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {index < 10 ? (
                        <div className="inline-flex flex-col items-end leading-tight">
                          <span className="text-[10px] text-slate-500 dark:text-slate-400">
                            Win Rate
                          </span>
                          <span className="text-base font-semibold bg-gradient-to-r from-amber-500 to-yellow-400 dark:from-amber-300 dark:to-yellow-200 bg-clip-text text-transparent">
                            {(row.win_rate * 100).toFixed(1)}%
                          </span>
                        </div>
                      ) : (
                        `${(row.win_rate * 100).toFixed(1)}%`
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
