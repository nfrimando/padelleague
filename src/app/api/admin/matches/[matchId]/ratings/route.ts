import { NextResponse } from "next/server";
import {
  getAuthorizedAdminClient,
  isRecord,
  normalizeOptionalString,
  normalizeRequiredPositiveInteger,
} from "@/app/api/admin/_lib/auth";

type MatchRatingResult = "win" | "loss";

type RatingInput = {
  playerId: number;
  ratingPre: number;
  ratingPost: number;
  result: MatchRatingResult;
};

type ReplaceMatchRatingsRequest = {
  formulaName: string;
  ratings: RatingInput[];
};

type ValidationResult =
  | { valid: true; value: ReplaceMatchRatingsRequest }
  | { valid: false; errors: string[] };

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeResult(value: unknown): MatchRatingResult | null {
  return value === "win" || value === "loss" ? value : null;
}

function validatePayload(payload: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isRecord(payload)) {
    return {
      valid: false,
      errors: ["Body must be a JSON object."],
    };
  }

  const formulaName = normalizeOptionalString(payload.formulaName);
  if (!formulaName) {
    errors.push("formulaName is required.");
  }

  if (!Array.isArray(payload.ratings) || payload.ratings.length !== 4) {
    errors.push("ratings must be an array of exactly 4 entries.");
  }

  const ratings: RatingInput[] = [];

  if (Array.isArray(payload.ratings)) {
    payload.ratings.forEach((entry, index) => {
      if (!isRecord(entry)) {
        errors.push(`ratings[${index}] must be an object.`);
        return;
      }

      const playerId = normalizeRequiredPositiveInteger(entry.playerId);
      const ratingPre = entry.ratingPre;
      const ratingPost = entry.ratingPost;
      const result = normalizeResult(entry.result);

      if (playerId === null) {
        errors.push(`ratings[${index}].playerId must be a positive integer.`);
      }

      if (!isFiniteNumber(ratingPre)) {
        errors.push(`ratings[${index}].ratingPre must be a number.`);
      }

      if (!isFiniteNumber(ratingPost)) {
        errors.push(`ratings[${index}].ratingPost must be a number.`);
      }

      if (!result) {
        errors.push(`ratings[${index}].result must be win or loss.`);
      }

      if (
        playerId !== null &&
        isFiniteNumber(ratingPre) &&
        isFiniteNumber(ratingPost) &&
        result
      ) {
        ratings.push({
          playerId,
          ratingPre,
          ratingPost,
          result,
        });
      }
    });
  }

  if (ratings.length === 4) {
    const uniquePlayers = new Set(ratings.map((entry) => entry.playerId));
    if (uniquePlayers.size !== 4) {
      errors.push("ratings must contain 4 unique players.");
    }

    const winCount = ratings.filter((entry) => entry.result === "win").length;
    const lossCount = ratings.filter((entry) => entry.result === "loss").length;
    if (winCount !== 2 || lossCount !== 2) {
      errors.push("ratings must contain exactly 2 wins and 2 losses.");
    }
  }

  if (errors.length > 0 || !formulaName) {
    return {
      valid: false,
      errors,
    };
  }

  return {
    valid: true,
    value: {
      formulaName,
      ratings,
    },
  };
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const { matchId: rawMatchId } = await params;
  const matchId = normalizeRequiredPositiveInteger(rawMatchId);

  if (matchId === null) {
    return NextResponse.json(
      { error: "matchId must be a positive integer." },
      { status: 400 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const validation = validatePayload(payload);
  if (!validation.valid) {
    return NextResponse.json(
      {
        error: "Invalid request payload.",
        details: validation.errors,
      },
      { status: 400 },
    );
  }

  const authResult = await getAuthorizedAdminClient(request);
  if (!authResult.ok) {
    return authResult.response;
  }

  const { supabase } = authResult;

  const { data: matchRow, error: matchError } = await supabase
    .from("matches")
    .select("match_id")
    .eq("match_id", matchId)
    .maybeSingle();

  if (matchError) {
    return NextResponse.json(
      { error: matchError.message || "Failed to load match." },
      { status: 500 },
    );
  }

  if (!matchRow) {
    return NextResponse.json({ error: "Match not found." }, { status: 404 });
  }

  const { data: teamRows, error: teamRowsError } = await supabase
    .from("match_teams")
    .select("player_1_id,player_2_id")
    .eq("match_id", matchId);

  if (teamRowsError) {
    return NextResponse.json(
      { error: teamRowsError.message || "Failed to load match teams." },
      { status: 500 },
    );
  }

  const expectedPlayerIds = new Set<number>();
  for (const row of teamRows ?? []) {
    if (typeof row.player_1_id === "number") {
      expectedPlayerIds.add(row.player_1_id);
    }
    if (typeof row.player_2_id === "number") {
      expectedPlayerIds.add(row.player_2_id);
    }
  }

  const submittedPlayerIds = new Set(
    validation.value.ratings.map((entry) => entry.playerId),
  );

  if (
    expectedPlayerIds.size !== 4 ||
    submittedPlayerIds.size !== 4 ||
    [...submittedPlayerIds].some((playerId) => !expectedPlayerIds.has(playerId))
  ) {
    return NextResponse.json(
      {
        error:
          "Submitted rating players must exactly match the four players in match_teams.",
      },
      { status: 400 },
    );
  }

  const { data: existingRows, error: existingRowsError } = await supabase
    .from("match_player_ratings")
    .select(
      "rating_id,player_id,match_id,rating_pre,rating_post,result,formula_name,created_at",
    )
    .eq("match_id", matchId)
    .eq("formula_name", validation.value.formulaName);

  if (existingRowsError) {
    return NextResponse.json(
      {
        error:
          existingRowsError.message || "Failed to load existing match ratings.",
      },
      { status: 500 },
    );
  }

  if ((existingRows ?? []).length > 0) {
    const { error: deleteError } = await supabase
      .from("match_player_ratings")
      .delete()
      .eq("match_id", matchId)
      .eq("formula_name", validation.value.formulaName);

    if (deleteError) {
      return NextResponse.json(
        { error: deleteError.message || "Failed to clear existing ratings." },
        { status: 500 },
      );
    }
  }

  const rowsToInsert = validation.value.ratings.map((entry) => ({
    player_id: entry.playerId,
    match_id: matchId,
    rating_pre: entry.ratingPre,
    rating_post: entry.ratingPost,
    result: entry.result,
    formula_name: validation.value.formulaName,
  }));

  const { data: insertedRows, error: insertError } = await supabase
    .from("match_player_ratings")
    .insert(rowsToInsert)
    .select(
      "rating_id,player_id,match_id,rating_pre,rating_post,result,formula_name,created_at",
    );

  if (insertError) {
    let rollbackError: string | null = null;

    if ((existingRows ?? []).length > 0) {
      const { error: restoreError } = await supabase
        .from("match_player_ratings")
        .insert(existingRows);
      rollbackError = restoreError?.message ?? null;
    }

    return NextResponse.json(
      {
        error: insertError.message || "Failed to replace match ratings.",
        rollbackError,
      },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      matchId,
      formulaName: validation.value.formulaName,
      ratings: insertedRows ?? [],
      message: "Match player ratings replaced successfully.",
    },
    { status: 200 },
  );
}