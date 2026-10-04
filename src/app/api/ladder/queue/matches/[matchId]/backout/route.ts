import { NextResponse } from "next/server";
import { normalizeRequiredPositiveInteger } from "@/app/api/admin/_lib/auth";
import { getAuthorizedPlayer } from "@/app/api/ladder/_lib/currentPlayer";
import { cancelQueueMatch } from "@/lib/ladder/ladderQueue";

// A player backs out of their queue match: the match is cancelled, the backout is recorded on
// ladder_matches (that row IS the strike), and the other three go back into the queue at their
// original spot. ladder_queue_cancel_match validates that the caller is actually in the match.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const { matchId: rawMatchId } = await params;
  const matchId = normalizeRequiredPositiveInteger(rawMatchId);
  if (!matchId) {
    return NextResponse.json({ error: "Invalid match id." }, { status: 400 });
  }

  const auth = await getAuthorizedPlayer(request);
  if (!auth.ok) return auth.response;

  const result = await cancelQueueMatch(auth.supabase, {
    matchId,
    reason: "backout",
    byPlayerId: auth.playerId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  return NextResponse.json({ requeued: result.requeuedPlayerIds.length }, { status: 200 });
}
