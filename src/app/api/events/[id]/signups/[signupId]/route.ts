import { NextResponse } from "next/server";
import { getServerServiceClient } from "@/app/api/_lib/supabase";
import { resolveCallerPlayerId, isAdminUser } from "@/app/api/events/_lib/auth";
import { applySignupStatus } from "@/app/api/events/_lib/signupStatus";
import type { EventSignupStatus } from "@/lib/eventSignupStatus";

const ALLOWED_SIGNUP_STATUSES: EventSignupStatus[] = [
  "applied",
  "pending_payment",
  "accepted",
  "waitlisted",
  "cancelled",
];

/** PATCH /api/events/[id]/signups/[signupId] — creator or admin updates a signup's status
 *  Body: { status, apply_to_partner? }
 *
 *  On a confirmed pair the status carries to both halves by default, so a host can't
 *  accidentally accept one player and leave their partner behind.
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
    .select("event_id, created_by_player_id, name")
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
    typeof statusRaw === "string" &&
    ALLOWED_SIGNUP_STATUSES.includes(statusRaw as EventSignupStatus)
      ? (statusRaw as EventSignupStatus)
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

  const applyToPartner = body.apply_to_partner !== false;

  let result;
  try {
    result = await applySignupStatus({
      client: serviceClient,
      eventId,
      eventName: event.name ?? null,
      signupId,
      status,
      applyToPartner,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update signup." },
      { status: 500 },
    );
  }

  if ("notFound" in result) {
    return NextResponse.json({ error: "Signup not found." }, { status: 404 });
  }

  // `signup` is kept for existing callers doing optimistic single-row updates.
  return NextResponse.json({
    signup: result.primary,
    signups: result.signups,
    warning: result.warning,
  });
}
