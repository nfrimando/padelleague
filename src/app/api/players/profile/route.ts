import { NextRequest, NextResponse } from "next/server";
import {
  getServerUserClient,
  getServerServiceClient,
} from "@/app/api/_lib/supabase";
import type { NotifType, PlayerNotificationPreferences } from "@/lib/types";
import { fetchPlayerPrefs, setPlayerPref } from "@/lib/notificationPreferences";

const VALID_NOTIF_TYPES: NotifType[] = ["match_results", "predictions"];

type ProfileUpdateBody = {
  nickname?: string;
  phone_country_code?: string | null;
  phone_number?: string | null;
  country?: string | null;
  is_public?: boolean;
  is_notifications_subscribed?: boolean;
  preferred_side?: "left" | "right" | "both" | null;
  notification_preferences?: Partial<Record<NotifType, boolean>>;
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

  // Validate notification_preferences if present
  let notifPrefsToSave: Partial<Record<NotifType, boolean>> | undefined;
  if (body.notification_preferences !== undefined) {
    if (typeof body.notification_preferences !== "object" || body.notification_preferences === null) {
      return NextResponse.json(
        { error: "notification_preferences must be an object" },
        { status: 400 },
      );
    }
    notifPrefsToSave = {};
    for (const type of VALID_NOTIF_TYPES) {
      const val = body.notification_preferences[type];
      if (val !== undefined) {
        if (typeof val !== "boolean") {
          return NextResponse.json(
            { error: `notification_preferences.${type} must be a boolean` },
            { status: 400 },
          );
        }
        notifPrefsToSave[type] = val;
      }
    }
  }

  if (Object.keys(updates).length === 0 && !notifPrefsToSave) {
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

  let playerId = existing.player_id as number;
  const queryPlayerIdParam = request.nextUrl.searchParams.get("player_id");
  if (queryPlayerIdParam) {
    const requestedId = Number(queryPlayerIdParam);
    if (requestedId && requestedId !== playerId) {
      const { data: adminRow } = await serviceClient
        .from("admin_users")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (adminRow) playerId = requestedId;
    }
  }

  let updated;
  if (Object.keys(updates).length > 0) {
    const { data, error: updateError } = await serviceClient
      .from("players")
      .update(updates)
      .eq("player_id", playerId)
      .select("*")
      .single();

    if (updateError) {
      console.error("[profile] update error", updateError);
      return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
    }
    updated = data;
  } else {
    const { data } = await serviceClient
      .from("players")
      .select("*")
      .eq("player_id", playerId)
      .single();
    updated = data;
  }

  if (notifPrefsToSave) {
    for (const [type, val] of Object.entries(notifPrefsToSave) as [NotifType, boolean][]) {
      await setPlayerPref(serviceClient, playerId, type, val);
    }
  }

  const notification_preferences: PlayerNotificationPreferences = await fetchPlayerPrefs(
    serviceClient,
    playerId,
  );

  return NextResponse.json({ player: updated, notification_preferences });
}
