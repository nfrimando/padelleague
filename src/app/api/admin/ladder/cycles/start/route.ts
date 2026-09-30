import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import {
  getAuthorizedAdminClient,
  isRecord,
  normalizeRequiredPositiveInteger,
} from "@/app/api/admin/_lib/auth";
import {
  startLadderCycle,
  type LadderCycleThresholdInput,
} from "@/lib/ladder/ladderCycleStart";
import { LADDER_PAGE_CACHE_TAG } from "@/lib/ladderData";

// POST /api/admin/ladder/cycles/start
// Body: { label: string, startsAt?: string, thresholds: [{ tierId, eloFloor }], dryRun?: boolean }
//
// Starts the next ladder cycle with admin-entered rating floors and allocates every rated player
// into a tier + stars. dryRun returns the full allocation without writing, so the admin reviews
// the distribution and each player's move before committing. Static segment, so it does not
// collide with the sibling [cycleId]/close route.
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

  const label = typeof payload.label === "string" ? payload.label.trim() : "";
  if (!label) {
    return NextResponse.json({ error: "label is required." }, { status: 400 });
  }

  let startsAt: string | undefined;
  if (payload.startsAt !== undefined && payload.startsAt !== null) {
    if (typeof payload.startsAt !== "string" || Number.isNaN(new Date(payload.startsAt).getTime())) {
      return NextResponse.json({ error: "startsAt must be a valid date." }, { status: 400 });
    }
    startsAt = new Date(payload.startsAt).toISOString();
  }

  if (!Array.isArray(payload.thresholds) || payload.thresholds.length === 0) {
    return NextResponse.json(
      { error: "thresholds must be a non-empty array of { tierId, eloFloor }." },
      { status: 400 },
    );
  }

  const thresholds: LadderCycleThresholdInput[] = [];
  for (const entry of payload.thresholds) {
    if (!isRecord(entry)) {
      return NextResponse.json({ error: "Each threshold must be an object." }, { status: 400 });
    }

    const tierId = normalizeRequiredPositiveInteger(entry.tierId);
    if (tierId === null) {
      return NextResponse.json(
        { error: "Each threshold needs a positive integer tierId." },
        { status: 400 },
      );
    }

    const eloFloor = typeof entry.eloFloor === "string" ? Number(entry.eloFloor) : entry.eloFloor;
    if (typeof eloFloor !== "number" || !Number.isFinite(eloFloor) || eloFloor < 0) {
      return NextResponse.json(
        { error: `Threshold for tier ${tierId} must be a number of 0 or more.` },
        { status: 400 },
      );
    }

    thresholds.push({ tierId, eloFloor });
  }

  const dryRun = payload.dryRun === true;

  const authResult = await getAuthorizedAdminClient(request);
  if (!authResult.ok) {
    return authResult.response;
  }

  const result = await startLadderCycle(authResult.supabase, {
    label,
    startsAt,
    thresholds,
    dryRun,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // /ladder's data is cached for 120s; drop it now so the new cycle shows up immediately. Same
  // two-argument form the close route uses (Next 16 deprecated the single-argument one).
  if (result.written) {
    revalidateTag(LADDER_PAGE_CACHE_TAG, { expire: 0 });
  }

  return NextResponse.json(
    {
      cycle: result.cycle,
      written: result.written,
      placements: result.placements,
      namesByPlayer: result.namesByPlayer,
      distribution: result.distribution,
      previousCycle: result.previousCycle,
      placed: result.placements.length,
      warnings: result.warnings,
    },
    { status: 200 },
  );
}
