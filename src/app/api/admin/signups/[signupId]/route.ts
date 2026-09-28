import { NextResponse } from "next/server";
import { getAuthorizedAdminClient } from "@/app/api/admin/_lib/auth";
import { applySignupStatus } from "@/app/api/events/_lib/signupStatus";
import type { EventSignupStatus } from "@/lib/eventSignupStatus";

const ALLOWED_SIGNUP_STATUSES: EventSignupStatus[] = [
  "applied",
  "pending_payment",
  "accepted",
  "waitlisted",
  "cancelled",
];

/** PATCH /api/admin/signups/:signupId — update signup status
 *  Body: { status, apply_to_partner? }
 *
 *  Mirrors PATCH /api/events/[id]/signups/[signupId]: on a confirmed pair the status
 *  carries to both halves unless apply_to_partner is false.
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
    return NextResponse.json({ error: "signupId is required." }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
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

  const { supabase } = authResult;

  // This route is keyed on the signup alone, so resolve its event first.
  const { data: signupRow } = await supabase
    .from("signups_events")
    .select("id, event_id")
    .eq("id", signupId)
    .maybeSingle();

  if (!signupRow) {
    return NextResponse.json({ error: "Signup not found." }, { status: 404 });
  }

  const eventId = Number(signupRow.event_id);
  const { data: eventRecord } = await supabase
    .from("events")
    .select("name")
    .eq("event_id", eventId)
    .maybeSingle();

  let result;
  try {
    result = await applySignupStatus({
      client: supabase,
      eventId,
      eventName: eventRecord?.name ?? null,
      signupId,
      status,
      applyToPartner: body.apply_to_partner !== false,
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

  return NextResponse.json({
    signup: result.primary,
    signups: result.signups,
    warning: result.warning,
  });
}
