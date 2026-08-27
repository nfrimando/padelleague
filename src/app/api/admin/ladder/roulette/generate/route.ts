import { NextResponse } from "next/server";
import {
  getAuthorizedAdminClient,
  isRecord,
  normalizeOptionalPositiveInteger,
} from "@/app/api/admin/_lib/auth";
import { generateLadderRouletteProposal } from "@/lib/ladder/ladderRoulette";

export async function POST(request: Request) {
  let payload: unknown = {};

  try {
    const text = await request.text();
    if (text) payload = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!isRecord(payload)) {
    return NextResponse.json({ error: "Body must be a JSON object." }, { status: 400 });
  }

  const tierId = normalizeOptionalPositiveInteger(payload.tierId);
  if (payload.tierId !== undefined && payload.tierId !== null && tierId === null) {
    return NextResponse.json(
      { error: "tierId must be a positive integer or omitted." },
      { status: 400 },
    );
  }

  const authResult = await getAuthorizedAdminClient(request);
  if (!authResult.ok) {
    return authResult.response;
  }

  const result = await generateLadderRouletteProposal(authResult.supabase, {
    tierId: tierId ?? undefined,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ proposal: result.proposal }, { status: 200 });
}
