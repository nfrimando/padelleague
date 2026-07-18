import { NextResponse } from "next/server";
import { getAuthorizedAdminClient, isRecord } from "@/app/api/admin/_lib/auth";
import {
  confirmLadderRouletteProposal,
  type ProposedGroup,
  type ProposedPlayer,
  type RouletteProposal,
  type TierProposal,
} from "@/lib/ladder/ladderRoulette";

function parsePlayer(value: unknown): ProposedPlayer | null {
  if (!isRecord(value)) return null;
  const playerId = Number(value.playerId);
  const displayName = value.displayName;
  if (!Number.isInteger(playerId) || playerId <= 0) return null;
  if (typeof displayName !== "string") return null;
  return { playerId, displayName };
}

function parseGroup(value: unknown): ProposedGroup | null {
  if (!isRecord(value)) return null;
  if (!Array.isArray(value.team1) || value.team1.length !== 2) return null;
  if (!Array.isArray(value.team2) || value.team2.length !== 2) return null;

  const t1 = value.team1.map(parsePlayer);
  const t2 = value.team2.map(parsePlayer);
  if (t1.some((p) => p === null) || t2.some((p) => p === null)) return null;

  return {
    team1: [t1[0] as ProposedPlayer, t1[1] as ProposedPlayer],
    team2: [t2[0] as ProposedPlayer, t2[1] as ProposedPlayer],
  };
}

function parseTierProposal(value: unknown): TierProposal | null {
  if (!isRecord(value)) return null;
  const tierId = Number(value.tierId);
  const tierName = value.tierName;
  if (!Number.isInteger(tierId) || tierId <= 0) return null;
  if (typeof tierName !== "string") return null;
  if (!Array.isArray(value.groups)) return null;

  const groups = value.groups.map(parseGroup);
  if (groups.some((g) => g === null)) return null;

  const skippedPlayers = Array.isArray(value.skippedPlayers)
    ? value.skippedPlayers
        .map((s) => {
          if (!isRecord(s)) return null;
          const playerId = Number(s.playerId);
          if (!Number.isInteger(playerId) || playerId <= 0) return null;
          if (typeof s.displayName !== "string" || typeof s.reason !== "string") return null;
          return { playerId, displayName: s.displayName, reason: s.reason };
        })
        .filter((s): s is { playerId: number; displayName: string; reason: string } => s !== null)
    : [];

  return {
    tierId,
    tierName,
    groups: groups as ProposedGroup[],
    skippedPlayers,
  };
}

function parseProposal(value: unknown): RouletteProposal | null {
  if (!isRecord(value)) return null;
  const cycleId = Number(value.cycleId);
  const deadlineDays = Number(value.deadlineDays);
  if (!Number.isInteger(cycleId) || cycleId <= 0) return null;
  if (!Number.isFinite(deadlineDays) || deadlineDays <= 0) return null;
  if (!Array.isArray(value.tiers)) return null;

  const tiers = value.tiers.map(parseTierProposal);
  if (tiers.some((t) => t === null)) return null;

  return {
    cycleId,
    deadlineDays,
    sweep: { expiredMatchIds: [], warnings: [] },
    tiers: tiers as TierProposal[],
  };
}

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!isRecord(payload) || !("proposal" in payload)) {
    return NextResponse.json(
      { error: "Body must include a `proposal` object." },
      { status: 400 },
    );
  }

  const proposal = parseProposal(payload.proposal);
  if (!proposal) {
    return NextResponse.json({ error: "Invalid or malformed proposal." }, { status: 400 });
  }

  const authResult = await getAuthorizedAdminClient(request);
  if (!authResult.ok) {
    return authResult.response;
  }

  const result = await confirmLadderRouletteProposal(authResult.supabase, proposal);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ cycleId: result.cycleId, tiers: result.tiers }, { status: 200 });
}
