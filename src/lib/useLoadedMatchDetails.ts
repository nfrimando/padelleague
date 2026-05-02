import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { LoadedMatchDetails, MatchPlayerSummary } from "@/lib/types";

type MatchStatusValue = "completed" | "scheduled" | "forfeit" | "cancelled";

type Options = {
  matchId: string;
  enabled: boolean;
};

type Result = {
  loadedMatchDetails: LoadedMatchDetails | null;
  setLoadedMatchDetails: React.Dispatch<
    React.SetStateAction<LoadedMatchDetails | null>
  >;
  loading: boolean;
  error: string | null;
};

export function useLoadedMatchDetails({ matchId, enabled }: Options): Result {
  const [loadedMatchDetails, setLoadedMatchDetails] =
    useState<LoadedMatchDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const parsedId = Number.parseInt(matchId, 10);
    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      setLoadedMatchDetails(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loadMatchDetails = async () => {
      setLoading(true);
      setError(null);

      const { data: matchRow, error: matchError } = await supabase
        .from("matches")
        .select(
          "match_id,status,season_id,date_local,time_local,venue,type,winner_team",
        )
        .eq("match_id", parsedId)
        .maybeSingle();

      if (cancelled) return;

      if (matchError) {
        setLoadedMatchDetails(null);
        setError(matchError.message || "Failed to load match.");
        setLoading(false);
        return;
      }

      if (!matchRow) {
        setLoadedMatchDetails(null);
        setError("Match not found.");
        setLoading(false);
        return;
      }

      const { data: teams, error: teamsError } = await supabase
        .from("match_teams")
        .select("team_number,player_1_id,player_2_id,sets_won")
        .eq("match_id", parsedId);

      if (cancelled) return;

      if (teamsError) {
        setLoadedMatchDetails(null);
        setError(teamsError.message || "Failed to load match teams.");
        setLoading(false);
        return;
      }

      const { data: setsRows, error: setsError } = await supabase
        .from("match_sets")
        .select("set_number,team_1_games,team_2_games")
        .eq("match_id", parsedId)
        .order("set_number", { ascending: true });

      if (cancelled) return;

      if (setsError) {
        setLoadedMatchDetails(null);
        setError(setsError.message || "Failed to load match sets.");
        setLoading(false);
        return;
      }

      const team1 = (teams ?? []).find((team) => team.team_number === 1);
      const team2 = (teams ?? []).find((team) => team.team_number === 2);

      const playerIds = [
        team1?.player_1_id,
        team1?.player_2_id,
        team2?.player_1_id,
        team2?.player_2_id,
      ].filter((id): id is number => typeof id === "number");

      const uniquePlayerIds = Array.from(new Set(playerIds));

      const { data: playersRows, error: playersError } =
        uniquePlayerIds.length > 0
          ? await supabase
              .from("players")
              .select("player_id,name,nickname,initial_rating")
              .in("player_id", uniquePlayerIds)
          : { data: [], error: null };

      if (cancelled) return;

      if (playersError) {
        setLoadedMatchDetails(null);
        setError(playersError.message || "Failed to load players.");
        setLoading(false);
        return;
      }

      const playerMap = new Map<number, MatchPlayerSummary>();
      const initialRatingMap = new Map<number, number | null>();
      for (const row of playersRows ?? []) {
        playerMap.set(row.player_id, {
          player_id: row.player_id,
          name: row.name ?? null,
          nickname: row.nickname ?? null,
        });
        initialRatingMap.set(
          row.player_id,
          typeof row.initial_rating === "number" ? row.initial_rating : null,
        );
      }

      const preRatingsV3: Record<number, number | null> = {};
      for (const playerId of uniquePlayerIds) {
        const { data: latestRows } = await supabase
          .from("match_player_ratings")
          .select("match_id,rating_post,formula_name")
          .eq("player_id", playerId)
          .neq("match_id", parsedId);

        const preferredByMatch = new Map<
          number,
          { ratingPost: number; priority: number }
        >();

        for (const row of latestRows ?? []) {
          const matchIdForRow = Number(row.match_id);
          const ratingPost = Number(row.rating_post);
          if (!Number.isFinite(matchIdForRow) || !Number.isFinite(ratingPost)) {
            continue;
          }

          const formula = String(row.formula_name || "").toLowerCase();
          const priority = formula === "v3" ? 2 : formula === "v2" ? 1 : 0;
          const existing = preferredByMatch.get(matchIdForRow);

          if (!existing || priority >= existing.priority) {
            preferredByMatch.set(matchIdForRow, { ratingPost, priority });
          }
        }

        if (preferredByMatch.size > 0) {
          const { data: matchesForRatings } = await supabase
            .from("matches")
            .select("match_id,date_local,time_local")
            .in("match_id", Array.from(preferredByMatch.keys()))
            .order("date_local", { ascending: false, nullsFirst: false })
            .order("time_local", { ascending: false, nullsFirst: false })
            .order("match_id", { ascending: false });

          let foundLatest: number | null = null;
          for (const row of matchesForRatings ?? []) {
            const candidate = preferredByMatch.get(Number(row.match_id));
            if (candidate) {
              foundLatest = candidate.ratingPost;
              break;
            }
          }

          if (typeof foundLatest === "number") {
            preRatingsV3[playerId] = foundLatest;
            continue;
          }
        }

        const { data: existingForMatch } = await supabase
          .from("match_player_ratings")
          .select("rating_pre")
          .eq("match_id", parsedId)
          .eq("player_id", playerId)
          .maybeSingle();

        preRatingsV3[playerId] =
          typeof existingForMatch?.rating_pre === "number"
            ? existingForMatch.rating_pre
            : (initialRatingMap.get(playerId) ?? null);
      }

      if (cancelled) return;

      const nextStatus: MatchStatusValue =
        matchRow.status &&
        ["completed", "scheduled", "forfeit", "cancelled"].includes(
          matchRow.status,
        )
          ? (matchRow.status as MatchStatusValue)
          : "completed";

      setLoadedMatchDetails({
        matchId: parsedId,
        status: nextStatus,
        seasonId: matchRow.season_id,
        dateLocal: matchRow.date_local,
        timeLocal: matchRow.time_local,
        venue: matchRow.venue,
        type: matchRow.type,
        winnerTeam: matchRow.winner_team,
        team1SetsWon:
          typeof team1?.sets_won === "number" ? team1.sets_won : null,
        team2SetsWon:
          typeof team2?.sets_won === "number" ? team2.sets_won : null,
        team1: {
          player1:
            typeof team1?.player_1_id === "number"
              ? (playerMap.get(team1.player_1_id) ?? null)
              : null,
          player2:
            typeof team1?.player_2_id === "number"
              ? (playerMap.get(team1.player_2_id) ?? null)
              : null,
        },
        team2: {
          player1:
            typeof team2?.player_1_id === "number"
              ? (playerMap.get(team2.player_1_id) ?? null)
              : null,
          player2:
            typeof team2?.player_2_id === "number"
              ? (playerMap.get(team2.player_2_id) ?? null)
              : null,
        },
        sets: setsRows ?? [],
        preRatingsV3,
      });

      setLoading(false);
    };

    void loadMatchDetails();

    return () => {
      cancelled = true;
    };
  }, [enabled, matchId]);

  return { loadedMatchDetails, setLoadedMatchDetails, loading, error };
}
