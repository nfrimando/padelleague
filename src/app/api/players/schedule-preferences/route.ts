import { NextRequest, NextResponse } from "next/server";
import {
  getServerUserClient,
  getServerServiceClient,
} from "@/app/api/_lib/supabase";

type ScheduleSlot = { day_of_week: number; start_hour: number };

export async function GET(request: NextRequest) {
  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userClient = getServerUserClient(authorization);
  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser();
  if (authError || !user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceClient = getServerServiceClient();

  const { data: player, error: lookupError } = await serviceClient
    .from("players")
    .select("player_id")
    .eq("email", user.email)
    .maybeSingle();

  if (lookupError || !player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  let targetPlayerId = player.player_id as number;
  const queryPlayerIdParam = request.nextUrl.searchParams.get("player_id");
  if (queryPlayerIdParam) {
    const requestedId = Number(queryPlayerIdParam);
    if (requestedId && requestedId !== targetPlayerId) {
      const { data: adminRow } = await serviceClient
        .from("admin_users")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (adminRow) targetPlayerId = requestedId;
    }
  }

  const { data: rows, error: fetchError } = await serviceClient
    .from("player_schedule_preferences")
    .select("day_of_week, start_hour")
    .eq("player_id", targetPlayerId);

  if (fetchError) {
    return NextResponse.json({ error: "Failed to fetch schedule" }, { status: 500 });
  }

  return NextResponse.json({ schedule: rows ?? [] });
}

export async function PUT(request: NextRequest) {
  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userClient = getServerUserClient(authorization);
  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser();
  if (authError || !user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { slots?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(body.slots)) {
    return NextResponse.json({ error: "slots must be an array" }, { status: 400 });
  }

  const slots = body.slots as ScheduleSlot[];
  for (const s of slots) {
    if (
      typeof s.day_of_week !== "number" ||
      s.day_of_week < 0 ||
      s.day_of_week > 6 ||
      typeof s.start_hour !== "number" ||
      s.start_hour < 0 ||
      s.start_hour > 23
    ) {
      return NextResponse.json(
        { error: "Invalid slot: day_of_week 0–6, start_hour 0–23" },
        { status: 400 },
      );
    }
  }

  const serviceClient = getServerServiceClient();

  const { data: player, error: lookupError } = await serviceClient
    .from("players")
    .select("player_id")
    .eq("email", user.email)
    .maybeSingle();

  if (lookupError || !player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  let targetPlayerId = player.player_id as number;
  const queryPlayerIdParam = request.nextUrl.searchParams.get("player_id");
  if (queryPlayerIdParam) {
    const requestedId = Number(queryPlayerIdParam);
    if (requestedId && requestedId !== targetPlayerId) {
      const { data: adminRow } = await serviceClient
        .from("admin_users")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (adminRow) targetPlayerId = requestedId;
    }
  }

  const { error: deleteError } = await serviceClient
    .from("player_schedule_preferences")
    .delete()
    .eq("player_id", targetPlayerId);

  if (deleteError) {
    return NextResponse.json({ error: "Failed to save schedule" }, { status: 500 });
  }

  if (slots.length > 0) {
    const rows = slots.map((s) => ({
      player_id: targetPlayerId,
      day_of_week: s.day_of_week,
      start_hour: s.start_hour,
    }));

    const { error: insertError } = await serviceClient
      .from("player_schedule_preferences")
      .insert(rows);

    if (insertError) {
      return NextResponse.json({ error: "Failed to save schedule" }, { status: 500 });
    }
  }

  const { data: saved } = await serviceClient
    .from("player_schedule_preferences")
    .select("day_of_week, start_hour")
    .eq("player_id", targetPlayerId);

  return NextResponse.json({ schedule: saved ?? [] });
}
