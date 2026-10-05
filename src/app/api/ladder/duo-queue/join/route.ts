import { NextResponse } from "next/server";
import { normalizeRequiredPositiveInteger } from "@/app/api/admin/_lib/auth";
import { authorizeDuoRequest, readJsonBody, revalidateLadderPage } from "@/app/api/ladder/_lib/duo";
import { joinDuoQueue } from "@/lib/ladder/ladderDuoQueue";

const STATUS_BY_CODE: Record<string, number> = {
  no_active_cycle: 409,
  not_placed: 409,
  already_waiting: 409,
  member_busy: 409,
  has_open_match: 409,
  duo_inactive: 409,
  not_member: 403,
  error: 500,
};

// POST /api/ladder/duo-queue/join — Body: { duoId }. Either member can queue the duo.
export async function POST(request: Request) {
  const body = await readJsonBody(request);
  const duoId = normalizeRequiredPositiveInteger(body?.duoId);
  if (!duoId) return NextResponse.json({ error: "duoId is required." }, { status: 400 });

  const auth = await authorizeDuoRequest(request);
  if (!auth.ok) return auth.response;

  const result = await joinDuoQueue(auth.supabase, { duoId, playerId: auth.playerId });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: STATUS_BY_CODE[result.code] ?? 400 },
    );
  }

  if (result.matchId) revalidateLadderPage();
  return NextResponse.json(
    { matchId: result.matchId, waitingCount: result.waitingCount, tierId: result.tierId },
    { status: 200 },
  );
}
