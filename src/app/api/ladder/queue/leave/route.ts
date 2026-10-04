import { NextResponse } from "next/server";
import { getAuthorizedPlayer } from "@/app/api/ladder/_lib/currentPlayer";
import { leaveLadderQueue } from "@/lib/ladder/ladderQueue";

export async function POST(request: Request) {
  const auth = await getAuthorizedPlayer(request);
  if (!auth.ok) return auth.response;

  const result = await leaveLadderQueue(auth.supabase, auth.playerId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}
