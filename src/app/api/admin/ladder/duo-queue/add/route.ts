import { NextResponse } from "next/server";
import { getAuthorizedAdminClient, isRecord, normalizeRequiredPositiveInteger } from "@/app/api/admin/_lib/auth";
import { revalidateLadderPage } from "@/app/api/ladder/_lib/duo";
import { joinDuoQueue } from "@/lib/ladder/ladderDuoQueue";

const STATUS_BY_CODE: Record<string, number> = {
  no_active_cycle: 409,
  not_placed: 409,
  already_waiting: 409,
  member_busy: 409,
  has_open_match: 409,
  duo_inactive: 409,
  error: 500,
};

// POST /api/admin/ladder/duo-queue/add — Body: { duoId }. Queues a duo on its members' behalf.
export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const duoId = isRecord(payload) ? normalizeRequiredPositiveInteger(payload.duoId) : null;
  if (!duoId) return NextResponse.json({ error: "duoId is required." }, { status: 400 });

  const auth = await getAuthorizedAdminClient(request);
  if (!auth.ok) return auth.response;

  const result = await joinDuoQueue(auth.supabase, { duoId, playerId: null });
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
