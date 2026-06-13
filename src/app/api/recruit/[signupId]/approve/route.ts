import { NextResponse } from "next/server";
import { getServerServiceClient } from "@/app/api/_lib/supabase";
import { getAuthorizedAdminClient } from "@/app/api/admin/_lib/auth";
import { MIN_REFERRER_RATINGS } from "@/lib/recruitConfig";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ signupId: string }> },
) {
  const auth = await getAuthorizedAdminClient(request);
  if (!auth.ok) return auth.response;

  const { signupId } = await params;
  const serviceClient = getServerServiceClient();

  const { data: signup, error: signupError } = await serviceClient
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
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  if (signup.status !== "registered" || signup.player_id !== null) {
    return NextResponse.json(
      { error: "Application has already been reviewed." },
      { status: 409 },
    );
  }

  // Load referrer rows with ratings
  const { data: referrerRows, error: referrerError } = await serviceClient
    .from("signups_players_referrers")
    .select("id, referrer_player_id, initial_rating")
    .eq("signup_id", signupId);

  if (referrerError) {
    return NextResponse.json({ error: referrerError.message }, { status: 500 });
  }

  const ratedRows = (referrerRows ?? []).filter(
    (r) => r.initial_rating !== null,
  );

  if (ratedRows.length < MIN_REFERRER_RATINGS) {
    return NextResponse.json(
      {
        error: `At least ${MIN_REFERRER_RATINGS} referrer ratings are required. Currently ${ratedRows.length}.`,
      },
      { status: 422 },
    );
  }

  const avgRating =
    Math.round(
      (ratedRows.reduce((sum, r) => sum + Number(r.initial_rating), 0) /
        ratedRows.length) *
        100,
    ) / 100;

  const name = (signup.applicant_name as string | null)?.trim();
  const nickname = (signup.applicant_nickname as string | null)?.trim();
  const email = (signup.applicant_email as string | null)?.trim() || null;

  if (!name || !nickname) {
    return NextResponse.json(
      { error: "Application is missing name or nickname." },
      { status: 422 },
    );
  }

  let playerId: number | null = null;

  if (email) {
    const { data: existingPlayer } = await serviceClient
      .from("players")
      .select("player_id")
      .eq("email", email)
      .maybeSingle();

    if (existingPlayer?.player_id) {
      playerId = existingPlayer.player_id as number;
    }
  }

  if (playerId === null) {
    const { data: createdPlayer, error: createPlayerError } = await serviceClient
      .from("players")
      .insert({
        name,
        nickname,
        email,
        is_profile_complete: true,
        initial_rating: avgRating,
      })
      .select("player_id")
      .single();

    if (createPlayerError || !createdPlayer) {
      return NextResponse.json(
        { error: createPlayerError?.message ?? "Failed to create player." },
        { status: 500 },
      );
    }

    playerId = createdPlayer.player_id as number;
  } else {
    // Update existing player's initial_rating
    await serviceClient
      .from("players")
      .update({ initial_rating: avgRating, is_profile_complete: true })
      .eq("player_id", playerId);
  }

  const { error: approveError } = await serviceClient
    .from("signups_players")
    .update({ status: "accepted", player_id: playerId })
    .eq("id", signupId);

  if (approveError) {
    return NextResponse.json({ error: approveError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    player_id: playerId,
    avg_rating: avgRating,
  });
}
