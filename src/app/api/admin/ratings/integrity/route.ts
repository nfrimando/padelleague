import { NextResponse } from "next/server";
import { getAuthorizedAdminClient } from "@/app/api/admin/_lib/auth";

// Chain-integrity report for player_rating_events: every event's rating_before must equal the
// previous event's rating_after. A gap means a player's progression chart shows a jump and their
// current rating no longer reconciles with their match history — usually the residue of a deleted
// match or a hand-edited rating row. Read-only: this reports, it never repairs.

const PAGE_SIZE = 1000;

// Ratings imported from the pre-ledger spreadsheet were rounded to 2dp while initial_rating kept
// 3dp, so the very first link of some chains is off by a few thousandths. Not worth reporting.
const DEFAULT_TOLERANCE = 0.01;

type LedgerRow = {
  id: string;
  player_id: number | string;
  event_type: string;
  rating_before: number | string | null;
  rating_after: number | string | null;
  source_id: string | null;
  occurred_at: string | null;
  created_at: string;
};

export type ChainBreak = {
  playerId: number;
  gap: number;
  previous: { eventId: string; eventType: string; matchId: string | null; ratingAfter: number };
  next: { eventId: string; eventType: string; matchId: string | null; ratingBefore: number };
};

function toFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(request: Request) {
  const authResult = await getAuthorizedAdminClient(request);
  if (!authResult.ok) {
    return authResult.response;
  }
  const { supabase } = authResult;

  const url = new URL(request.url);
  const toleranceParam = Number(url.searchParams.get("tolerance"));
  const tolerance = Number.isFinite(toleranceParam) && toleranceParam >= 0
    ? toleranceParam
    : DEFAULT_TOLERANCE;

  const rows: LedgerRow[] = [];
  for (let page = 0; ; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await supabase
      .from("player_rating_events")
      .select(
        "id, player_id, event_type, rating_before, rating_after, source_id, occurred_at, created_at",
      )
      .order("player_id", { ascending: true })
      .order("occurred_at", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      return NextResponse.json(
        { error: error.message || "Failed to load rating ledger." },
        { status: 500 },
      );
    }

    const batch = (data ?? []) as LedgerRow[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }

  const byPlayer = new Map<number, LedgerRow[]>();
  for (const row of rows) {
    const playerId = toFiniteNumber(row.player_id);
    if (playerId === null) continue;
    const list = byPlayer.get(playerId);
    if (list) list.push(row);
    else byPlayer.set(playerId, [row]);
  }

  const breaks: ChainBreak[] = [];
  for (const [playerId, events] of byPlayer) {
    for (let i = 1; i < events.length; i += 1) {
      const previous = events[i - 1];
      const next = events[i];
      const ratingAfter = toFiniteNumber(previous.rating_after);
      const ratingBefore = toFiniteNumber(next.rating_before);
      if (ratingAfter === null || ratingBefore === null) continue;

      const gap = ratingBefore - ratingAfter;
      if (Math.abs(gap) <= tolerance) continue;

      breaks.push({
        playerId,
        gap,
        previous: {
          eventId: previous.id,
          eventType: previous.event_type,
          matchId: previous.source_id,
          ratingAfter,
        },
        next: {
          eventId: next.id,
          eventType: next.event_type,
          matchId: next.source_id,
          ratingBefore,
        },
      });
    }
  }

  breaks.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));

  return NextResponse.json(
    {
      tolerance,
      eventsChecked: rows.length,
      playersChecked: byPlayer.size,
      playersWithBreaks: new Set(breaks.map((b) => b.playerId)).size,
      breaks,
    },
    { status: 200 },
  );
}
