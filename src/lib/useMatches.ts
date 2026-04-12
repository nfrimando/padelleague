"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { MatchSet, MatchWithTeams, Player } from "@/lib/types";

type MatchTeamRow = {
  uuid: string;
  match_id: number;
  team_number: number | null;
  sets_won: number | null;
  player_1: Player | null;
  player_2: Player | null;
};

type MatchRow = Omit<MatchWithTeams, "teams" | "sets">;

type MatchRatingRow = {
  match_id: number;
  player_id: string;
  rating_pre: number | null;
  formula_name: string | null;
};

type RatingEntry = {
  rating: number;
  formula: string;
  priority: number;
};

const normalizeId = (value: string | number | null | undefined) =>
  String(value ?? "");

const MATCH_ID_CHUNK_SIZE = 100;

const chunkMatchIds = (matchIds: Array<string | number>) => {
  const chunks: Array<Array<string | number>> = [];
  for (let i = 0; i < matchIds.length; i += MATCH_ID_CHUNK_SIZE) {
    chunks.push(matchIds.slice(i, i + MATCH_ID_CHUNK_SIZE));
  }
  return chunks;
};

export function useMatches(limit = 10, enabled = true) {
  const [matches, setMatches] = useState<MatchWithTeams[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setMatches([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    async function loadMatches() {
      setLoading(true);
      setError(null);

      try {
        const safeLimit =
          Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 10;

        const { data: matchesData, error: matchesError } = await supabase
          .from("matches")
          .select("*")
          .order("date_local", { ascending: false, nullsFirst: false })
          .order("time_local", { ascending: false, nullsFirst: false })
          .order("season_id", { ascending: false, nullsFirst: false })
          .order("match_id", { ascending: false })
          .limit(safeLimit);

        if (matchesError) {
          throw new Error(matchesError.message || "Failed to load matches.");
        }

        const typedMatchesData = (matchesData || []) as MatchRow[];
        const matchIds = typedMatchesData.map((match) => match.match_id);

        if (matchIds.length === 0) {
          if (!cancelled) {
            setMatches([]);
          }
          return;
        }

        const idChunks = chunkMatchIds(matchIds);
        const teamsAccumulator: MatchTeamRow[] = [];
        const setsAccumulator: MatchSet[] = [];
        const ratingsAccumulator: MatchRatingRow[] = [];

        for (const idChunk of idChunks) {
          const [{ data: teamsData, error: teamsError }, { data: setsData, error: setsError }, { data: ratingsData, error: ratingsError }] = await Promise.all([
            supabase
              .from("match_teams")
              .select(
                "*, player_1:player_1_id(player_id,name,nickname,image_link), player_2:player_2_id(player_id,name,nickname,image_link)",
              )
              .in("match_id", idChunk),
            supabase
              .from("match_sets")
              .select("*")
              .in("match_id", idChunk)
              .order("set_number", { ascending: true }),
            supabase
              .from("match_player_ratings")
              .select("match_id, player_id, rating_pre, formula_name")
              .in("match_id", idChunk),
          ]);

          if (teamsError) {
            throw new Error(teamsError.message || "Failed to load match teams.");
          }
          if (setsError) {
            throw new Error(setsError.message || "Failed to load match sets.");
          }
          if (ratingsError) {
            throw new Error(
              ratingsError.message || "Failed to load match player ratings.",
            );
          }

          teamsAccumulator.push(...((teamsData || []) as MatchTeamRow[]));
          setsAccumulator.push(...((setsData || []) as MatchSet[]));
          ratingsAccumulator.push(...((ratingsData || []) as MatchRatingRow[]));
        }

        const typedTeamsData = teamsAccumulator;
        const typedSetsData = setsAccumulator;
        const typedRatingsData = ratingsAccumulator;

        const teamsByMatchId = new Map<string, MatchTeamRow[]>();
        for (const team of typedTeamsData) {
          const key = normalizeId(team.match_id);
          const existing = teamsByMatchId.get(key);
          if (existing) {
            existing.push(team);
          } else {
            teamsByMatchId.set(key, [team]);
          }
        }

        const setsByMatchId = new Map<string, MatchSet[]>();
        for (const set of typedSetsData) {
          const key = normalizeId(set.match_id);
          const existing = setsByMatchId.get(key);
          if (existing) {
            existing.push(set);
          } else {
            setsByMatchId.set(key, [set]);
          }
        }

        // Build rating lookup with formula priority (v3 > v2 > others)
        const ratingLookup = new Map<string, RatingEntry>();
        for (const row of typedRatingsData) {
          const matchId = Number(row.match_id);
          const rating = Number(row.rating_pre);
          const formula = String(row.formula_name || "").toLowerCase();
          const normalizedPlayerId = String(row.player_id || "");

          if (
            !Number.isFinite(matchId) ||
            !Number.isFinite(rating) ||
            !normalizedPlayerId
          ) {
            continue;
          }

          const priority = formula === "v3" ? 2 : formula === "v2" ? 1 : 0;
          const key = `${normalizeId(matchId)}:${normalizedPlayerId}`;
          const existing = ratingLookup.get(key);

          if (!existing || priority >= existing.priority) {
            ratingLookup.set(key, { rating, formula, priority });
          }
        }

        const attachPreMatchRating = (
          matchId: string | number,
          player: Player | null,
        ) => {
          if (!player) {
            return null;
          }

          const key = `${normalizeId(matchId)}:${normalizeId(player.player_id)}`;
          const ratingEntry = ratingLookup.get(key);

          if (!ratingEntry) {
            return player;
          }

          return {
            ...player,
            pre_match_rating: ratingEntry.rating,
            pre_match_rating_formula: ratingEntry.formula,
          };
        };

        const nextMatches: MatchWithTeams[] = typedMatchesData.map((match) => {
          const matchKey = normalizeId(match.match_id);
          const teamsForMatch = teamsByMatchId.get(matchKey) || [];
          const setsForMatch = setsByMatchId.get(matchKey) || [];

          return {
            ...match,
            teams: teamsForMatch.map((team) => ({
              uuid: team.uuid,
              team_number: team.team_number,
              sets_won: team.sets_won,
              player_1: attachPreMatchRating(match.match_id, team.player_1),
              player_2: attachPreMatchRating(match.match_id, team.player_2),
            })),
            sets: setsForMatch,
          };
        });

        if (!cancelled) {
          setMatches(nextMatches);
        }
      } catch (loadError) {
        if (!cancelled) {
          setMatches([]);
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Failed to load matches.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadMatches();

    return () => {
      cancelled = true;
    };
  }, [enabled, limit]);

  return {
    matches,
    loading,
    error,
  };
}
