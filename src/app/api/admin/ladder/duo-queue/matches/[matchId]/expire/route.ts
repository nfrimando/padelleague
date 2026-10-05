import { NextResponse } from "next/server";
import { getAuthorizedAdminClient, normalizeRequiredPositiveInteger } from "@/app/api/admin/_lib/auth";
import { expireDuoQueueMatch } from "@/lib/ladder/ladderDuoQueue";
import { revalidateLadderPage } from "@/app/api/ladder/_lib/duo";

// POST /api/admin/ladder/duo-queue/matches/[matchId]/expire — only once play_by_at has passed.
// Nobody is requeued; all four players are emailed.
export async function POST(request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId: raw } = await params;
  const matchId = normalizeRequiredPositiveInteger(raw);
  if (!matchId) return NextResponse.json({ error: "Invalid match id." }, { status: 400 });

  const auth = await getAuthorizedAdminClient(request);
  if (!auth.ok) return auth.response;

  const result = await expireDuoQueueMatch(auth.supabase, matchId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });

  revalidateLadderPage();
  return NextResponse.json({ ok: true }, { status: 200 });
}
