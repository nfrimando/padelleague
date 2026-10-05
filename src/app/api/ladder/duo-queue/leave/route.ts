import { NextResponse } from "next/server";
import { normalizeRequiredPositiveInteger } from "@/app/api/admin/_lib/auth";
import { authorizeDuoRequest, readJsonBody } from "@/app/api/ladder/_lib/duo";
import { leaveDuoQueue } from "@/lib/ladder/ladderDuoQueue";

// POST /api/ladder/duo-queue/leave — Body: { duoId }. Either member can pull the duo's ticket.
export async function POST(request: Request) {
  const body = await readJsonBody(request);
  const duoId = normalizeRequiredPositiveInteger(body?.duoId);
  if (!duoId) return NextResponse.json({ error: "duoId is required." }, { status: 400 });

  const auth = await authorizeDuoRequest(request);
  if (!auth.ok) return auth.response;

  const result = await leaveDuoQueue(auth.supabase, { duoId, playerId: auth.playerId });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ ok: true }, { status: 200 });
}
