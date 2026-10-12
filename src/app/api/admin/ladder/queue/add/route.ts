import { NextResponse } from "next/server";
import {
  getAuthorizedAdminClient,
  isRecord,
  normalizeRequiredPositiveInteger,
} from "@/app/api/admin/_lib/auth";
import { joinLadderQueue } from "@/lib/ladder/ladderQueue";

const STATUS_BY_CODE: Record<string, number> = {
  no_active_cycle: 409,
  not_placed: 409,
  already_waiting: 409,
  has_open_match: 409,
  error: 500,
};

// Queues a player on their behalf (same rules as the self-serve join), for members who can't do it
// themselves. Matchmaking runs immediately, so this can form a match.
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

  const auth = await getAuthorizedAdminClient(request);
  if (!auth.ok) return auth.response;

  const result = await joinLadderQueue(auth.supabase, playerId);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: STATUS_BY_CODE[result.code] ?? 400 },
    );
  }

  return NextResponse.json(
    { matchId: result.matchId, waitingCount: result.waitingCount, tierId: result.tierId },
    { status: 200 },
  );
}
