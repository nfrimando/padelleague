import { SupabaseClient } from "@supabase/supabase-js";

type InitialRatingFallback = Map<number, number | null> | null | undefined;

type RatingHistoryRow = {
  player_id: number | string | null;
  match_id: number | string | null;
  rating_post: number | string | null;
  formula_name: string | null;
  matches:
    | {
        date_local?: string | null;
        time_local?: string | null;
      }
    | Array<{
        date_local?: string | null;
        time_local?: string | null;
      }>
    | null;
};

type ExistingMatchRatingPreRow = {
  player_id: number | string | null;
  rating_pre: number | string | null;
};

type PlayerInitialRatingRow = {
  player_id: number | string | null;
  initial_rating: number | string | null;
};

type ResolvedPreMatchRatingRow = {
  player_id: number | string | null;
  pre_match_rating: number | string | null;
};

type PreferredMatchRating = {
  ratingPost: number;
  priority: number;
  dateLocal: string | null;
  timeLocal: string | null;
};

function toFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toPriority(formulaName: unknown): number {
  const formula = String(formulaName || "").toLowerCase();
  return formula === "v3" ? 2 : formula === "v2" ? 1 : 0;
}

function normalizeMatchMeta(matches: RatingHistoryRow["matches"]): {
  dateLocal: string | null;
  timeLocal: string | null;
} {
  if (Array.isArray(matches)) {
    const first = matches[0];
    return {
      dateLocal: first?.date_local ?? null,
      timeLocal: first?.time_local ?? null,
    };
  }

  return {
    dateLocal: matches?.date_local ?? null,
    timeLocal: matches?.time_local ?? null,
  };
}

function compareNullableStringDesc(a: string | null, b: string | null): number {
  if (a === b) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  if (b === null) {
    return -1;
  }
  return b.localeCompare(a);
}

function findLatestRating(
  perMatch: Map<number, PreferredMatchRating>,
): number | null {
  const sorted = Array.from(perMatch.entries()).sort((a, b) => {
    const [aMatchId, aValue] = a;
    const [bMatchId, bValue] = b;

    const byDate = compareNullableStringDesc(aValue.dateLocal, bValue.dateLocal);
    if (byDate !== 0) {
      return byDate;
    }

    const byTime = compareNullableStringDesc(aValue.timeLocal, bValue.timeLocal);
    if (byTime !== 0) {
      return byTime;
    }

    return bMatchId - aMatchId;
  });

  return sorted.length > 0 ? sorted[0][1].ratingPost : null;
}

async function resolvePreMatchRatingsSequentialFallback(
  supabase: SupabaseClient,
  matchId: number,
  requestedPlayerIds: number[],
  initialRatingFallback?: InitialRatingFallback,
): Promise<Map<number, number | null>> {
  const resolved = new Map<number, number | null>();

  const { data: historyRows, error: historyError } = await supabase
    .from("match_player_ratings")
    .select("player_id,match_id,rating_post,formula_name,matches(date_local,time_local)")
    .in("player_id", requestedPlayerIds)
    .neq("match_id", matchId);

  if (!historyError) {
    const preferredByPlayerAndMatch = new Map<
      number,
      Map<number, PreferredMatchRating>
    >();

    for (const row of (historyRows ?? []) as RatingHistoryRow[]) {
      const playerId = toFiniteNumber(row.player_id);
      const ratingMatchId = toFiniteNumber(row.match_id);
      const ratingPost = toFiniteNumber(row.rating_post);

      if (
        playerId === null ||
        ratingMatchId === null ||
        ratingPost === null ||
        !requestedPlayerIds.includes(playerId)
      ) {
        continue;
      }

      const playerMap =
        preferredByPlayerAndMatch.get(playerId) ??
        new Map<number, PreferredMatchRating>();
      const existing = playerMap.get(ratingMatchId);
      const priority = toPriority(row.formula_name);
      const { dateLocal, timeLocal } = normalizeMatchMeta(row.matches);

      if (!existing || priority >= existing.priority) {
        playerMap.set(ratingMatchId, {
          ratingPost,
          priority,
          dateLocal,
          timeLocal,
        });
      }

      preferredByPlayerAndMatch.set(playerId, playerMap);
    }

    for (const playerId of requestedPlayerIds) {
      const latest = findLatestRating(
        preferredByPlayerAndMatch.get(playerId) ?? new Map(),
      );
      if (typeof latest === "number") {
        resolved.set(playerId, latest);
      }
    }
  }

  let remainingPlayerIds = requestedPlayerIds.filter(
    (playerId) => !resolved.has(playerId),
  );

  if (remainingPlayerIds.length > 0) {
    const { data: existingRows, error: existingError } = await supabase
      .from("match_player_ratings")
      .select("player_id,rating_pre")
      .eq("match_id", matchId)
      .in("player_id", remainingPlayerIds);

    if (!existingError) {
      for (const row of (existingRows ?? []) as ExistingMatchRatingPreRow[]) {
        const playerId = toFiniteNumber(row.player_id);
        const ratingPre = toFiniteNumber(row.rating_pre);
        if (playerId === null || ratingPre === null || resolved.has(playerId)) {
          continue;
        }

        resolved.set(playerId, ratingPre);
      }
    }

    remainingPlayerIds = requestedPlayerIds.filter(
      (playerId) => !resolved.has(playerId),
    );
  }

  if (remainingPlayerIds.length > 0 && initialRatingFallback) {
    for (const playerId of remainingPlayerIds) {
      resolved.set(playerId, initialRatingFallback.get(playerId) ?? null);
    }

    remainingPlayerIds = requestedPlayerIds.filter(
      (playerId) => !resolved.has(playerId),
    );
  }

  if (remainingPlayerIds.length > 0 && !initialRatingFallback) {
    const { data: playersRows, error: playersError } = await supabase
      .from("players")
      .select("player_id,initial_rating")
      .in("player_id", remainingPlayerIds);

    if (!playersError) {
      for (const row of (playersRows ?? []) as PlayerInitialRatingRow[]) {
        const playerId = toFiniteNumber(row.player_id);
        const initialRating = toFiniteNumber(row.initial_rating);
        if (playerId === null || resolved.has(playerId)) {
          continue;
        }

        resolved.set(playerId, initialRating);
      }
    }

    remainingPlayerIds = requestedPlayerIds.filter(
      (playerId) => !resolved.has(playerId),
    );
  }

  for (const playerId of remainingPlayerIds) {
    resolved.set(playerId, null);
  }

  return resolved;
}

export async function resolvePreMatchRatings(
  supabase: SupabaseClient,
  matchId: number,
  playerIds: number[],
  initialRatingFallback?: InitialRatingFallback,
): Promise<Map<number, number | null>> {
  const requestedPlayerIds = Array.from(
    new Set(
      playerIds.filter(
        (playerId) => Number.isInteger(playerId) && playerId > 0,
      ),
    ),
  );

  const resolved = new Map<number, number | null>();
  if (requestedPlayerIds.length === 0) {
    return resolved;
  }

  const { data, error } = await supabase.rpc("get_pre_match_ratings", {
    p_match_id: matchId,
    p_player_ids: requestedPlayerIds,
  });

  if (error) {
    return resolvePreMatchRatingsSequentialFallback(
      supabase,
      matchId,
      requestedPlayerIds,
      initialRatingFallback,
    );
  }

  for (const row of (data ?? []) as ResolvedPreMatchRatingRow[]) {
    const playerId = toFiniteNumber(row.player_id);
    const preMatchRating = toFiniteNumber(row.pre_match_rating);

    if (playerId === null || !requestedPlayerIds.includes(playerId)) {
      continue;
    }

    if (preMatchRating !== null) {
      resolved.set(playerId, preMatchRating);
    }
  }

  for (const playerId of requestedPlayerIds) {
    if (resolved.has(playerId)) {
      continue;
    }

    if (initialRatingFallback?.has(playerId)) {
      resolved.set(playerId, initialRatingFallback.get(playerId) ?? null);
      continue;
    }

    resolved.set(playerId, null);
  }

  return resolved;
}
