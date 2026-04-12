"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Player } from "@/lib/types";
import PlayerAvatar from "@/components/PlayerAvatar";

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  const fetchPlayers = useCallback(async (q: string) => {
    setLoading(true);
    let query = supabase
      .from("players")
      .select("player_id, name, nickname, image_link")
      .order("name");

    if (q.trim()) {
      query = query.or(
        `name.ilike.%${q}%,nickname.ilike.%${q}%`
      );
    }

    const { data } = await query;
    setPlayers(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPlayers(debouncedSearch);
  }, [debouncedSearch, fetchPlayers]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="font-display text-4xl text-white italic mb-1">Players</h1>
        <p className="text-sec text-sm">All Padel League Philippines members</p>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <input
          type="text"
          placeholder="Search by name or nickname…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-surface border border-bdr rounded-xl px-4 py-3 pr-10 text-sm text-white placeholder-muted focus:outline-none focus:border-accent transition-colors"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted text-sm">
          🔍
        </span>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="bg-surface border border-bdr rounded-xl p-4 animate-pulse h-28"
            />
          ))}
        </div>
      ) : players.length === 0 ? (
        <div className="text-center py-16 text-sec">
          No players found{search ? ` for "${search}"` : ""}.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {players.map((p) => (
            <Link
              key={p.player_id}
              href={`/players/${p.player_id}`}
              className="group bg-surface border border-bdr hover:border-accent/50 rounded-xl p-4 flex flex-col items-center text-center transition-colors"
            >
              <PlayerAvatar
                name={p.name}
                imageLink={p.image_link}
                size={64}
                className="mb-3"
              />
              <div className="text-sm font-medium text-white group-hover:text-accent transition-colors truncate w-full">
                {p.name}
              </div>
              {p.nickname && (
                <div className="text-xs text-muted mt-0.5">"{p.nickname}"</div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
