import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "nfrimando@gmail.com")
  .trim()
  .toLowerCase();

type PlayerUpdatePayload = {
  name?: string;
  nickname?: string;
  image_link?: string | null;
};

function getBearerToken(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization") || "";
  const [scheme, token] = authHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }
  return token;
}

function normalizeText(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ playerId: string }> },
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey || !supabaseServiceRoleKey) {
    return NextResponse.json(
      {
        error: [
          "Missing Supabase environment variables for admin API.",
          "Required:",
          "- NEXT_PUBLIC_SUPABASE_URL",
          "- SUPABASE_SERVICE_ROLE_KEY",
          "- NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY)",
        ].join("\n"),
      },
      { status: 500 },
    );
  }

  const token = getBearerToken(req);
  if (!token) {
    return NextResponse.json({ error: "Missing bearer token." }, { status: 401 });
  }

  const authClient = createClient(supabaseUrl, supabasePublishableKey);
  const { data: authData, error: authError } = await authClient.auth.getUser(token);

  if (authError || !authData.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const requesterEmail = (authData.user.email || "").trim().toLowerCase();
  if (requesterEmail !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { playerId } = await params;
  const parsedPlayerId = Number(playerId);
  if (!Number.isFinite(parsedPlayerId)) {
    return NextResponse.json({ error: "Invalid playerId." }, { status: 400 });
  }

  let payload: PlayerUpdatePayload;
  try {
    payload = (await req.json()) as PlayerUpdatePayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const updates: Record<string, string | null> = {};

  if (Object.prototype.hasOwnProperty.call(payload, "name")) {
    const name = normalizeText(payload.name);
    if (!name) {
      return NextResponse.json(
        { error: "name cannot be empty." },
        { status: 400 },
      );
    }
    updates.name = name;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "nickname")) {
    const nickname = normalizeText(payload.nickname);
    if (!nickname) {
      return NextResponse.json(
        { error: "nickname cannot be empty." },
        { status: 400 },
      );
    }
    updates.nickname = nickname;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "image_link")) {
    updates.image_link = normalizeText(payload.image_link);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No updatable fields provided." },
      { status: 400 },
    );
  }

  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);
  const { data, error } = await adminClient
    .from("players")
    .update(updates)
    .eq("player_id", parsedPlayerId)
    .select("player_id,name,nickname,image_link,created_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Player not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, player: data });
}
