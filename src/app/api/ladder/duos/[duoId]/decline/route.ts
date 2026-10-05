import { NextResponse } from "next/server";
import { authorizeDuoRequest, duoIdFromParams, revalidateLadderPage } from "@/app/api/ladder/_lib/duo";
import { declineDuo } from "@/lib/ladder/ladderDuos";

// POST /api/ladder/duos/[duoId]/decline
export async function POST(request: Request, { params }: { params: Promise<{ duoId: string }> }) {
  const duoId = await duoIdFromParams(params);
  if (!duoId) return NextResponse.json({ error: "Invalid duo id." }, { status: 400 });

  const auth = await authorizeDuoRequest(request);
  if (!auth.ok) return auth.response;

  const result = await declineDuo(auth.supabase, { duoId, playerId: auth.playerId });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  revalidateLadderPage();
  return NextResponse.json(
    { duoId, status: result.duo.status },
    { status: 200 },
  );
}
