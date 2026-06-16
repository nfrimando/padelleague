import { NextResponse } from "next/server";
import { getServerServiceClient } from "@/app/api/_lib/supabase";
import { getAuthorizedPlayer } from "@/app/api/recruit/_lib/auth";
import { notifyRecruitInvitation } from "@/lib/email/notifications/recruitInvitation";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ signupId: string }> },
) {
  const auth = await getAuthorizedPlayer(request);
  if (!auth.ok) return auth.response;

  const { signupId } = await params;

  let body: { player_id?: unknown; initial_rating?: unknown; notes?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const playerId =
    typeof body.player_id === "number" && Number.isFinite(body.player_id)
      ? body.player_id
      : null;

  const initialRating =
    typeof body.initial_rating === "number" && Number.isFinite(body.initial_rating) && body.initial_rating >= 0
      ? body.initial_rating
      : null;

  const notes =
    typeof body.notes === "string" && body.notes.trim()
      ? body.notes.trim()
      : null;

  if (!playerId) {
    return NextResponse.json({ error: "player_id is required." }, { status: 400 });
  }

  const isSelf = playerId === auth.playerId;

  if (!isSelf && !auth.isAdmin) {
    return NextResponse.json(
      { error: "Only admins can add other members as referrers." },
      { status: 403 },
    );
  }

  // Self-adds are voluntary votes; admin-added entries are named referrers
  const isNamedReferrer = !isSelf;

  const serviceClient = getServerServiceClient();

  const { data: signup } = await serviceClient
    .from("signups_players")
    .select("id, status")
    .eq("id", signupId)
    .maybeSingle();

  if (!signup) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  if (signup.status === "accepted") {
    return NextResponse.json(
      { error: "This application has already been accepted." },
      { status: 409 },
    );
  }

  const { data, error } = await serviceClient
    .from("signups_players_referrers")
    .insert({
      signup_id: signupId,
      referrer_player_id: playerId,
      is_named_referrer: isNamedReferrer,
      submitted_by_player_id: auth.playerId,
      ...(initialRating !== null ? { initial_rating: initialRating } : {}),
      ...(notes !== null ? { notes } : {}),
    })
    .select(
      "id, signup_id, referrer_player_id, submitted_by_player_id, initial_rating, notes, is_named_referrer, created_at, updated_at, referrer:players!referrer_player_id(player_id, name, nickname, image_link)",
    )
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "This player has already submitted an assessment for this application." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Email the newly-added named referrer so they know to assess the applicant
  if (isNamedReferrer) {
    const [{ data: referrerPlayer }, { data: signupRow }] = await Promise.all([
      serviceClient
        .from("players")
        .select("name, email")
        .eq("player_id", playerId)
        .maybeSingle(),
      serviceClient
        .from("signups_players")
        .select("applicant_name")
        .eq("id", signupId)
        .maybeSingle(),
    ]);

    if (referrerPlayer?.email && signupRow?.applicant_name) {
      await notifyRecruitInvitation({
        referrerPlayerId: playerId,
        referrerEmail: referrerPlayer.email as string,
        referrerName: referrerPlayer.name as string | null,
        applicantName: signupRow.applicant_name as string,
        signupId,
      }).catch((err) =>
        console.error(
          `[email] notifyRecruitInvitation failed for referrer_player_id=${playerId}:`,
          err,
        ),
      );
    }
  }

  return NextResponse.json({ referrer: data }, { status: 201 });
}
