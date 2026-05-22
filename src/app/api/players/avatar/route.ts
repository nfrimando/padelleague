import { NextRequest, NextResponse } from "next/server";
import {
  getServerUserClient,
  getServerServiceClient,
} from "@/app/api/_lib/supabase";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

export async function POST(request: NextRequest) {
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

  const { data: player, error: playerError } = await serviceClient
    .from("players")
    .select("player_id, image_link")
    .eq("email", user.email)
    .maybeSingle();
  if (playerError || !player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "File must be JPEG, PNG, WebP, or GIF" },
      { status: 400 },
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "File must be 5MB or smaller" },
      { status: 400 },
    );
  }

  const ext = file.type.split("/")[1].replace("jpeg", "jpg");
  const path = `${player.player_id}/${Date.now()}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadError } = await serviceClient.storage
    .from("player-avatars")
    .upload(path, arrayBuffer, { contentType: file.type, upsert: true });
  if (uploadError) {
    console.error("[avatar] upload error", uploadError);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  const { data: urlData } = serviceClient.storage
    .from("player-avatars")
    .getPublicUrl(path);
  const imageUrl = urlData.publicUrl;

  const { error: updateError } = await serviceClient
    .from("players")
    .update({ image_link: imageUrl })
    .eq("player_id", player.player_id);
  if (updateError) {
    console.error("[avatar] db update error", updateError);
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 },
    );
  }

  return NextResponse.json({ imageUrl });
}
