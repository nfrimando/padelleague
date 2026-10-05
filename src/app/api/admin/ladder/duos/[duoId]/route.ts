import { NextResponse } from "next/server";
import { getAuthorizedAdminClient, isRecord, normalizeRequiredPositiveInteger } from "@/app/api/admin/_lib/auth";
import { renameDuo } from "@/lib/ladder/ladderDuos";
import { normalizeDuoName } from "@/lib/ladder/ladderDuoShared";
import { revalidateLadderPage } from "@/app/api/ladder/_lib/duo";

// PATCH /api/admin/ladder/duos/[duoId] — rename. Body: { name } (empty clears it).
export async function PATCH(request: Request, { params }: { params: Promise<{ duoId: string }> }) {
  const { duoId: raw } = await params;
  const duoId = normalizeRequiredPositiveInteger(raw);
  if (!duoId) return NextResponse.json({ error: "Invalid duo id." }, { status: 400 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!isRecord(payload)) return NextResponse.json({ error: "Body must be an object." }, { status: 400 });
  const name = normalizeDuoName(payload.name);
  if (!name.ok) return NextResponse.json({ error: name.error }, { status: 400 });

  const auth = await getAuthorizedAdminClient(request);
  if (!auth.ok) return auth.response;

  const result = await renameDuo(auth.supabase, { duoId, byPlayerId: null, name: name.name });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  revalidateLadderPage();
  return NextResponse.json({ duoId, name: result.duo.name }, { status: 200 });
}
