import { NextResponse } from "next/server";
import {
  getAuthorizedAdminClient,
  isRecord,
  normalizeOptionalString,
} from "@/app/api/admin/_lib/auth";

type CreatePlayerRequest = {
  name: string;
  nickname: string;
  imageLink?: string | null;
};

type ValidationResult =
  | { valid: true; value: CreatePlayerRequest }
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
    },
  };
}

export async function POST(request: Request) {
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

  const { data: createdPlayer, error: createError } = await supabase
    .from("players")
    .insert({
      name: validation.value.name,
      nickname: validation.value.nickname,
      image_link: validation.value.imageLink,
    })
    .select("*")
    .maybeSingle();

  if (createError || !createdPlayer) {
    return NextResponse.json(
      { error: createError?.message || "Failed to create player." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      player: createdPlayer,
      message: "Player created successfully.",
    },
    { status: 201 },
  );
}
