"use client";

import { useEffect, useState } from "react";
import {
  assembleMatchesWithTeamsAndSets,
  buildPreMatchRatingLookup,
  groupByMatchId,
  MatchRow,
  MatchTeamRow,
  normalizeId,
} from "@/lib/matchAssembly";
import { supabase } from "@/lib/supabase";
import { MatchSet, MatchWithTeams } from "@/lib/types";

type RatingHistoryPoint = {
  rating: number;
  date: string | null;
};

const RATING_HISTORY_POINTS = 6;

type MatchRatingRow = {
  match_id: number;
  player_id: string | number;
  rating_pre: number | null;
  rating_post: number | null;
  formula_name: string | null;
};

export function usePlayerMatches(playerId: string | null) {
  const [matches, setMatches] = useState<MatchWithTeams[]>([]);
  const [latestRating, setLatestRating] = useState<number | null>(null);
  const [ratingHistory, setRatingHistory] = useState<RatingHistoryPoint[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!playerId) {
      setMatches([]);
      setLatestRating(null);
      setRatingHistory([]);
      return;
    }

    let isCancelled = false;

    async function fetchPlayerMatches() {
      setLoading(true);

      try {
        // Phase 1: lightweight lookup to find which matches this player was in
        const { data: playerTeamsData, error: playerTeamsError } = await supabase
          .from("match_teams")
          .select("match_id")
          .or(`player_1_id.eq.${playerId},player_2_id.eq.${playerId}`);

        if (playerTeamsError) {
          console.error("Error fetching teams:", playerTeamsError);
          if (!isCancelled) {
            setMatches([]);
            setLatestRating(null);
            setRatingHistory([]);
          }
          return;
        }

        const matchIds = (playerTeamsData || []).map((t) => t.match_id);

        if (matchIds.length === 0) {
          if (!isCancelled) {
            setMatches([]);
            setLatestRating(null);
            setRatingHistory([]);
          }
          return;
        }

        // Phase 2: fetch all remaining data in parallel
        const [
          { data: matchesData, error: matchesError },
          { data: allTeamsData, error: allTeamsError },
          { data: matchSetsData, error: matchSetsError },
          { data: matchRatingsData, error: matchRatingsError },
        ] = await Promise.all([
          supabase
            .from("matches")
            .select("*")
            .in("match_id", matchIds)
            .order("date_local", { ascending: false, nullsFirst: false })
            .order("time_local", { ascending: false }),
          supabase
            .from("match_teams")
            .select(
              "*, player_1:player_1_id(player_id,name,nickname,image_link), player_2:player_2_id(player_id,name,nickname,image_link)",
            )
            .in("match_id", matchIds),
          supabase
            .from("match_sets")
            .select("*")
            .in("match_id", matchIds)
            .order("set_number", { ascending: true }),
          supabase
            .from("match_player_ratings")
            .select("match_id, player_id, rating_pre, rating_post, formula_name")
            .in("match_id", matchIds),
        ]);

        if (matchesError) {
          console.error("Error fetching matches:", matchesError);
          if (!isCancelled) {
            setMatches([]);
            setLatestRating(null);
            setRatingHistory([]);
          }
          return;
        }

        if (allTeamsError) {
          console.error("Error fetching teams:", allTeamsError);
        }
        if (matchSetsError) {
          console.error("Error fetching match sets:", matchSetsError);
        }
        if (matchRatingsError) {
          console.error("Error fetching match player ratings:", matchRatingsError);
        }

        const typedMatchesData = (matchesData || []) as MatchRow[];
        const typedAllTeamsData = (allTeamsData || []) as MatchTeamRow[];
        const typedMatchSetsData = (matchSetsData || []) as MatchSet[];
        const typedMatchRatingsData =
          (matchRatingsData || []) as MatchRatingRow[];

        const ratingLookup = buildPreMatchRatingLookup(typedMatchRatingsData);
        const selectedPlayerRatingPostByMatch = new Map<
          number,
          { ratingPost: number; priority: number }
        >();

        for (const row of typedMatchRatingsData) {
          const matchId = Number(row.match_id);
          const ratingPost = Number(row.rating_post);
          const formula = String(row.formula_name || "").toLowerCase();

          if (!Number.isFinite(matchId)) {
            continue;
          }

          const priority = formula === "v3" ? 2 : formula === "v2" ? 1 : 0;
          const normalizedPlayerId = normalizeId(row.player_id);

          if (
            normalizedPlayerId === playerId &&
            Number.isFinite(ratingPost)
          ) {
            const existingPost = selectedPlayerRatingPostByMatch.get(matchId);
            if (!existingPost || priority >= existingPost.priority) {
              selectedPlayerRatingPostByMatch.set(matchId, {
                ratingPost,
                priority,
              });
            }
          }
        }

        let nextLatestRating: number | null = null;
        for (const match of typedMatchesData) {
          const selectedPlayerPost = selectedPlayerRatingPostByMatch.get(
            Number(match.match_id),
          );
          if (selectedPlayerPost) {
            nextLatestRating = selectedPlayerPost.ratingPost;
            break;
          }
        }

        const nextRatingHistory: RatingHistoryPoint[] = [];
        for (const match of typedMatchesData) {
          if (nextRatingHistory.length >= RATING_HISTORY_POINTS) {
            break;
          }

          const post = selectedPlayerRatingPostByMatch.get(Number(match.match_id));
          if (post) {
            nextRatingHistory.push({
              rating: post.ratingPost,
              date: match.date_local || null,
            });
          }
        }
        nextRatingHistory.reverse();

        const teamsByMatchId = groupByMatchId(typedAllTeamsData);
        const setsByMatchId = groupByMatchId(typedMatchSetsData);
        const nextMatches: MatchWithTeams[] = assembleMatchesWithTeamsAndSets({
          matches: typedMatchesData,
          teamsByMatchId,
          setsByMatchId,
          ratingLookup,
        });

        if (!isCancelled) {
          setMatches(nextMatches);
          setLatestRating(nextLatestRating);
          setRatingHistory(nextRatingHistory);
        }
      } catch (error) {
        console.error("Error fetching player matches:", error);
        if (!isCancelled) {
          setMatches([]);
          setLatestRating(null);
          setRatingHistory([]);
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    fetchPlayerMatches();

    return () => {
      isCancelled = true;
    };
  }, [playerId]);

  return {
    matches,
    latestRating,
    ratingHistory,
    loading,
  };
}