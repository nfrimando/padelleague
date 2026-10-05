import { NextResponse } from "next/server";
import { authorizeDuoRequest, duoIdFromParams, revalidateLadderPage } from "@/app/api/ladder/_lib/duo";
import { dissolveDuo } from "@/lib/ladder/ladderDuos";

// POST /api/ladder/duos/[duoId]/dissolve — either member. Blocked (409) while the duo has an open
// match; withdraws a waiting queue ticket. The duo's ledger and results are kept.
export async function POST(request: Request, { params }: { params: Promise<{ duoId: string }> }) {
  const duoId = await duoIdFromParams(params);
  if (!duoId) return NextResponse.json({ error: "Invalid duo id." }, { status: 400 });

  const auth = await authorizeDuoRequest(request);
  if (!auth.ok) return auth.response;

  const result = await dissolveDuo(auth.supabase, { duoId, byPlayerId: auth.playerId });
  if (!result.ok) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
  }

  revalidateLadderPage();
  return NextResponse.json({ duoId, status: result.duo.status, warnings: result.warnings }, { status: 200 });
}
