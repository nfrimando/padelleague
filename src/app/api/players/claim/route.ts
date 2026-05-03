import { NextResponse } from "next/server";
import {
  getPaymentsServiceClient,
  getPaymentsUserClient,
} from "@/app/api/payments/_lib/supabase";

export async function POST(request: Request) {
  // 1. Authenticate
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Missing or invalid Authorization header." },
      { status: 401 },
    );
  }

  let userClient;
  try {
    userClient = getPaymentsUserClient(authorization);
  } catch (error) {
    console.error("Failed to initialize user Supabase client:", error);
    return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });
  }

  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // 2. Parse body
  let body: { player_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const playerId = typeof body.player_id === "number" ? body.player_id : null;
  if (!playerId) {
    return NextResponse.json({ error: "player_id is required." }, { status: 400 });
  }

  let serviceClient;
  try {
    serviceClient = getPaymentsServiceClient();
  } catch (error) {
    console.error("Failed to initialize service Supabase client:", error);
    return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });
  }

  // 3. Validate target player: must exist, have no email (i.e. claimable), and be verified
  const { data: targetPlayer, error: targetError } = await serviceClient
    .from("players")
    .select("player_id, name, email, is_profile_complete")
    .eq("player_id", playerId)
    .maybeSingle();

  if (targetError) {
    console.error("Player lookup error:", targetError.message);
    return NextResponse.json({ error: "Failed to look up player." }, { status: 500 });
  }

  if (!targetPlayer) {
    return NextResponse.json({ error: "Player not found." }, { status: 404 });
  }

  if (targetPlayer.email !== null) {
    return NextResponse.json(
      { error: "This player already has a linked account." },
      { status: 409 },
    );
  }

  if (!targetPlayer.is_profile_complete) {
    return NextResponse.json(
      { error: "This player profile cannot be claimed." },
      { status: 409 },
    );
  }

  // 4. Check claimant doesn't already have a player record linked to their email
  const { data: existingPlayer } = await serviceClient
    .from("players")
    .select("player_id")
    .eq("email", user.email ?? "")
    .maybeSingle();

  if (existingPlayer) {
    return NextResponse.json(
      { error: "Your account is already linked to a player profile." },
      { status: 409 },
    );
  }

  // 5. Check for existing pending claim from this user
  const { data: existingClaim } = await serviceClient
    .from("player_claims")
    .select("id, status")
    .eq("claimed_by_email", user.email ?? "")
    .eq("status", "pending")
    .maybeSingle();

  if (existingClaim) {
    return NextResponse.json(
      { error: "You already have a pending claim. Wait for admin review before submitting another." },
      { status: 409 },
    );
  }

  // 6. Check no other pending claim exists for this player
  const { data: competingClaim } = await serviceClient
    .from("player_claims")
    .select("id")
    .eq("player_id", playerId)
    .eq("status", "pending")
    .maybeSingle();

  if (competingClaim) {
    return NextResponse.json(
      { error: "Another claim for this player is already pending review." },
      { status: 409 },
    );
  }

  // 7. Insert the claim
  const claimantName =
    (user.user_metadata?.full_name as string | undefined)?.trim() ||
    user.email?.split("@")[0] ||
    null;

  const { data: claim, error: insertError } = await serviceClient
    .from("player_claims")
    .insert({
      player_id: playerId,
      claimed_by_email: user.email,
      claimed_by_name: claimantName,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertError || !claim) {
    console.error("Failed to insert claim:", insertError?.message);
    return NextResponse.json({ error: "Failed to submit claim." }, { status: 500 });
  }

  return NextResponse.json({ claimed: true, claim_id: claim.id }, { status: 201 });
}
