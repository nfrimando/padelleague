import { NextResponse } from "next/server";
import {
  getAuthorizedAdminClient,
  isRecord,
  normalizeRequiredPositiveInteger,
} from "@/app/api/admin/_lib/auth";
import { joinLadderQueue, setLadderAutoRequeue } from "@/lib/ladder/ladderQueue";

// Toggles a player's solo ladder auto-requeue on their behalf. Mirrors the self-serve
// /api/ladder/queue/auto-requeue: turning it on also queues them right away when they're idle, and
// joinLadderQueue's own guards make that a no-op when they're already waiting or holding a match.
export async function POST(request: Request) {
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
  const enabled = isRecord(payload) ? payload.enabled : undefined;
  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be a boolean." }, { status: 400 });
  }

  const auth = await getAuthorizedAdminClient(request);
  if (!auth.ok) return auth.response;

  const saved = await setLadderAutoRequeue(auth.supabase, [playerId], enabled);
  if (!saved.ok) {
    return NextResponse.json({ error: saved.error ?? "Failed to save." }, { status: 500 });
  }

  let matchId: number | null = null;
  let joined = false;
  let joinWarning: string | null = null;
  if (enabled) {
    const result = await joinLadderQueue(auth.supabase, playerId);
    if (result.ok) {
      joined = true;
      matchId = result.matchId;
    } else if (result.code !== "already_waiting" && result.code !== "has_open_match") {
      joinWarning = result.error;
    }
  }

  return NextResponse.json({ autoRequeue: enabled, joined, matchId, joinWarning }, { status: 200 });
}
