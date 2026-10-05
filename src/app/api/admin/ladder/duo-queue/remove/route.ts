import { NextResponse } from "next/server";
import { getAuthorizedAdminClient, isRecord, normalizeRequiredPositiveInteger } from "@/app/api/admin/_lib/auth";
import { leaveDuoQueue } from "@/lib/ladder/ladderDuoQueue";

// POST /api/admin/ladder/duo-queue/remove — Body: { duoId }
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

  const result = await leaveDuoQueue(auth.supabase, { duoId, playerId: null });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ ok: true }, { status: 200 });
}
