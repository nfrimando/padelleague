"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { MatchSet, MatchWithTeams, Player } from "@/lib/types";

type RatingHistoryPoint = {
  rating: number;
  date: string | null;
};

type MatchTeamIdRow = {
  match_id: number;
};

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
  rating_post: number | null;
  formula_name: string | null;
};

type RatingEntry = {
  rating: number;
  formula: string;
  priority: number;
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
        const { data: teamsData, error: teamsError } = await supabase
          .from("match_teams")
          .select("match_id")
          .or(`player_1_id.eq.${playerId},player_2_id.eq.${playerId}`);

        if (teamsError) {
          console.error("Error fetching teams:", teamsError);
          if (!isCancelled) {
            setMatches([]);
            setLatestRating(null);
            setRatingHistory([]);
          }
          return;
        }

        const typedTeamsData = (teamsData || []) as MatchTeamIdRow[];
        if (typedTeamsData.length === 0) {
          if (!isCancelled) {
            setMatches([]);
            setLatestRating(null);
            setRatingHistory([]);
          }
          return;
        }

        const matchIds = typedTeamsData.map((team) => team.match_id);

        const { data: matchesData, error: matchesError } = await supabase
          .from("matches")
          .select("*")
          .in("match_id", matchIds)
          .order("date_local", { ascending: false, nullsFirst: false })
          .order("time_local", { ascending: false });

        if (matchesError) {
          console.error("Error fetching matches:", matchesError);
          if (!isCancelled) {
            setMatches([]);
            setLatestRating(null);
            setRatingHistory([]);
          }
          return;
        }

        const { data: allTeamsData, error: allTeamsError } = await supabase
          .from("match_teams")
          .select(
            "*, player_1:player_1_id(player_id,name,nickname,image_link), player_2:player_2_id(player_id,name,nickname,image_link)",
          )
          .in("match_id", matchIds);

        if (allTeamsError) {
          console.error("Error fetching teams:", allTeamsError);
          if (!isCancelled) {
            setMatches([]);
            setLatestRating(null);
            setRatingHistory([]);
          }
          return;
        }

        const { data: matchSetsData, error: matchSetsError } = await supabase
          .from("match_sets")
          .select("*")
          .in("match_id", matchIds)
          .order("set_number", { ascending: true });

        if (matchSetsError) {
          console.error("Error fetching match sets:", matchSetsError);
        }

        const { data: matchRatingsData, error: matchRatingsError } =
          await supabase
            .from("match_player_ratings")
            .select("match_id, player_id, rating_pre, rating_post, formula_name")
            .in("match_id", matchIds);

        if (matchRatingsError) {
          console.error("Error fetching match player ratings:", matchRatingsError);
        }

        const typedMatchesData = (matchesData || []) as MatchRow[];
        const typedAllTeamsData = (allTeamsData || []) as MatchTeamRow[];
        const typedMatchSetsData = (matchSetsData || []) as MatchSet[];
        const typedMatchRatingsData =
          (matchRatingsData || []) as MatchRatingRow[];

        const ratingLookup = new Map<string, RatingEntry>();
        const selectedPlayerRatingPostByMatch = new Map<
          number,
          { ratingPost: number; priority: number }
        >();

        for (const row of typedMatchRatingsData) {
          const matchId = Number(row.match_id);
          const rating = Number(row.rating_pre);
          const ratingPost = Number(row.rating_post);
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
          const key = `${matchId}:${normalizedPlayerId}`;
          const existing = ratingLookup.get(key);

          if (!existing || priority >= existing.priority) {
            ratingLookup.set(key, { rating, formula, priority });
          }

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
          if (nextRatingHistory.length >= 6) {
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

        const attachPreMatchRating = (
          matchId: number,
          player: Player | null,
        ) => {
          if (!player) {
            return null;
          }

          const key = `${matchId}:${String(player.player_id)}`;
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

        const nextMatches: MatchWithTeams[] = typedMatchesData.map((match) => ({
          ...match,
          teams: typedAllTeamsData
            .filter((team) => team.match_id === match.match_id)
            .map((team) => ({
              uuid: team.uuid,
              team_number: team.team_number,
              sets_won: team.sets_won,
              player_1: attachPreMatchRating(match.match_id, team.player_1),
              player_2: attachPreMatchRating(match.match_id, team.player_2),
            })),
          sets: typedMatchSetsData.filter((set) => set.match_id === match.match_id),
        }));

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