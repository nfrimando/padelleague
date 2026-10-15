import { NextResponse } from "next/server";
import { getAuthorizedPlayer } from "@/app/api/ladder/_lib/currentPlayer";
import { joinLadderQueue, setLadderAutoRequeue } from "@/lib/ladder/ladderQueue";

// Toggles the signed-in player's solo ladder auto-requeue. Turning it on also joins the queue right
// away when they're idle (no ticket, no open match) — "keep me in the queue" starts now. joinLadderQueue's
// own guards make that a no-op when they're already waiting or holding a match.
export async function POST(request: Request) {
  const auth = await getAuthorizedPlayer(request);
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as { enabled?: unknown } | null;
  if (typeof body?.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 });
  }
  const enabled = body.enabled;

  const saved = await setLadderAutoRequeue(auth.supabase, [auth.playerId], enabled);
  if (!saved.ok) {
    return NextResponse.json({ error: saved.error ?? "Failed to save." }, { status: 500 });
  }

  let matchId: number | null = null;
  let joined = false;
  let joinWarning: string | null = null;
  if (enabled) {
    const result = await joinLadderQueue(auth.supabase, auth.playerId);
    if (result.ok) {
      joined = true;
      matchId = result.matchId;
    } else if (result.code !== "already_waiting" && result.code !== "has_open_match") {
      joinWarning = result.error;
    }
  }

  return NextResponse.json({ autoRequeue: enabled, joined, matchId, joinWarning }, { status: 200 });
}
