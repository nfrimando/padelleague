import { NextResponse } from "next/server";
import {
  getAuthorizedAdminClient,
  normalizeRequiredPositiveInteger,
} from "@/app/api/admin/_lib/auth";
import { expireQueueMatch } from "@/lib/ladder/ladderQueue";

// Admin expires an overdue queue match. Nobody is requeued; the admin docks stars separately.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const { matchId: rawMatchId } = await params;
  const matchId = normalizeRequiredPositiveInteger(rawMatchId);
  if (!matchId) {
    return NextResponse.json({ error: "Invalid match id." }, { status: 400 });
  }

  const auth = await getAuthorizedAdminClient(request);
  if (!auth.ok) return auth.response;

  const result = await expireQueueMatch(auth.supabase, matchId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}
