import { NextResponse } from "next/server";
import {
  getAuthorizedAdminClient,
  isRecord,
  normalizeOptionalString,
  normalizeRequiredPositiveInteger,
} from "@/app/api/admin/_lib/auth";
import { dissolveDuo } from "@/lib/ladder/ladderDuos";
import { revalidateLadderPage } from "@/app/api/ladder/_lib/duo";

// POST /api/admin/ladder/duos/[duoId]/dissolve — Body: { force?, reason? }
// Without force, refused while the duo has an open match. With force, an open queue match is
// cancelled (opponent requeued); an open manual match is left to be completed.
export async function POST(request: Request, { params }: { params: Promise<{ duoId: string }> }) {
  const { duoId: raw } = await params;
  const duoId = normalizeRequiredPositiveInteger(raw);
  if (!duoId) return NextResponse.json({ error: "Invalid duo id." }, { status: 400 });

  let payload: unknown = {};
  try {
    const text = await request.text();
    if (text) payload = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!isRecord(payload)) return NextResponse.json({ error: "Body must be an object." }, { status: 400 });

  const auth = await getAuthorizedAdminClient(request);
  if (!auth.ok) return auth.response;

  const result = await dissolveDuo(auth.supabase, {
    duoId,
    byPlayerId: null,
    force: payload.force === true,
    reason: normalizeOptionalString(payload.reason) ?? "admin",
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
  }

  revalidateLadderPage();
  return NextResponse.json({ duoId, status: result.duo.status, warnings: result.warnings }, { status: 200 });
}
