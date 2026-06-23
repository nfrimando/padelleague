import { NextResponse } from "next/server";
import { getServerServiceClient } from "@/app/api/_lib/supabase";
import { resolveCallerPlayerId, isAdminUser } from "@/app/api/events/_lib/auth";

type SignupStatus =
  | "applied"
  | "pending_payment"
  | "accepted"
  | "waitlisted"
  | "cancelled";

const ALLOWED_SIGNUP_STATUSES: SignupStatus[] = [
  "applied",
  "pending_payment",
  "accepted",
  "waitlisted",
  "cancelled",
];

/** PATCH /api/events/[id]/signups/[signupId] — creator or admin updates a signup's status
 *  Body: { status }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; signupId: string }> },
) {
  const { id, signupId: rawSignupId } = await params;
  const eventId = parseInt(id, 10);
  const signupId = rawSignupId.trim();
  if (isNaN(eventId) || !signupId) {
    return NextResponse.json({ error: "Invalid event or signup ID." }, { status: 400 });
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const serviceClient = getServerServiceClient();

  const { data: event, error: eventError } = await serviceClient
    .from("events")
    .select("event_id, created_by_player_id")
    .eq("event_id", eventId)
    .is("deleted_at", null)
    .maybeSingle();

  if (eventError) return NextResponse.json({ error: eventError.message }, { status: 500 });
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });

  const [playerId, adminFlag] = await Promise.all([
    resolveCallerPlayerId(authorization),
    isAdminUser(authorization),
  ]);

  const canManage =
    adminFlag || (playerId !== null && playerId === event.created_by_player_id);
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
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

  const { data, error } = await serviceClient
    .from("signups_events")
    .update({ status })
    .eq("id", signupId)
    .eq("event_id", eventId)
    .select("*")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Signup not found." }, { status: 404 });

  return NextResponse.json({ signup: data });
}
