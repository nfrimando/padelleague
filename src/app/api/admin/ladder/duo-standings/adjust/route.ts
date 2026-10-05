import { NextResponse } from "next/server";
import {
  getAuthorizedAdminClient,
  isRecord,
  normalizeOptionalString,
  normalizeRequiredPositiveInteger,
} from "@/app/api/admin/_lib/auth";
import { applyAdminDuoStarAdjustment } from "@/lib/ladder/ladderDuoAdminAdjustment";
import { revalidateLadderPage } from "@/app/api/ladder/_lib/duo";

// POST /api/admin/ladder/duo-standings/adjust — Body: { duoId, delta: 1 | -1, reason }
export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!isRecord(payload)) return NextResponse.json({ error: "Body must be an object." }, { status: 400 });

  const duoId = normalizeRequiredPositiveInteger(payload.duoId);
  const delta = payload.delta === 1 || payload.delta === -1 ? payload.delta : null;
  const reason = normalizeOptionalString(payload.reason);
  if (!duoId || !delta || !reason) {
    return NextResponse.json({ error: "duoId, delta (1 or -1) and a reason are required." }, { status: 400 });
  }

  const auth = await getAuthorizedAdminClient(request);
  if (!auth.ok) return auth.response;

  const result = await applyAdminDuoStarAdjustment(auth.supabase, {
    duoId,
    delta,
    reason,
    adminUserId: auth.userId,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  revalidateLadderPage();
  return NextResponse.json(result, { status: 200 });
}
