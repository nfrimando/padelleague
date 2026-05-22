import { NextRequest, NextResponse } from "next/server";
import {
  getServerUserClient,
  getServerServiceClient,
} from "@/app/api/_lib/supabase";

type ProfileUpdateBody = {
  nickname?: string;
  phone_country_code?: string | null;
  phone_number?: string | null;
  country?: string | null;
  is_public?: boolean;
  is_notifications_subscribed?: boolean;
  preferred_side?: "left" | "right" | "both" | null;
};

export async function PATCH(request: NextRequest) {
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

  let body: ProfileUpdateBody;
  try {
    body = (await request.json()) as ProfileUpdateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if (body.nickname !== undefined) {
    if (typeof body.nickname !== "string" || body.nickname.length > 50) {
      return NextResponse.json(
        { error: "nickname must be a string under 50 characters" },
        { status: 400 },
      );
    }
    updates.nickname = body.nickname.trim();
  }

  if (body.phone_country_code !== undefined) {
    if (
      body.phone_country_code !== null &&
      typeof body.phone_country_code !== "string"
    ) {
      return NextResponse.json(
        { error: "phone_country_code must be a string or null" },
        { status: 400 },
      );
    }
    updates.phone_country_code = body.phone_country_code;
  }

  if (body.phone_number !== undefined) {
    if (
      body.phone_number !== null &&
      (typeof body.phone_number !== "string" ||
        !/^\d{0,15}$/.test(body.phone_number))
    ) {
      return NextResponse.json(
        { error: "phone_number must be digits only, max 15 characters" },
        { status: 400 },
      );
    }
    updates.phone_number = body.phone_number;
  }

  if (body.country !== undefined) {
    if (body.country !== null) {
      if (typeof body.country !== "string" || !/^[A-Z]{2}$/.test(body.country)) {
        return NextResponse.json(
          { error: "country must be a 2-letter ISO code or null" },
          { status: 400 },
        );
      }
    }
    updates.country = body.country;
  }

  if (body.is_public !== undefined) {
    if (typeof body.is_public !== "boolean") {
      return NextResponse.json(
        { error: "is_public must be a boolean" },
        { status: 400 },
      );
    }
    updates.is_public = body.is_public;
  }

  if (body.is_notifications_subscribed !== undefined) {
    if (typeof body.is_notifications_subscribed !== "boolean") {
      return NextResponse.json(
        { error: "is_notifications_subscribed must be a boolean" },
        { status: 400 },
      );
    }
    updates.is_notifications_subscribed = body.is_notifications_subscribed;
  }

  if (body.preferred_side !== undefined) {
    if (
      body.preferred_side !== null &&
      !["left", "right", "both"].includes(body.preferred_side)
    ) {
      return NextResponse.json(
        { error: "preferred_side must be left, right, both, or null" },
        { status: 400 },
      );
    }
    updates.preferred_side = body.preferred_side;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const serviceClient = getServerServiceClient();

  const { data: existing, error: lookupError } = await serviceClient
    .from("players")
    .select("player_id")
    .eq("email", user.email)
    .maybeSingle();

  if (lookupError || !existing) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  const { data: updated, error: updateError } = await serviceClient
    .from("players")
    .update(updates)
    .eq("player_id", existing.player_id)
    .select("*")
    .single();

  if (updateError) {
    console.error("[profile] update error", updateError);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }

  return NextResponse.json({ player: updated });
}
