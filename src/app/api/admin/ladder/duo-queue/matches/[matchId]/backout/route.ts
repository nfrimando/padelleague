import { NextResponse } from "next/server";
import { getAuthorizedAdminClient, isRecord, normalizeRequiredPositiveInteger } from "@/app/api/admin/_lib/auth";
import { revalidateLadderPage } from "@/app/api/ladder/_lib/duo";
import { cancelDuoQueueMatch } from "@/lib/ladder/ladderDuoQueue";

// Admin backs a duo out of its duo queue match on a member's behalf — identical to the member doing
// it: that duo takes the strike and the other duo is requeued. Body: { playerId } (a member of the
// backing-out duo); the SQL function validates they're in the match.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const { matchId: rawMatchId } = await params;
  const matchId = normalizeRequiredPositiveInteger(rawMatchId);
  if (!matchId) return NextResponse.json({ error: "Invalid match id." }, { status: 400 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const playerId = isRecord(payload) ? normalizeRequiredPositiveInteger(payload.playerId) : null;
  if (!playerId) return NextResponse.json({ error: "playerId is required." }, { status: 400 });

  const auth = await getAuthorizedAdminClient(request);
  if (!auth.ok) return auth.response;

  const result = await cancelDuoQueueMatch(auth.supabase, {
    matchId,
    reason: "backout",
    byPlayerId: playerId,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });

  revalidateLadderPage();
  return NextResponse.json({ requeuedDuos: result.requeuedDuoIds.length }, { status: 200 });
}
