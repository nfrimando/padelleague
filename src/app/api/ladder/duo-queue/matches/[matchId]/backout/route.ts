import { NextResponse } from "next/server";
import { normalizeRequiredPositiveInteger } from "@/app/api/admin/_lib/auth";
import { authorizeDuoRequest, revalidateLadderPage } from "@/app/api/ladder/_lib/duo";
import { cancelDuoQueueMatch } from "@/lib/ladder/ladderDuoQueue";

// A member backs their duo out of a duo queue match: the match is cancelled, the backout is
// recorded on ladder_duo_matches against the DUO (that row is the strike), and the other duo goes
// back into the queue at its original spot. The SQL function validates the caller is in the match.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const { matchId: rawMatchId } = await params;
  const matchId = normalizeRequiredPositiveInteger(rawMatchId);
  if (!matchId) return NextResponse.json({ error: "Invalid match id." }, { status: 400 });

  const auth = await authorizeDuoRequest(request);
  if (!auth.ok) return auth.response;

  const result = await cancelDuoQueueMatch(auth.supabase, {
    matchId,
    reason: "backout",
    byPlayerId: auth.playerId,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });

  revalidateLadderPage();
  return NextResponse.json({ requeuedDuos: result.requeuedDuoIds.length }, { status: 200 });
}
