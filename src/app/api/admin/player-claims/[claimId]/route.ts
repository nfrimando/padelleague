import { NextResponse } from "next/server";
import { getAuthorizedAdminClient } from "@/app/api/admin/_lib/auth";
import { notifyClaimApproved } from "@/lib/email/notifications/claimApproved";

/** PATCH /api/admin/player-claims/[claimId]
 *  Body: { approved: boolean }
 *  - Approve: links claimed_by_email to the player and sets is_profile_complete=true;
 *             rejects all other pending claims for that player.
 *  - Reject: sets the claim status to 'rejected'.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ claimId: string }> },
) {
  const authResult = await getAuthorizedAdminClient(request);
  if (!authResult.ok) return authResult.response;

  const { supabase } = authResult;
  const { claimId } = await params;

  let body: { approved?: unknown; notes?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof body.approved !== "boolean") {
    return NextResponse.json({ error: "approved (boolean) is required." }, { status: 400 });
  }

  const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;

  // 1. Fetch the claim
  const { data: claim, error: claimError } = await supabase
    .from("player_claims")
    .select("id, player_id, claimed_by_email, claimed_by_name, status")
    .eq("id", claimId)
    .maybeSingle();

  if (claimError) {
    return NextResponse.json({ error: claimError.message }, { status: 500 });
  }

  if (!claim) {
    return NextResponse.json({ error: "Claim not found." }, { status: 404 });
  }

  if (claim.status !== "pending") {
    return NextResponse.json(
      { error: "Claim has already been reviewed." },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();

  if (body.approved) {
    // 2a. Verify the target player still has no email (guard against race)
    const { data: targetPlayer, error: playerError } = await supabase
      .from("players")
      .select("player_id, email, name, nickname")
      .eq("player_id", claim.player_id)
      .maybeSingle();

    if (playerError || !targetPlayer) {
      return NextResponse.json({ error: "Player not found." }, { status: 404 });
    }

    if (targetPlayer.email !== null) {
      // Someone else was approved or the player already has an email
      await supabase
        .from("player_claims")
        .update({ status: "rejected", reviewed_at: now, notes })
        .eq("id", claimId);

      return NextResponse.json(
        { error: "This player already has a linked account. Claim auto-rejected." },
        { status: 409 },
      );
    }

    // 2b. Link email + verify the player
    const { error: updateError } = await supabase
      .from("players")
      .update({ email: claim.claimed_by_email, is_profile_complete: true })
      .eq("player_id", claim.player_id);

    if (updateError) {
      console.error("Failed to update player email:", updateError.message);
      return NextResponse.json({ error: "Failed to update player." }, { status: 500 });
    }

    // 2c. Approve this claim
    await supabase
      .from("player_claims")
      .update({ status: "approved", reviewed_at: now, notes })
      .eq("id", claimId);

    // 2d. Notify the claimant
    await notifyClaimApproved({
      playerId: claim.player_id,
      playerName: targetPlayer.name,
      playerNickname: targetPlayer.nickname,
      claimedByEmail: claim.claimed_by_email,
      claimedByName: claim.claimed_by_name ?? null,
    }).catch((err) => console.error("[email] claimApproved notification failed:", err));

    // 2e. Reject all other pending claims for this player
    await supabase
      .from("player_claims")
      .update({ status: "rejected", reviewed_at: now })
      .eq("player_id", claim.player_id)
      .eq("status", "pending")
      .neq("id", claimId);
  } else {
    // 3. Reject the claim
    const { error: rejectError } = await supabase
      .from("player_claims")
      .update({ status: "rejected", reviewed_at: now, notes })
      .eq("id", claimId);

    if (rejectError) {
      return NextResponse.json({ error: rejectError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
