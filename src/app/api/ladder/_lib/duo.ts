import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeRequiredPositiveInteger } from "@/app/api/admin/_lib/auth";
import { getAuthorizedPlayer } from "@/app/api/ladder/_lib/currentPlayer";
import { DUO_LADDER_UNAVAILABLE, isDuoLadderAvailable } from "@/lib/ladder/ladderSchema";
export { revalidateLadderPage } from "@/lib/ladderData";

// Shared plumbing for the player-facing duo ladder routes: auth, "is the duo ladder enabled yet",
// a forgiving JSON body read, and the /ladder cache bust after a write.
export async function authorizeDuoRequest(
  request: Request,
): Promise<
  | { ok: true; supabase: SupabaseClient; playerId: number }
  | { ok: false; response: NextResponse }
> {
  const auth = await getAuthorizedPlayer(request);
  if (!auth.ok) return auth;
  if (!(await isDuoLadderAvailable(auth.supabase))) {
    return { ok: false, response: NextResponse.json({ error: DUO_LADDER_UNAVAILABLE }, { status: 503 }) };
  }
  return auth;
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const text = await request.text();
    if (!text) return {};
    const parsed = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function duoIdFromParams(params: Promise<{ duoId: string }>): Promise<number | null> {
  const { duoId } = await params;
  return normalizeRequiredPositiveInteger(duoId);
}

