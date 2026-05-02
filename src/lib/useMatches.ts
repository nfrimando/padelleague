"use client";

import { useEffect, useState } from "react";
import {
  assembleMatchesWithTeamsAndSets,
  buildPreMatchRatingLookup,
  groupByMatchId,
  MatchRatingRow,
  MatchRow,
  MatchTeamRow,
} from "@/lib/matchAssembly";
import { supabase } from "@/lib/supabase";
import { MatchSet, MatchWithTeams } from "@/lib/types";

const MATCH_ID_CHUNK_SIZE = 100;

const chunkMatchIds = (matchIds: Array<string | number>) => {
  const chunks: Array<Array<string | number>> = [];
  for (let i = 0; i < matchIds.length; i += MATCH_ID_CHUNK_SIZE) {
    chunks.push(matchIds.slice(i, i + MATCH_ID_CHUNK_SIZE));
  }
  return chunks;
};

type UseMatchesOptions = {
  limit?: number;
  dateGte?: string;
  dateLte?: string;
};

export function useMatches(options: UseMatchesOptions = {}, enabled = true) {
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
        const limit =
          Number.isFinite(options.limit) && (options.limit ?? 0) > 0
            ? Math.floor(options.limit as number)
            : undefined;

        let query = supabase
          .from("matches")
          .select("*")
          .order("date_local", { ascending: false, nullsFirst: false })
          .order("time_local", { ascending: false, nullsFirst: false })
          .order("event_id", { ascending: false, nullsFirst: false })
          .order("match_id", { ascending: false });

        if (options.dateGte) {
          query = query.gte("date_local", options.dateGte);
        }

        if (options.dateLte) {
          query = query.lte("date_local", options.dateLte);
        }

        if (limit) {
          query = query.limit(limit);
        }

        const { data: matchesData, error: matchesError } = await query;

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

        const teamsByMatchId = groupByMatchId(typedTeamsData);
        const setsByMatchId = groupByMatchId(typedSetsData);
        const ratingLookup = buildPreMatchRatingLookup(typedRatingsData);
        const nextMatches: MatchWithTeams[] = assembleMatchesWithTeamsAndSets({
          matches: typedMatchesData,
          teamsByMatchId,
          setsByMatchId,
          ratingLookup,
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
  }, [enabled, options.dateGte, options.dateLte, options.limit]);

  return {
    matches,
    loading,
    error,
  };
}
