import { NextResponse } from "next/server";
import { getAuthorizedPlayer } from "@/app/api/ladder/_lib/currentPlayer";
import { joinLadderQueue } from "@/lib/ladder/ladderQueue";

const STATUS_BY_CODE: Record<string, number> = {
  no_active_cycle: 409,
  not_placed: 409,
  already_waiting: 409,
  has_open_match: 409,
  error: 500,
};

export async function POST(request: Request) {
  const auth = await getAuthorizedPlayer(request);
  if (!auth.ok) return auth.response;

  const result = await joinLadderQueue(auth.supabase, auth.playerId);
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
