import type { AdminSupabaseClient } from "@/app/api/admin/_lib/auth";
import { fetchLatestLadderStandings } from "@/lib/ladder/ladderStandingLedger";
import { fetchLatestRatingsByPlayerIds } from "@/lib/ratingLedger";
import {
  notifyLadderMatchAssigned,
  notifyLadderMatchExpired,
} from "@/lib/email/notifications/ladderMatchAssigned";

type TierRow = { id: number; name: string; rank: number };

type PlayerInfo = {
  player_id: number;
  name: string | null;
  nickname: string | null;
  email: string | null;
  is_notifications_subscribed: boolean | null;
};

export type SweepResult = {
  expiredMatchIds: number[];
  warnings: string[];
};

export type RouletteSkippedPlayer = { playerId: number; displayName: string; reason: string };

export type ProposedPlayer = { playerId: number; displayName: string; rating: number | null };
export type ProposedGroup = {
  team1: [ProposedPlayer, ProposedPlayer];
  team2: [ProposedPlayer, ProposedPlayer];
};

export type TierProposal = {
  tierId: number;
  tierName: string;
  groups: ProposedGroup[];
  skippedPlayers: RouletteSkippedPlayer[];
};

export type RouletteProposal = {
  cycleId: number;
  deadlineDays: number;
  sweep: SweepResult;
  tiers: TierProposal[];
};

export type GenerateResult =
  | { ok: true; proposal: RouletteProposal }
  | { ok: false; error: string };

export type TierConfirmResult = {
  tierId: number;
  tierName: string;
  matchesCreated: number[];
  skippedPlayers: RouletteSkippedPlayer[];
};

export type ConfirmResult =
  | { ok: true; cycleId: number; tiers: TierConfirmResult[] }
  | { ok: false; error: string };

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Prefer a 2-2 split of this group of 4 that (a) doesn't repeat either pair's
// partnership from that player's most recent roulette round, and (b) among the
// remaining candidates, minimizes the rating gap between the two teams. If every
// split repeats a partnership, fall back to rating-balancing across all 3 splits
// rather than blocking the round. A player with no resolvable rating is treated as
// the average of the other 3 in the group, so one missing rating doesn't skew things.
function splitBalanced(
  group: [number, number, number, number],
  lastPartner: Map<number, number>,
  ratings: Map<string, number | null>,
): [[number, number], [number, number]] {
  const [a, b, c, d] = group;
  const splits: Array<[[number, number], [number, number]]> = [
    [[a, b], [c, d]],
    [[a, c], [b, d]],
    [[a, d], [b, c]],
  ];

  const knownRatings = group
    .map((id) => ratings.get(String(id)))
    .filter((r): r is number => typeof r === "number");
  const fallbackRating =
    knownRatings.length > 0
      ? knownRatings.reduce((sum, r) => sum + r, 0) / knownRatings.length
      : 0;
  const ratingOf = (id: number) => ratings.get(String(id)) ?? fallbackRating;

  const isRepeat = (pair: [number, number]) =>
    lastPartner.get(pair[0]) === pair[1] || lastPartner.get(pair[1]) === pair[0];
  const nonRepeating = splits.filter((s) => !isRepeat(s[0]) && !isRepeat(s[1]));
  const candidates = nonRepeating.length > 0 ? nonRepeating : splits;

  const ratingGap = (s: [[number, number], [number, number]]) => {
    const team1 = ratingOf(s[0][0]) + ratingOf(s[0][1]);
    const team2 = ratingOf(s[1][0]) + ratingOf(s[1][1]);
    return Math.abs(team1 - team2);
  };

  return candidates.reduce((best, s) => (ratingGap(s) < ratingGap(best) ? s : best));
}

// Most recent roulette-sourced partner per player this cycle, used only as a soft signal
// for splitBalanced. Looks at each player's latest roulette match regardless
// of which tier it was in — good enough for a best-effort tie-breaker.
async function getLastRoulettePartners(
  supabase: AdminSupabaseClient,
  cycleId: number,
  playerIds: number[],
): Promise<Map<number, number>> {
  const result = new Map<number, number>();
  if (playerIds.length === 0) return result;

  const { data: priorMatches } = await supabase
    .from("ladder_matches")
    .select("match_id, created_at")
    .eq("cycle_id", cycleId)
    .eq("source", "roulette")
    .order("created_at", { ascending: false });

  const priorMatchIds = (priorMatches ?? []).map((m) => m.match_id as number);
  if (priorMatchIds.length === 0) return result;

  const { data: teams } = await supabase
    .from("match_teams")
    .select("match_id, player_1_id, player_2_id")
    .in("match_id", priorMatchIds);

  const matchOrder = new Map(priorMatchIds.map((id, idx) => [id, idx]));
  const teamsSorted = [...(teams ?? [])].sort(
    (a, b) =>
      (matchOrder.get(a.match_id as number) ?? 0) -
      (matchOrder.get(b.match_id as number) ?? 0),
  );

  const relevant = new Set(playerIds);
  for (const t of teamsSorted) {
    const p1 = t.player_1_id as number | null;
    const p2 = t.player_2_id as number | null;
    if (p1 == null || p2 == null) continue;
    if (!relevant.has(p1) && !relevant.has(p2)) continue;
    if (!result.has(p1)) result.set(p1, p2);
    if (!result.has(p2)) result.set(p2, p1);
  }

  return result;
}

async function resolveTierNameForPlayers(
  supabase: AdminSupabaseClient,
  cycleId: number,
  playerIds: number[],
): Promise<string> {
  const standings = await fetchLatestLadderStandings(supabase, cycleId, playerIds);
  const anyStanding = playerIds
    .map((id) => standings.get(String(id)))
    .find((s) => s !== undefined);
  if (!anyStanding) return "ladder";

  const { data: tier } = await supabase
    .from("ladder_tiers")
    .select("name")
    .eq("id", anyStanding.tierId)
    .maybeSingle();

  return (tier?.name as string | undefined) ?? "ladder";
}

function toPlayerInfoFinder(
  rows: Array<{
    player_id: number;
    name: string | null;
    nickname: string | null;
    email: string | null;
    is_notifications_subscribed: boolean | null;
  }>,
) {
  return (id: number): PlayerInfo =>
    rows.find((p) => p.player_id === id) ?? {
      player_id: id,
      name: null,
      nickname: null,
      email: null,
      is_notifications_subscribed: null,
    };
}

async function fetchDisplayNames(
  supabase: AdminSupabaseClient,
  playerIds: number[],
): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  if (playerIds.length === 0) return result;

  const { data } = await supabase
    .from("players")
    .select("player_id, name, nickname")
    .in("player_id", playerIds);

  for (const p of data ?? []) {
    const id = p.player_id as number;
    result.set(id, (p.nickname as string | null) || (p.name as string | null) || "Unknown");
  }
  return result;
}

// Players currently seated (via match_teams) in a pending (assigned/scheduled) ladder
// match this cycle, manual or roulette — used to keep the same player from being
// double-booked across tiers/groups.
async function fetchCommittedPlayerIds(
  supabase: AdminSupabaseClient,
  cycleId: number,
): Promise<Set<number>> {
  const committed = new Set<number>();

  const { data: cycleLadderMatches } = await supabase
    .from("ladder_matches")
    .select("match_id")
    .eq("cycle_id", cycleId);

  const cycleMatchIds = (cycleLadderMatches ?? []).map((m) => m.match_id as number);
  if (cycleMatchIds.length === 0) return committed;

  const { data: pendingMatches } = await supabase
    .from("matches")
    .select("match_id")
    .in("match_id", cycleMatchIds)
    .in("status", ["assigned", "scheduled"]);

  const pendingMatchIds = (pendingMatches ?? []).map((m) => m.match_id as number);
  if (pendingMatchIds.length === 0) return committed;

  const { data: pendingTeams } = await supabase
    .from("match_teams")
    .select("player_1_id, player_2_id")
    .in("match_id", pendingMatchIds);

  for (const t of pendingTeams ?? []) {
    if (typeof t.player_1_id === "number") committed.add(t.player_1_id);
    if (typeof t.player_2_id === "number") committed.add(t.player_2_id);
  }

  return committed;
}

// Neutrally cancels roulette-assigned matches (whether never scheduled, or scheduled but
// never played) once their deadline has passed. No rating or ladder-standing impact, same
// as plain cancellation. Run standalone via the admin "Sweep" button, and automatically as
// the first step of generating a new proposal so swept players are immediately eligible
// again.
export async function sweepExpiredLadderAssignments(
  supabase: AdminSupabaseClient,
  cycleId: number,
): Promise<SweepResult> {
  const nowIso = new Date().toISOString();
  const warnings: string[] = [];
  const expiredMatchIds: number[] = [];

  const { data: overdue, error: overdueError } = await supabase
    .from("ladder_matches")
    .select("match_id")
    .eq("cycle_id", cycleId)
    .eq("source", "roulette")
    .is("expired_at", null)
    .lt("schedule_deadline_at", nowIso);

  if (overdueError) {
    return {
      expiredMatchIds: [],
      warnings: [`Failed to look up overdue assignments: ${overdueError.message}`],
    };
  }

  const candidateMatchIds = (overdue ?? []).map((m) => m.match_id as number);
  if (candidateMatchIds.length === 0) return { expiredMatchIds: [], warnings: [] };

  const { data: pendingMatches, error: pendingError } = await supabase
    .from("matches")
    .select("match_id")
    .in("match_id", candidateMatchIds)
    .in("status", ["assigned", "scheduled"]);

  if (pendingError) {
    return {
      expiredMatchIds: [],
      warnings: [`Failed to load overdue matches: ${pendingError.message}`],
    };
  }

  const matchIdsToExpire = (pendingMatches ?? []).map((m) => m.match_id as number);

  for (const matchId of matchIdsToExpire) {
    const { data: teams } = await supabase
      .from("match_teams")
      .select("player_1_id, player_2_id, team_number")
      .eq("match_id", matchId);

    const team1 = (teams ?? []).find((t) => t.team_number === 1);
    const team2 = (teams ?? []).find((t) => t.team_number === 2);

    const { error: updateMatchError } = await supabase
      .from("matches")
      .update({ status: "cancelled" })
      .eq("match_id", matchId);

    if (updateMatchError) {
      warnings.push(`Failed to cancel expired match ${matchId}: ${updateMatchError.message}`);
      continue;
    }

    const { error: updateLadderMatchError } = await supabase
      .from("ladder_matches")
      .update({ expired_at: nowIso })
      .eq("match_id", matchId);

    if (updateLadderMatchError) {
      warnings.push(
        `Failed to mark ladder_matches.expired_at for match ${matchId}: ${updateLadderMatchError.message}`,
      );
    }

    expiredMatchIds.push(matchId);

    if (
      team1 &&
      team2 &&
      typeof team1.player_1_id === "number" &&
      typeof team1.player_2_id === "number" &&
      typeof team2.player_1_id === "number" &&
      typeof team2.player_2_id === "number"
    ) {
      const playerIds = [
        team1.player_1_id,
        team1.player_2_id,
        team2.player_1_id,
        team2.player_2_id,
      ];

      const { data: playerDetails } = await supabase
        .from("players")
        .select("player_id,name,nickname,email,is_notifications_subscribed")
        .in("player_id", playerIds);

      if (playerDetails && playerDetails.length === 4) {
        const findPlayer = toPlayerInfoFinder(playerDetails as PlayerInfo[]);
        const tierName = await resolveTierNameForPlayers(supabase, cycleId, playerIds);

        await notifyLadderMatchExpired({
          matchId,
          tierName,
          team1Players: [findPlayer(team1.player_1_id), findPlayer(team1.player_2_id)],
          team2Players: [findPlayer(team2.player_1_id), findPlayer(team2.player_2_id)],
        }).catch((err) => console.error("[email] notifyLadderMatchExpired failed:", err));
      }
    }
  }

  return { expiredMatchIds, warnings };
}

// Phase 1: compute the proposed pairings for review, without writing anything. Sweeps
// stale assignments first (a real, idempotent cleanup independent of whether the admin
// goes on to confirm), then pools opted-in players currently standing in each target tier
// who aren't already in a pending ladder match, and randomly pairs them into groups of 4.
// Leftover players (pool not a multiple of 4) are reported as skipped.
export async function generateLadderRouletteProposal(
  supabase: AdminSupabaseClient,
  params: { tierId?: number; deadlineDays: number },
): Promise<GenerateResult> {
  const { data: activeCycle, error: cycleError } = await supabase
    .from("ladder_cycles")
    .select("id")
    .eq("status", "active")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cycleError) return { ok: false, error: cycleError.message };
  if (!activeCycle) return { ok: false, error: "No active ladder cycle." };

  const cycleId = activeCycle.id as number;
  const sweep = await sweepExpiredLadderAssignments(supabase, cycleId);

  const { data: tiersData, error: tiersError } = await supabase
    .from("ladder_tiers")
    .select("id, name, rank")
    .order("rank", { ascending: true });

  if (tiersError || !tiersData) {
    return { ok: false, error: tiersError?.message || "Failed to load ladder tiers." };
  }

  const allTiers = tiersData as TierRow[];
  const targetTiers = params.tierId
    ? allTiers.filter((t) => t.id === params.tierId)
    : allTiers;

  if (targetTiers.length === 0) {
    return { ok: false, error: "Tier not found." };
  }

  const { data: optedInPlayers, error: optedInError } = await supabase
    .from("players")
    .select("player_id")
    .eq("is_ladder_opt_in", true);

  if (optedInError) return { ok: false, error: optedInError.message };
  const optedInIds = (optedInPlayers ?? []).map((p) => p.player_id as number);

  const standingsByPlayer = await fetchLatestLadderStandings(supabase, cycleId, optedInIds);
  const committedPlayerIds = await fetchCommittedPlayerIds(supabase, cycleId);

  const tierProposals: TierProposal[] = [];

  for (const tier of targetTiers) {
    const eligible = optedInIds.filter((id) => {
      const standing = standingsByPlayer.get(String(id));
      return standing !== undefined && standing.tierId === tier.id && !committedPlayerIds.has(id);
    });

    const shuffled = shuffle(eligible);
    const rawGroups: Array<[number, number, number, number]> = [];
    for (let i = 0; i + 4 <= shuffled.length; i += 4) {
      rawGroups.push(shuffled.slice(i, i + 4) as [number, number, number, number]);
    }
    const leftoverIds = shuffled.slice(rawGroups.length * 4);

    const lastPartner = await getLastRoulettePartners(supabase, cycleId, eligible);
    const displayNameById = await fetchDisplayNames(supabase, eligible);
    const displayName = (id: number) => displayNameById.get(id) ?? "Unknown";
    const ratings = await fetchLatestRatingsByPlayerIds(supabase, eligible);
    const rating = (id: number) => ratings.get(String(id)) ?? null;

    const groups: ProposedGroup[] = rawGroups.map((group) => {
      const [[t1p1, t1p2], [t2p1, t2p2]] = splitBalanced(group, lastPartner, ratings);
      return {
        team1: [
          { playerId: t1p1, displayName: displayName(t1p1), rating: rating(t1p1) },
          { playerId: t1p2, displayName: displayName(t1p2), rating: rating(t1p2) },
        ],
        team2: [
          { playerId: t2p1, displayName: displayName(t2p1), rating: rating(t2p1) },
          { playerId: t2p2, displayName: displayName(t2p2), rating: rating(t2p2) },
        ],
      };
    });

    const skippedPlayers: RouletteSkippedPlayer[] = leftoverIds.map((id) => ({
      playerId: id,
      displayName: displayName(id),
      reason: "insufficient pool",
    }));

    tierProposals.push({ tierId: tier.id, tierName: tier.name, groups, skippedPlayers });
  }

  return {
    ok: true,
    proposal: { cycleId, deadlineDays: params.deadlineDays, sweep, tiers: tierProposals },
  };
}

// Phase 2: takes a proposal exactly as returned by generateLadderRouletteProposal (round
// tripped through the admin's confirm click) and actually creates the matches. Freshly
// re-checks that no player in the proposal has since become committed elsewhere (e.g. a
// stale proposal confirmed after other changes) and skips any group affected, rather than
// re-running the random pairing — the admin already reviewed this exact pairing.
export async function confirmLadderRouletteProposal(
  supabase: AdminSupabaseClient,
  proposal: RouletteProposal,
): Promise<ConfirmResult> {
  const { data: activeCycle, error: cycleError } = await supabase
    .from("ladder_cycles")
    .select("id")
    .eq("status", "active")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cycleError) return { ok: false, error: cycleError.message };
  if (!activeCycle || (activeCycle.id as number) !== proposal.cycleId) {
    return {
      ok: false,
      error: "The active ladder cycle changed since this proposal was generated. Please regenerate.",
    };
  }

  const cycleId = proposal.cycleId;
  const committedPlayerIds = await fetchCommittedPlayerIds(supabase, cycleId);
  const deadlineAt = new Date(
    Date.now() + proposal.deadlineDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  const deadlineLocal = new Date(deadlineAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const { data: allTiersData } = await supabase
    .from("ladder_tiers")
    .select("id, name, rank")
    .order("rank", { ascending: true });
  const allTiers = (allTiersData ?? []) as TierRow[];
  const adjacentTierName = (tierId: number, direction: 1 | -1): string | null => {
    const current = allTiers.find((t) => t.id === tierId);
    if (!current) return null;
    return allTiers.find((t) => t.rank === current.rank + direction)?.name ?? null;
  };

  const tierResults: TierConfirmResult[] = [];

  for (const tierProposal of proposal.tiers) {
    const matchesCreated: number[] = [];
    const skippedPlayers: RouletteSkippedPlayer[] = [...tierProposal.skippedPlayers];

    for (const group of tierProposal.groups) {
      const groupPlayers = [...group.team1, ...group.team2];
      const alreadyCommitted = groupPlayers.filter((p) => committedPlayerIds.has(p.playerId));
      if (alreadyCommitted.length > 0) {
        for (const p of groupPlayers) {
          skippedPlayers.push({
            playerId: p.playerId,
            displayName: p.displayName,
            reason: "already in a pending match (proposal went stale)",
          });
        }
        continue;
      }

      const [t1p1, t1p2] = group.team1.map((p) => p.playerId);
      const [t2p1, t2p2] = group.team2.map((p) => p.playerId);

      const { data: createdMatch, error: createMatchError } = await supabase
        .from("matches")
        .insert({
          event_id: null,
          date_local: null,
          time_local: null,
          venue: null,
          type: "duel",
          status: "assigned",
          winner_team: null,
        })
        .select("match_id")
        .maybeSingle();

      if (createMatchError || !createdMatch) {
        for (const p of groupPlayers) {
          skippedPlayers.push({ ...p, reason: "match creation failed" });
        }
        continue;
      }

      const matchId = createdMatch.match_id as number;

      const { error: createTeamsError } = await supabase.from("match_teams").insert([
        { match_id: matchId, team_number: 1, player_1_id: t1p1, player_2_id: t1p2, sets_won: null },
        { match_id: matchId, team_number: 2, player_1_id: t2p1, player_2_id: t2p2, sets_won: null },
      ]);

      if (createTeamsError) {
        await supabase.from("matches").delete().eq("match_id", matchId);
        for (const p of groupPlayers) {
          skippedPlayers.push({ ...p, reason: "team creation failed" });
        }
        continue;
      }

      const { error: ladderMatchError } = await supabase.from("ladder_matches").insert({
        match_id: matchId,
        cycle_id: cycleId,
        match_kind: "own_tier",
        source: "roulette",
        schedule_deadline_at: deadlineAt,
      });

      if (ladderMatchError) {
        await supabase.from("match_teams").delete().eq("match_id", matchId);
        await supabase.from("matches").delete().eq("match_id", matchId);
        for (const p of groupPlayers) {
          skippedPlayers.push({ ...p, reason: "ladder_matches insert failed" });
        }
        continue;
      }

      matchesCreated.push(matchId);
      for (const p of groupPlayers) committedPlayerIds.add(p.playerId);

      const { data: playerDetails } = await supabase
        .from("players")
        .select("player_id,name,nickname,email,is_notifications_subscribed")
        .in("player_id", groupPlayers.map((p) => p.playerId));

      if (playerDetails && playerDetails.length === 4) {
        const findPlayer = toPlayerInfoFinder(playerDetails as PlayerInfo[]);
        const standingsByPlayer = await fetchLatestLadderStandings(
          supabase,
          cycleId,
          groupPlayers.map((p) => p.playerId),
        );
        const standings: Record<string, { stars: number; cushionAvailable: boolean }> = {};
        for (const p of groupPlayers) {
          const s = standingsByPlayer.get(String(p.playerId));
          if (s) standings[String(p.playerId)] = { stars: s.stars, cushionAvailable: s.cushionAvailable };
        }

        await notifyLadderMatchAssigned({
          matchId,
          tierName: tierProposal.tierName,
          nextTierName: adjacentTierName(tierProposal.tierId, 1),
          prevTierName: adjacentTierName(tierProposal.tierId, -1),
          standings,
          deadlineLocal,
          team1Players: [findPlayer(t1p1), findPlayer(t1p2)],
          team2Players: [findPlayer(t2p1), findPlayer(t2p2)],
        }).catch((err) => console.error("[email] notifyLadderMatchAssigned failed:", err));
      }
    }

    tierResults.push({
      tierId: tierProposal.tierId,
      tierName: tierProposal.tierName,
      matchesCreated,
      skippedPlayers,
    });
  }

  return { ok: true, cycleId, tiers: tierResults };
}
