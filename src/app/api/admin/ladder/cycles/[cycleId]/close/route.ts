import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import {
  getAuthorizedAdminClient,
  isRecord,
  normalizeRequiredPositiveInteger,
} from "@/app/api/admin/_lib/auth";
import { closeLadderCycle } from "@/lib/ladder/ladderCycleClose";
import { LADDER_PAGE_CACHE_TAG } from "@/lib/ladderData";

// POST /api/admin/ladder/cycles/[cycleId]/close
// Body: { dryRun?: boolean, recompute?: boolean }
//
// dryRun returns the computed snapshot without writing, so an admin can review the badge-eligible
// list before committing. recompute rebuilds an already-completed cycle's snapshot.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ cycleId: string }> },
) {
  const { cycleId: rawCycleId } = await params;

  const cycleId = normalizeRequiredPositiveInteger(rawCycleId);
  if (cycleId === null) {
    return NextResponse.json(
      { error: "cycleId must be a positive integer." },
      { status: 400 },
    );
  }

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

  const dryRun = payload.dryRun === true;
  const recompute = payload.recompute === true;

  const authResult = await getAuthorizedAdminClient(request);
  if (!authResult.ok) {
    return authResult.response;
  }

  const result = await closeLadderCycle(authResult.supabase, {
    cycleId,
    dryRun,
    recompute,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // /ladder's data is cached for 120s; drop it now so the close shows up immediately. Next 16
  // deprecated the single-argument form, and updateTag (the read-your-own-writes helper) is
  // Server-Action-only, so expire the tag outright rather than taking "max"'s stale-while-revalidate.
  if (result.written) {
    revalidateTag(LADDER_PAGE_CACHE_TAG, { expire: 0 });
  }

  return NextResponse.json(
    {
      cycle: result.cycle,
      written: result.written,
      results: result.results,
      namesByPlayer: result.namesByPlayer,
      recorded: result.results.length,
      badgeEligible: result.results.filter((r) => r.badge_eligible).length,
      warnings: result.warnings,
    },
    { status: 200 },
  );
}
