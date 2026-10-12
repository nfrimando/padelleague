import { NextResponse } from "next/server";
import {
  getAuthorizedAdminClient,
  isRecord,
  normalizeOptionalString,
  normalizeRequiredPositiveInteger,
} from "@/app/api/admin/_lib/auth";
import { fetchActiveCycleId, fetchBackoutCounts } from "@/lib/ladder/ladderQueue";
import { fetchDuoBackoutCounts } from "@/lib/ladder/ladderDuoQueue";
import { applyStrikeAdjustment } from "@/lib/ladder/ladderStrikes";

// Manually adds or removes one strike for the active cycle.
// Body: { playerId | duoId, delta: 1 | -1, reason }
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
  const duoId = normalizeRequiredPositiveInteger(payload.duoId);
  const delta = payload.delta === 1 || payload.delta === -1 ? payload.delta : null;
  const reason = normalizeOptionalString(payload.reason);
  if (!!playerId === !!duoId || !delta || !reason) {
    return NextResponse.json(
      { error: "One of playerId / duoId, delta (1 or -1) and a reason are required." },
      { status: 400 },
    );
  }

  const auth = await getAuthorizedAdminClient(request);
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const cycleId = await fetchActiveCycleId(supabase);
  if (!cycleId) {
    return NextResponse.json({ error: "There's no active ladder cycle." }, { status: 409 });
  }

  const currentStrikes = playerId
    ? (await fetchBackoutCounts(supabase, cycleId)).get(playerId) ?? 0
    : (await fetchDuoBackoutCounts(supabase, cycleId)).get(duoId as number) ?? 0;

  const result = await applyStrikeAdjustment(supabase, {
    cycleId,
    subject: playerId ? { playerId } : { duoId: duoId as number },
    currentStrikes,
    delta,
    reason,
    adminUserId: auth.userId,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result, { status: 200 });
}
