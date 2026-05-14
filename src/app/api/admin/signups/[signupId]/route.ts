import { NextResponse } from "next/server";
import {
  getAuthorizedAdminClient,
} from "@/app/api/admin/_lib/auth";

type SignupStatus = "registered" | "accepted" | "waitlisted" | "cancelled";

const ALLOWED_SIGNUP_STATUSES: SignupStatus[] = [
  "registered",
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
          "status must be one of registered, accepted, waitlisted, cancelled.",
      },
      { status: 400 },
    );
  }

  const { supabase } = authResult;

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

  return NextResponse.json({ signup: data });
}
