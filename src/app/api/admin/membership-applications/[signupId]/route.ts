import { NextResponse } from "next/server";
import { getAuthorizedAdminClient } from "@/app/api/admin/_lib/auth";

/** PATCH /api/admin/membership-applications/[signupId]
 * Body: { approved: boolean }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ signupId: string }> },
) {
  const authResult = await getAuthorizedAdminClient(request);
  if (!authResult.ok) return authResult.response;

  const { supabase } = authResult;
  const { signupId } = await params;

  let body: { approved?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof body.approved !== "boolean") {
    return NextResponse.json({ error: "approved (boolean) is required." }, { status: 400 });
  }

  const { data: signup, error: signupError } = await supabase
    .from("signups_players")
    .select(
      "id, status, player_id, applicant_name, applicant_nickname, applicant_email",
    )
    .eq("id", signupId)
    .maybeSingle();

  if (signupError) {
    return NextResponse.json({ error: signupError.message }, { status: 500 });
  }

  if (!signup) {
    return NextResponse.json({ error: "Membership application not found." }, { status: 404 });
  }

  if (signup.status !== "registered" || signup.player_id !== null) {
    return NextResponse.json(
      { error: "Application has already been reviewed." },
      { status: 409 },
    );
  }

  if (!body.approved) {
    const { error: rejectError } = await supabase
      .from("signups_players")
      .update({ status: "cancelled" })
      .eq("id", signupId);

    if (rejectError) {
      return NextResponse.json({ error: rejectError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, approved: false });
  }

  const name = signup.applicant_name?.trim();
  const nickname = signup.applicant_nickname?.trim();
  const email = signup.applicant_email?.trim() || null;

  if (!name || !nickname) {
    return NextResponse.json(
      { error: "Application is missing name or nickname." },
      { status: 422 },
    );
  }

  let playerId: number | null = null;

  if (email) {
    const { data: existingPlayer, error: existingPlayerError } = await supabase
      .from("players")
      .select("player_id")
      .eq("email", email)
      .maybeSingle();

    if (existingPlayerError) {
      return NextResponse.json(
        { error: existingPlayerError.message },
        { status: 500 },
      );
    }

    if (existingPlayer?.player_id) {
      playerId = existingPlayer.player_id;
    }
  }

  if (playerId === null) {
    const { data: createdPlayer, error: createPlayerError } = await supabase
      .from("players")
      .insert({
        name,
        nickname,
        email,
        is_profile_complete: true,
        auto_renew_season: false,
      })
      .select("player_id")
      .single();

    if (createPlayerError || !createdPlayer) {
      return NextResponse.json(
        { error: createPlayerError?.message ?? "Failed to create player." },
        { status: 500 },
      );
    }

    playerId = createdPlayer.player_id;
  }

  const { error: approveError } = await supabase
    .from("signups_players")
    .update({ status: "accepted", player_id: playerId })
    .eq("id", signupId);

  if (approveError) {
    return NextResponse.json({ error: approveError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, approved: true, player_id: playerId });
}
