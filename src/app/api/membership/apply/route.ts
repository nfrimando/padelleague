import { NextResponse } from "next/server";
import {
  getServerServiceClient,
  getServerUserClient,
} from "@/app/api/_lib/supabase";
import { notifyNewMemberApplication } from "@/lib/email/notifications/newMemberApplication";
import { notifyRecruitInvitation } from "@/lib/email/notifications/recruitInvitation";

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
    referrer_ids?: unknown;
    applicant_image_url?: unknown;
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
  const applicantImageUrl = normalizeString(body.applicant_image_url);

  const referrerIds: number[] = Array.isArray(body.referrer_ids)
    ? body.referrer_ids.filter(
        (id): id is number => typeof id === "number" && Number.isFinite(id),
      )
    : [];

  if (!name || !nickname || !contact) {
    return NextResponse.json(
      { error: "name, nickname, and contact are required." },
      { status: 400 },
    );
  }

  if (referrerIds.length === 0) {
    return NextResponse.json(
      { error: "At least one referrer_id is required." },
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
      applicant_image_url: applicantImageUrl,
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

  const signupId = data.id as string;

  // Bulk-insert referrer rows
  const { error: referrerError } = await serviceClient
    .from("signups_players_referrers")
    .insert(
      referrerIds.map((referrerPlayerId) => ({
        signup_id: signupId,
        referrer_player_id: referrerPlayerId,
        is_named_referrer: true,
      })),
    );

  if (referrerError) {
    console.error("Failed to insert referrer rows:", referrerError.message);
    // Non-fatal: signup was created; log and continue
  }

  // Fetch referrer contact details for email notifications
  const { data: referrerPlayers } = await serviceClient
    .from("players")
    .select("player_id, name, email")
    .in("player_id", referrerIds);

  // Send admin notification
  await notifyNewMemberApplication({ name, nickname, email, contact }).catch(
    (err) => console.error("[email] notifyNewMemberApplication failed:", err),
  );

  // Send invitation emails to each referrer sequentially (rate-limit rules)
  for (const referrer of referrerPlayers ?? []) {
    if (!referrer.email) continue;
    await notifyRecruitInvitation({
      referrerPlayerId: referrer.player_id as number,
      referrerEmail: referrer.email as string,
      referrerName: referrer.name as string | null,
      applicantName: name,
      signupId,
    }).catch((err) =>
      console.error(
        `[email] notifyRecruitInvitation failed for player_id=${referrer.player_id}:`,
        err,
      ),
    );
  }

  return NextResponse.json({ applied: true, signup_id: signupId }, { status: 201 });
}
