import { NextResponse } from "next/server";
import {
  getAuthorizedAdminClient,
  isRecord,
  normalizeRequiredPositiveInteger,
} from "@/app/api/admin/_lib/auth";
import { cancelQueueMatch } from "@/lib/ladder/ladderQueue";

// Admin backs a player out of their queue match on their behalf — identical to the player doing it:
// the match is cancelled, that player takes the strike, and the other three are requeued at their
// original spot. Body: { playerId }. ladder_queue_cancel_match validates the player is in the match.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const { matchId: rawMatchId } = await params;
  const matchId = normalizeRequiredPositiveInteger(rawMatchId);
  if (!matchId) {
    return NextResponse.json({ error: "Invalid match id." }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const playerId = isRecord(payload) ? normalizeRequiredPositiveInteger(payload.playerId) : null;
  if (!playerId) {
    return NextResponse.json({ error: "playerId is required." }, { status: 400 });
  }

  const auth = await getAuthorizedAdminClient(request);
  if (!auth.ok) return auth.response;

  const result = await cancelQueueMatch(auth.supabase, {
    matchId,
    reason: "backout",
    byPlayerId: playerId,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  return NextResponse.json({ requeued: result.requeuedPlayerIds.length }, { status: 200 });
}
