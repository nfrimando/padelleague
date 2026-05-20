import { NextResponse } from "next/server";
import {
  getServerServiceClient,
  getServerUserClient,
} from "@/app/api/_lib/supabase";
import { notifyNewMemberApplication } from "@/lib/email/notifications/newMemberApplication";

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function POST(request: Request) {
  let body: {
    name?: unknown;
    nickname?: unknown;
    contact?: unknown;
    email?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const name = normalizeString(body.name);
  const nickname = normalizeString(body.nickname);
  const contact = normalizeString(body.contact);
  let email = normalizeString(body.email);

  if (!name || !nickname || !contact) {
    return NextResponse.json(
      { error: "name, nickname, and contact are required." },
      { status: 400 },
    );
  }

  // Optional auth: if a valid bearer token is present, prefer the verified email
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    try {
      const userClient = getServerUserClient(authorization);
      const {
        data: { user },
      } = await userClient.auth.getUser();
      if (user?.email) {
        email = user.email;
      }
    } catch {
      return NextResponse.json(
        { error: "Invalid authorization token." },
        { status: 401 },
      );
    }
  }

  let serviceClient;
  try {
    serviceClient = getServerServiceClient();
  } catch (error) {
    console.error("Failed to initialize service Supabase client:", error);
    return NextResponse.json(
      { error: "Server misconfiguration." },
      { status: 500 },
    );
  }

  const { data, error } = await serviceClient
    .from("signups_players")
    .insert({
      player_id: null,
      status: "registered",
      applicant_name: name,
      applicant_nickname: nickname,
      applicant_contact: contact,
      applicant_email: email,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("Failed to create membership application:", error?.message);
    return NextResponse.json(
      { error: "Failed to submit membership application." },
      { status: 500 },
    );
  }

  await notifyNewMemberApplication({ name, nickname, email, contact }).catch((err) =>
    console.error("[email] notifyNewMemberApplication failed:", err),
  );

  return NextResponse.json({ applied: true, signup_id: data.id }, { status: 201 });
}
