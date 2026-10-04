import { NextResponse } from "next/server";
import {
  getAuthorizedAdminClient,
  isRecord,
  normalizeOptionalString,
  normalizeRequiredPositiveInteger,
} from "@/app/api/admin/_lib/auth";
import { applyAdminStarAdjustment } from "@/lib/ladder/ladderAdminAdjustment";

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!isRecord(payload)) {
    return NextResponse.json({ error: "Body must be an object." }, { status: 400 });
  }

  const playerId = normalizeRequiredPositiveInteger(payload.playerId);
  const delta = payload.delta === 1 || payload.delta === -1 ? payload.delta : null;
  const reason = normalizeOptionalString(payload.reason);
  if (!playerId || !delta || !reason) {
    return NextResponse.json(
      { error: "playerId, delta (1 or -1) and a reason are required." },
      { status: 400 },
    );
  }

  const auth = await getAuthorizedAdminClient(request);
  if (!auth.ok) return auth.response;

  const result = await applyAdminStarAdjustment(auth.supabase, {
    playerId,
    delta,
    reason,
    adminUserId: auth.userId,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result, { status: 200 });
}
