import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { PredictableMatch, PredictablePlayer } from "./usePredictableMatches";
import type { UserPick } from "./usePredictions";

export type PredictionResultRow = {
  was_correct: boolean;
  points_awarded: number;
};

export type PredictionHistoryEntry = {
  prediction_id: string;
  match: PredictableMatch;
  existingPick: UserPick;
  result: PredictionResultRow | null;
};

export type PredictionHistoryStats = {
  totalPredictions: number;
  totalRewards: number;
  predictionsWithResults: number;
  correctPredictions: number;
};

type PlayerSummaryRow = {
  player_id: number | string;
  latest_rating: number | string | null;
};

type TeamSlots = {
  t1p1: number | null;
  t1p2: number | null;
  t2p1: number | null;
  t2p2: number | null;
};

export function useUserPredictionHistory(email: string | null) {
  const [entries, setEntries] = useState<PredictionHistoryEntry[]>([]);
  const [stats, setStats] = useState<PredictionHistoryStats>({
    totalPredictions: 0,
    totalRewards: 0,
    predictionsWithResults: 0,
    correctPredictions: 0,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!email) {
      setEntries([]);
      setStats({ totalPredictions: 0, totalRewards: 0, predictionsWithResults: 0, correctPredictions: 0 });
      return;
    }

    setLoading(true);
    let cancelled = false;

    void (async () => {
      // Fetch predictions + results
      const { data: predRows, error: predErr } = await supabase
        .from("predictions")
        .select(
          `id, match_id, prediction, pick_probability, created_at,
           prediction_results(was_correct, points_awarded)`,
        )
        .eq("email", email)
        .eq("type", "winning_team")
        .order("created_at", { ascending: false });

      if (cancelled) return;
      if (predErr) {
        console.error("[useUserPredictionHistory]", predErr);
        setLoading(false);
        return;
      }

      const predictions = (predRows ?? []) as unknown as Array<{
        id: string;
        match_id: number;
        prediction: 1 | 2;
        pick_probability: number;
        created_at: string;
        prediction_results: PredictionResultRow[];
      }>;

      if (predictions.length === 0) {
        setEntries([]);
        setStats({ totalPredictions: 0, totalRewards: 0, predictionsWithResults: 0, correctPredictions: 0 });
        setLoading(false);
        return;
      }

      const matchIds = [...new Set(predictions.map((p) => p.match_id))];

      // Fetch match basic info + teams in parallel
      const [{ data: matchRows }, { data: teamRows }] = await Promise.all([
        supabase
          .from("matches")
          .select("match_id,date_local,time_local,venue,type,status")
          .in("match_id", matchIds),
        supabase
          .from("match_teams")
          .select("match_id,team_number,player_1_id,player_2_id")
          .in("match_id", matchIds),
      ]);

      if (cancelled) return;

      const matchInfoMap = new Map<
        number,
        { date_local: string | null; time_local: string | null; venue: string | null; type: string | null; status: string }
      >();
      for (const m of matchRows ?? []) {
        matchInfoMap.set(m.match_id, {
          date_local: m.date_local,
          time_local: m.time_local,
          venue: m.venue,
          type: m.type,
          status: m.status ?? "completed",
        });
      }

      const teamMap = new Map<number, TeamSlots>();
      for (const row of teamRows ?? []) {
        const existing = teamMap.get(row.match_id) ?? {
          t1p1: null, t1p2: null, t2p1: null, t2p2: null,
        };
        if (row.team_number === 1) {
          existing.t1p1 = row.player_1_id;
          existing.t1p2 = row.player_2_id;
        } else if (row.team_number === 2) {
          existing.t2p1 = row.player_1_id;
          existing.t2p2 = row.player_2_id;
        }
        teamMap.set(row.match_id, existing);
      }

      const playerIdSet = new Set<number>();
      for (const [, t] of teamMap) {
        if (t.t1p1) playerIdSet.add(t.t1p1);
        if (t.t1p2) playerIdSet.add(t.t1p2);
        if (t.t2p1) playerIdSet.add(t.t2p1);
        if (t.t2p2) playerIdSet.add(t.t2p2);
      }
      const allPlayerIds = Array.from(playerIdSet);

      if (allPlayerIds.length === 0) {
        setEntries([]);
        setStats({ totalPredictions: predictions.length, totalRewards: 0, predictionsWithResults: 0, correctPredictions: 0 });
        setLoading(false);
        return;
      }

      // Collect completed match IDs for pre-rating lookup
      const completedMatchIds = [...matchInfoMap.entries()]
        .filter(([, info]) => info.status !== "scheduled")
        .map(([id]) => id);

      // Fetch player info + latest ratings + pre-match ratings in parallel
      const [{ data: playerRows }, { data: summaryRows }, { data: preRatingRows }] = await Promise.all([
        supabase
          .from("players")
          .select("player_id,name,nickname,image_link,initial_rating")
          .in("player_id", allPlayerIds),
        supabase.rpc("get_player_summary", { p_ids: allPlayerIds }),
        completedMatchIds.length > 0
          ? supabase
              .from("match_player_ratings")
              .select("match_id,player_id,rating_pre,formula_name")
              .in("match_id", completedMatchIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (cancelled) return;

      // Build pre-rating map keyed by `${matchId}_${playerId}`, preferring v3 > v2 > other
      const preRatingMap = new Map<string, number>();
      const priorityOf = (f: string | null) => (f === "v3" ? 2 : f === "v2" ? 1 : 0);
      const sortedPreRatings = [...(preRatingRows ?? [])].sort(
        (a, b) => priorityOf(a.formula_name) - priorityOf(b.formula_name),
      );
      for (const row of sortedPreRatings) {
        const rating = Number(row.rating_pre);
        if (Number.isFinite(rating)) {
          preRatingMap.set(`${row.match_id}_${row.player_id}`, rating);
        }
      }

      const playerMap = new Map<number, PredictablePlayer>();
      for (const p of playerRows ?? []) {
        const initialRating = p.initial_rating != null ? Number(p.initial_rating) : null;
        playerMap.set(p.player_id, {
          player_id: p.player_id,
          name: p.name ?? "",
          nickname: p.nickname ?? null,
          image_link: p.image_link ?? null,
          latest_rating: Number.isFinite(initialRating) ? initialRating : null,
        });
      }
      for (const row of (summaryRows ?? []) as PlayerSummaryRow[]) {
        const id = Number(row.player_id);
        const existing = playerMap.get(id);
        if (existing && row.latest_rating != null) {
          const rating = Number(row.latest_rating);
          if (Number.isFinite(rating)) existing.latest_rating = rating;
        }
      }

      // Assemble entries — use stored pick_probability for historical win prob bar
      const assembled: PredictionHistoryEntry[] = [];
      let totalRewards = 0;
      let predictionsWithResults = 0;
      let correctPredictions = 0;

      for (const pred of predictions) {
        const matchInfo = matchInfoMap.get(pred.match_id);
        const teams = teamMap.get(pred.match_id);
        if (!matchInfo || !teams?.t1p1 || !teams.t1p2 || !teams.t2p1 || !teams.t2p2) continue;

        const isCompleted = matchInfo.status !== "scheduled";
        const withPreRating = (playerId: number, base: PredictablePlayer): PredictablePlayer => {
          if (!isCompleted) return base;
          const pre = preRatingMap.get(`${pred.match_id}_${playerId}`);
          return pre !== undefined ? { ...base, latest_rating: pre } : base;
        };

        const t1p1Base = playerMap.get(teams.t1p1);
        const t1p2Base = playerMap.get(teams.t1p2);
        const t2p1Base = playerMap.get(teams.t2p1);
        const t2p2Base = playerMap.get(teams.t2p2);
        if (!t1p1Base || !t1p2Base || !t2p1Base || !t2p2Base) continue;

        const t1p1 = withPreRating(teams.t1p1, t1p1Base);
        const t1p2 = withPreRating(teams.t1p2, t1p2Base);
        const t2p1 = withPreRating(teams.t2p1, t2p1Base);
        const t2p2 = withPreRating(teams.t2p2, t2p2Base);

        const p = pred.pick_probability;
        const team1WinProbability = pred.prediction === 1 ? p : 1 - p;
        const team2WinProbability = pred.prediction === 2 ? p : 1 - p;

        const result = pred.prediction_results?.[0] ?? null;
        if (result) {
          totalRewards += result.points_awarded;
          predictionsWithResults++;
          if (result.was_correct) correctPredictions++;
        }

        assembled.push({
          prediction_id: pred.id,
          match: {
            match_id: pred.match_id,
            date_local: matchInfo.date_local,
            time_local: matchInfo.time_local,
            venue: matchInfo.venue,
            type: matchInfo.type,
            status: matchInfo.status,
            team1Player1: t1p1,
            team1Player2: t1p2,
            team2Player1: t2p1,
            team2Player2: t2p2,
            team1WinProbability,
            team2WinProbability,
            winningTeam: null,
          },
          existingPick: {
            id: pred.id,
            prediction: pred.prediction,
            pickProbability: pred.pick_probability,
          },
          result,
        });
      }

      const matchKey = (e: PredictionHistoryEntry) =>
        `${e.match.date_local ?? ""}${e.match.time_local ?? ""}`;
      const scheduledEntries = assembled
        .filter((e) => e.match.status === "scheduled")
        .sort((a, b) => matchKey(a).localeCompare(matchKey(b)));
      const completedEntries = assembled
        .filter((e) => e.match.status === "completed")
        .sort((a, b) => matchKey(b).localeCompare(matchKey(a)));

      setEntries([...scheduledEntries, ...completedEntries]);
      setStats({ totalPredictions: predictions.length, totalRewards, predictionsWithResults, correctPredictions });
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [email]);

  return { entries, stats, loading };
}
