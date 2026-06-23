import { NextResponse } from "next/server";
import { getServerServiceClient } from "@/app/api/_lib/supabase";
import {
  getAuthorizedAdminClient,
  isRecord,
  normalizeOptionalString,
} from "@/app/api/admin/_lib/auth";

/** POST /api/recruit/[signupId]/cancel — mark an application as cancelled (admin only) */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ signupId: string }> },
) {
  const auth = await getAuthorizedAdminClient(request);
  if (!auth.ok) return auth.response;

  const { signupId } = await params;
  const serviceClient = getServerServiceClient();

  const body: unknown = await request.json().catch(() => ({}));
  const notes = isRecord(body) ? normalizeOptionalString(body.notes) : null;

  const { data: signup, error: signupError } = await serviceClient
    .from("signups_players")
    .select("id, status, player_id")
    .eq("id", signupId)
    .maybeSingle();

  if (signupError) {
    return NextResponse.json({ error: signupError.message }, { status: 500 });
  }

  if (!signup) {
    return NextResponse.json(
      { error: "Application not found." },
      { status: 404 },
    );
  }

  if (signup.status === "accepted" || signup.player_id !== null) {
    return NextResponse.json(
      { error: "Application has already been recruited and cannot be cancelled." },
      { status: 409 },
    );
  }

  if (signup.status === "cancelled") {
    return NextResponse.json(
      { error: "Application has already been cancelled." },
      { status: 409 },
    );
  }

  const { error: cancelError } = await serviceClient
    .from("signups_players")
    .update({ status: "cancelled", notes })
    .eq("id", signupId);

  if (cancelError) {
    return NextResponse.json({ error: cancelError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, notes });
}
