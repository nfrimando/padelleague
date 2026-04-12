"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  PlayerProfile,
  Match,
  SeasonFilter,
  TypeFilter,
} from "@/lib/types";
import PlayerAvatar from "@/components/PlayerAvatar";
import Sparkline from "@/components/Sparkline";
import MatchFiltersCard from "@/components/MatchFiltersCard";
import MatchCard from "@/components/MatchCard";

export default function PlayerProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [season, setSeason] = useState<SeasonFilter>("ALL");
  const [type, setType] = useState<TypeFilter>("ALL");

  useEffect(() => {
    async function fetchProfile() {
      setLoadingProfile(true);
      try {
        const { data } = await supabase.rpc("get_player_profile", {
          p_player_id: id,
        });
        setProfile(data?.[0] ?? null);
      } catch {
        // fallback to basic query
        const { data } = await supabase
          .from("players")
          .select("*")
          .eq("player_id", id)
          .single();
        if (data) setProfile({ ...data, current_rating: 0, first_season: "", last_season: "", matches_played: 0, wins: 0, losses: 0, win_pct: 0, sets_won: 0, sets_lost: 0, last_match_date: "", most_played_partners: [], rating_trend: [] });
      }
      setLoadingProfile(false);
    }
    fetchProfile();
  }, [id]);

  useEffect(() => {
    async function fetchMatches() {
      setLoadingMatches(true);
      let query = supabase
        .from("matches")
        .select(`
          *,
          match_teams (
            *,
            player1:players!match_teams_player1_id_fkey (player_id, name, nickname, image_link),
            player2:players!match_teams_player2_id_fkey (player_id, name, nickname, image_link)
          ),
          match_sets (*)
        `)
        .order("match_date", { ascending: false })
        .limit(20);

      if (season !== "ALL") query = query.eq("season_id", season);
      if (type !== "ALL") query = query.eq("match_type", type);

      const { data } = await query;

      // Filter to only matches involving this player
      const playerMatches = (data || []).filter((m) =>
        m.match_teams?.some(
          (t: { player1_id: string; player2_id?: string }) =>
            t.player1_id === id || t.player2_id === id
        )
      );

      setMatches(playerMatches);
      setLoadingMatches(false);
    }
    fetchMatches();
  }, [id, season, type]);

  if (loadingProfile) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-surface border border-bdr rounded-xl h-24 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center text-sec">
        Player not found.
      </div>
    );
  }

  const winRateColor =
    profile.win_pct >= 50 ? "text-accent" : "text-sec";

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      {/* Profile card */}
      <div className="bg-surface border border-bdr rounded-xl p-6">
        <div className="flex items-start gap-5">
          <PlayerAvatar
            name={profile.name}
            imageLink={profile.image_link}
            size={80}
            className="ring-2 ring-accent/40"
          />

          <div className="flex-1 min-w-0">
            <h1 className="font-display text-3xl text-white italic">
              {profile.name}
            </h1>
            {profile.nickname && (
              <p className="text-sec text-sm mt-0.5">"{profile.nickname}"</p>
            )}
            {profile.last_match_date && (
              <p className="text-xs text-muted mt-1">
                Last played:{" "}
                {new Date(profile.last_match_date).toLocaleDateString("en-PH", {
                  month: "short", day: "numeric", year: "numeric",
                })}
              </p>
            )}
          </div>

          {/* Rating + sparkline */}
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <div className="w-14 h-14 rounded-full bg-accent-dim border-2 border-accent flex items-center justify-center">
                <span className="font-mono text-accent font-semibold text-lg">
                  {profile.current_rating?.toFixed(2) ?? "—"}
                </span>
              </div>
            </div>
            {profile.rating_trend?.length >= 2 && (
              <Sparkline values={profile.rating_trend} width={80} height={28} />
            )}
          </div>
        </div>

        {/* 6-stat row */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mt-6 pt-4 border-t border-bdr">
          {[
            { label: "Matches", value: profile.matches_played, cls: "text-white" },
            { label: "Wins", value: profile.wins, cls: "text-accent" },
            { label: "Losses", value: profile.losses, cls: "text-loss" },
            {
              label: "Win Rate",
              value: `${(profile.win_pct * 100).toFixed(0)}%`,
              cls: winRateColor,
            },
            { label: "First Season", value: profile.first_season, cls: "text-sec" },
            { label: "Last Season", value: profile.last_season, cls: "text-sec" },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <div className={`font-mono font-semibold text-lg ${s.cls}`}>
                {s.value ?? "—"}
              </div>
              <div className="text-xs text-muted mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Most played partners */}
        {profile.most_played_partners?.length > 0 && (
          <div className="mt-4 pt-4 border-t border-bdr">
            <p className="text-xs text-muted mb-2 uppercase tracking-wider">
              Most Played Partners
            </p>
            <div className="flex flex-wrap gap-2">
              {profile.most_played_partners.map((p) => (
                <span
                  key={p.player_id}
                  className="bg-elevated border border-bdr rounded-full px-3 py-1 text-sm text-white flex items-center gap-1.5"
                >
                  {p.name}
                  <span className="font-mono text-accent text-xs">{p.count}x</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
      <MatchFiltersCard
        season={season}
        type={type}
        onSeasonChange={setSeason}
        onTypeChange={setType}
        loading={loadingMatches}
      />

      {/* Match history */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">
          Match History
        </h2>
        {loadingMatches ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-surface border border-bdr rounded-xl h-32 animate-pulse" />
          ))
        ) : matches.length === 0 ? (
          <div className="text-center py-10 text-sec text-sm">
            No matches found.
          </div>
        ) : (
          matches.map((m) => (
            <MatchCard key={m.match_id} match={m} highlightPlayerId={id} />
          ))
        )}
      </div>
    </div>
  );
}
