import { NextResponse } from "next/server";
import { normalizeRequiredPositiveInteger } from "@/app/api/admin/_lib/auth";
import { getAuthorizedPlayer } from "@/app/api/ladder/_lib/currentPlayer";
import { authorizeDuoRequest, readJsonBody } from "@/app/api/ladder/_lib/duo";
import { inviteDuo } from "@/lib/ladder/ladderDuos";
import { normalizeDuoName } from "@/lib/ladder/ladderDuoShared";
import { fetchPlayerDuoState } from "@/lib/ladder/ladderDuoState";

// GET /api/ladder/duos — the signed-in player's duos (standing, queue, open match, strikes) and
// pending invites both ways. Returns { available: false } until the duo ladder is enabled.
export async function GET(request: Request) {
  const auth = await getAuthorizedPlayer(request);
  if (!auth.ok) return auth.response;
  const state = await fetchPlayerDuoState(auth.supabase, auth.playerId);
  return NextResponse.json(state, { status: 200 });
}

// POST /api/ladder/duos — invite a partner. Body: { partnerId, name? }
export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });

  const partnerId = normalizeRequiredPositiveInteger(body.partnerId);
  if (!partnerId) return NextResponse.json({ error: "partnerId is required." }, { status: 400 });
  const name = normalizeDuoName(body.name);
  if (!name.ok) return NextResponse.json({ error: name.error }, { status: 400 });

  const auth = await authorizeDuoRequest(request);
  if (!auth.ok) return auth.response;

  const result = await inviteDuo(auth.supabase, { inviterId: auth.playerId, partnerId, name: name.name });
  if (!result.ok) return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
  return NextResponse.json({ duoId: result.duo.id, status: result.duo.status }, { status: 201 });
}
