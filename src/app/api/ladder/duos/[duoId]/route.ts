import { NextResponse } from "next/server";
import {
  authorizeDuoRequest,
  duoIdFromParams,
  readJsonBody,
  revalidateLadderPage,
} from "@/app/api/ladder/_lib/duo";
import { renameDuo } from "@/lib/ladder/ladderDuos";
import { normalizeDuoName } from "@/lib/ladder/ladderDuoShared";

// PATCH /api/ladder/duos/[duoId] — rename. Body: { name } (empty clears it). Either member.
export async function PATCH(request: Request, { params }: { params: Promise<{ duoId: string }> }) {
  const duoId = await duoIdFromParams(params);
  if (!duoId) return NextResponse.json({ error: "Invalid duo id." }, { status: 400 });

  const body = await readJsonBody(request);
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  const name = normalizeDuoName(body.name);
  if (!name.ok) return NextResponse.json({ error: name.error }, { status: 400 });

  const auth = await authorizeDuoRequest(request);
  if (!auth.ok) return auth.response;

  const result = await renameDuo(auth.supabase, { duoId, byPlayerId: auth.playerId, name: name.name });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  revalidateLadderPage();
  return NextResponse.json({ duoId, name: result.duo.name }, { status: 200 });
}
