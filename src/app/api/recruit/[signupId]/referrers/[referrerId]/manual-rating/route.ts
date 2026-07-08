import { NextResponse } from "next/server";
import { getServerServiceClient } from "@/app/api/_lib/supabase";
import { getAuthorizedPlayer } from "@/app/api/recruit/_lib/auth";

/**
 * POST /api/recruit/[signupId]/referrers/[referrerId]/manual-rating
 *
 * Admin-only. Lets an admin record a referrer's rating directly (e.g. the referrer gave a
 * number verbally instead of completing the comparison survey). Writes straight to
 * initial_rating, the same column the survey writes to, so it counts identically toward the
 * rated-count and any averaging done at approval time.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ signupId: string; referrerId: string }> },
) {
  const auth = await getAuthorizedPlayer(request);
  if (!auth.ok) return auth.response;

  if (!auth.isAdmin) {
    return NextResponse.json(
      { error: "Forbidden. Admin access is required." },
      { status: 403 },
    );
  }

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

  const { data: signup } = await serviceClient
    .from("signups_players")
    .select("status")
    .eq("id", signupId)
    .maybeSingle();

  if (signup?.status === "accepted" || signup?.status === "cancelled") {
    return NextResponse.json(
      { error: "This application is no longer open for input." },
      { status: 409 },
    );
  }

  let body: { rating?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (
    typeof body.rating !== "number" ||
    !Number.isFinite(body.rating) ||
    body.rating < 0
  ) {
    return NextResponse.json(
      { error: "rating must be a non-negative number." },
      { status: 400 },
    );
  }
  const rating = Math.round(body.rating * 100) / 100;

  const { data, error } = await serviceClient
    .from("signups_players_referrers")
    .update({
      initial_rating: rating,
      submitted_by_player_id: auth.playerId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", referrerId)
    .select("id, signup_id, referrer_player_id, submitted_by_player_id, initial_rating, notes, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ referrer: data });
}
