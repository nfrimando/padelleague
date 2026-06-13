import { NextRequest, NextResponse } from "next/server";
import { getServerServiceClient } from "@/app/api/_lib/supabase";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

function randomId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export async function POST(request: NextRequest) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "File must be JPEG, PNG, WebP, or GIF." },
      { status: 400 },
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "File must be 5 MB or smaller." },
      { status: 400 },
    );
  }

  const ext = file.type.split("/")[1].replace("jpeg", "jpg");
  const path = `signups/${randomId()}.${ext}`;

  const serviceClient = getServerServiceClient();
  const arrayBuffer = await file.arrayBuffer();

  const { error: uploadError } = await serviceClient.storage
    .from("player-avatars")
    .upload(path, arrayBuffer, { contentType: file.type, upsert: false });

  if (uploadError) {
    console.error("[upload-image] storage upload error:", uploadError);
    return NextResponse.json({ error: "Upload failed." }, { status: 500 });
  }

  const { data: urlData } = serviceClient.storage
    .from("player-avatars")
    .getPublicUrl(path);

  return NextResponse.json({ imageUrl: urlData.publicUrl }, { status: 201 });
}
