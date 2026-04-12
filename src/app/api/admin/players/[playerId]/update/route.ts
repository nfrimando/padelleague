import { NextResponse } from "next/server";
import {
  getAuthorizedAdminClient,
  isRecord,
  normalizeOptionalString,
  normalizeRequiredPositiveInteger,
} from "@/app/api/admin/_lib/auth";

type UpdatePlayerRequest = {
  name: string;
  nickname: string;
  imageLink?: string | null;
  initialRating?: number | null;
};

type ValidationResult =
  | { valid: true; value: UpdatePlayerRequest }
  | { valid: false; errors: string[] };

function validatePayload(payload: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isRecord(payload)) {
    return {
      valid: false,
      errors: ["Body must be a JSON object."],
    };
  }

  const name = normalizeOptionalString(payload.name);
  const nickname = normalizeOptionalString(payload.nickname);
  const imageLink = normalizeOptionalString(payload.imageLink);
  let initialRating: number | null = null;

  if (
    payload.initialRating !== undefined &&
    payload.initialRating !== null &&
    payload.initialRating !== ""
  ) {
    const parsed = Number(payload.initialRating);
    if (!Number.isFinite(parsed) || parsed < 0) {
      errors.push("initialRating must be a non-negative number or null.");
    } else {
      initialRating = parsed;
    }
  }

  if (!name) {
    errors.push("name is required.");
  }

  if (!nickname) {
    errors.push("nickname is required.");
  }

  if (errors.length > 0 || !name || !nickname) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    value: {
      name,
      nickname,
      imageLink,
      initialRating,
    },
  };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ playerId: string }> },
) {
  const { playerId: rawPlayerId } = await params;
  const playerId = normalizeRequiredPositiveInteger(rawPlayerId);

  if (playerId === null) {
    return NextResponse.json(
      { error: "playerId must be a positive integer." },
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

  const { data: updatedPlayer, error: updateError } = await supabase
    .from("players")
    .update({
      name: validation.value.name,
      nickname: validation.value.nickname,
      image_link: validation.value.imageLink,
      initial_rating: validation.value.initialRating,
    })
    .eq("player_id", playerId)
    .select("*")
    .maybeSingle();

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message || "Failed to update player." },
      { status: 500 },
    );
  }

  if (!updatedPlayer) {
    return NextResponse.json({ error: "Player not found." }, { status: 404 });
  }

  return NextResponse.json(
    {
      player: updatedPlayer,
      message: "Player updated successfully.",
    },
    { status: 200 },
  );
}
