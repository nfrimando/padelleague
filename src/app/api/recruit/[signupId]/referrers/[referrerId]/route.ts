import { NextResponse } from "next/server";
import { getServerServiceClient } from "@/app/api/_lib/supabase";
import { getAuthorizedPlayer } from "@/app/api/recruit/_lib/auth";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ signupId: string; referrerId: string }> },
) {
  const auth = await getAuthorizedPlayer(request);
  if (!auth.ok) return auth.response;

  const { signupId, referrerId } = await params;
  const serviceClient = getServerServiceClient();

  // Load the referrer row to verify ownership
  const { data: row, error: rowError } = await serviceClient
    .from("signups_players_referrers")
    .select("id, signup_id, referrer_player_id")
    .eq("id", referrerId)
    .eq("signup_id", signupId)
    .maybeSingle();

  if (rowError) {
    return NextResponse.json({ error: rowError.message }, { status: 500 });
  }

  if (!row) {
    return NextResponse.json({ error: "Referrer row not found." }, { status: 404 });
  }

  const isOwner = row.referrer_player_id === auth.playerId;
  if (!isOwner && !auth.isAdmin) {
    return NextResponse.json(
      { error: "You can only update your own referrer assessment." },
      { status: 403 },
    );
  }

  let body: { initial_rating?: unknown; notes?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    submitted_by_player_id: auth.playerId,
  };

  if (body.initial_rating !== undefined) {
    if (
      typeof body.initial_rating !== "number" ||
      !Number.isFinite(body.initial_rating) ||
      body.initial_rating < 0
    ) {
      return NextResponse.json(
        { error: "initial_rating must be a non-negative number." },
        { status: 400 },
      );
    }
    patch.initial_rating = body.initial_rating;
  }

  if (body.notes !== undefined) {
    patch.notes =
      typeof body.notes === "string" ? body.notes.trim() || null : null;
  }

  if (Object.keys(patch).length === 1) {
    return NextResponse.json(
      { error: "Provide at least one of initial_rating or notes." },
      { status: 400 },
    );
  }

  const { data, error } = await serviceClient
    .from("signups_players_referrers")
    .update(patch)
    .eq("id", referrerId)
    .select("id, signup_id, referrer_player_id, submitted_by_player_id, initial_rating, notes, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ referrer: data });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ signupId: string; referrerId: string }> },
) {
  const auth = await getAuthorizedPlayer(request);
  if (!auth.ok) return auth.response;

  const { signupId, referrerId } = await params;
  const serviceClient = getServerServiceClient();

  const { data: row, error: rowError } = await serviceClient
    .from("signups_players_referrers")
    .select("id, signup_id, referrer_player_id")
    .eq("id", referrerId)
    .eq("signup_id", signupId)
    .maybeSingle();

  if (rowError) {
    return NextResponse.json({ error: rowError.message }, { status: 500 });
  }

  if (!row) {
    return NextResponse.json({ error: "Referrer row not found." }, { status: 404 });
  }

  const isOwner = row.referrer_player_id === auth.playerId;
  if (!isOwner && !auth.isAdmin) {
    return NextResponse.json(
      { error: "You can only delete your own referrer assessment." },
      { status: 403 },
    );
  }

  const { data: signup } = await serviceClient
    .from("signups_players")
    .select("status")
    .eq("id", signupId)
    .maybeSingle();

  if (signup?.status === "accepted") {
    return NextResponse.json(
      { error: "Cannot remove an assessment after the applicant has been recruited." },
      { status: 409 },
    );
  }

  const { error: deleteError } = await serviceClient
    .from("signups_players_referrers")
    .delete()
    .eq("id", referrerId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
