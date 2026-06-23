import { NextResponse } from "next/server";
import {
  getAuthorizedAdminClient,
} from "@/app/api/admin/_lib/auth";
import { notifySignupPaymentRequired } from "@/lib/email/notifications/signupPaymentRequired";
import { notifySignupAccepted } from "@/lib/email/notifications/signupAccepted";

type SignupStatus = "applied" | "pending_payment" | "accepted" | "waitlisted" | "cancelled";

const ALLOWED_SIGNUP_STATUSES: SignupStatus[] = [
  "applied",
  "pending_payment",
  "accepted",
  "waitlisted",
  "cancelled",
];

/** PATCH /api/admin/signups/:signupId — update signup status
 *  Body: { status }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ signupId: string }> },
) {
  const authResult = await getAuthorizedAdminClient(request);
  if (!authResult.ok) return authResult.response;

  const { signupId: rawSignupId } = await params;
  const signupId = rawSignupId.trim();

  if (!signupId) {
    return NextResponse.json(
      { error: "signupId is required." },
      { status: 400 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const statusRaw = body.status;
  const status =
    typeof statusRaw === "string" && ALLOWED_SIGNUP_STATUSES.includes(statusRaw as SignupStatus)
      ? (statusRaw as SignupStatus)
      : null;

  if (!status) {
    return NextResponse.json(
      {
        error:
          "status must be one of applied, pending_payment, accepted, waitlisted, cancelled.",
      },
      { status: 400 },
    );
  }

  const { supabase } = authResult;

  const { data: previousSignup } = await supabase
    .from("signups_events")
    .select("status, player_id, event_id")
    .eq("id", signupId)
    .maybeSingle();

  const { data, error } = await supabase
    .from("signups_events")
    .update({ status })
    .eq("id", signupId)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Signup not found." }, { status: 404 });
  }

  if (
    previousSignup &&
    previousSignup.status !== status &&
    data.player_id &&
    (status === "pending_payment" || status === "accepted")
  ) {
    const [{ data: player }, { data: eventRecord }] = await Promise.all([
      supabase.from("players").select("name, nickname, email").eq("player_id", data.player_id).maybeSingle(),
      supabase.from("events").select("name").eq("event_id", data.event_id).maybeSingle(),
    ]);

    if (player?.email) {
      const notifyData = {
        playerId: data.player_id,
        playerEmail: player.email,
        playerName: player.name ?? null,
        playerNickname: player.nickname ?? null,
        eventId: data.event_id,
        eventName: eventRecord?.name ?? null,
      };
      if (status === "pending_payment") {
        await notifySignupPaymentRequired(notifyData).catch((err) =>
          console.error("[email] notifySignupPaymentRequired failed:", err),
        );
      } else {
        await notifySignupAccepted(notifyData).catch((err) =>
          console.error("[email] notifySignupAccepted failed:", err),
        );
      }
    }
  }

  return NextResponse.json({ signup: data });
}
