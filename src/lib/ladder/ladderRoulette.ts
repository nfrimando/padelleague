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
  // Set only when no arrangement avoided a repeat partnership, so the admin can
  // reroll or accept knowingly. Optional: `confirm` neither needs nor parses it.
  repeatWarning?: string | null;
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

export type Split = [[number, number], [number, number]];

// A chosen 2-2 split, plus the partnership it was forced to repeat if no clean split
// of this foursome existed (null in the normal case).
export type GroupSplit = { split: Split; forcedRepeat: [number, number] | null };

// Prefer a 2-2 split of this group of 4 that (a) doesn't repeat either pair's
// partnership from that player's most recent ladder match, and (b) among the
// remaining candidates, minimizes the rating gap between the two teams. If every
// split repeats a partnership, fall back to rating-balancing across all 3 splits and
// report the repeat via `forcedRepeat` rather than blocking the round — the caller
// reshuffles to try to avoid this, and surfaces it to the admin when it can't.
// A player with no resolvable rating is treated as the average of the other 3 in the
// group, so one missing rating doesn't skew things.
function splitBalanced(
  group: [number, number, number, number],
  lastPartner: Map<number, number>,
  ratings: Map<string, number | null>,
): GroupSplit {
  const [a, b, c, d] = group;
  const splits: Split[] = [
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
  const clean = nonRepeating.length > 0;
  const candidates = clean ? nonRepeating : splits;

  const ratingGap = (s: Split) => {
    const team1 = ratingOf(s[0][0]) + ratingOf(s[0][1]);
    const team2 = ratingOf(s[1][0]) + ratingOf(s[1][1]);
    return Math.abs(team1 - team2);
  };

  const split = candidates.reduce((best, s) => (ratingGap(s) < ratingGap(best) ? s : best));
  if (clean) return { split, forcedRepeat: null };
  return { split, forcedRepeat: isRepeat(split[0]) ? split[0] : split[1] };
}

// How many randomized restarts to try before accepting the least-bad arrangement.
// Each attempt is cheap (a shuffle plus an O(groups² · 16) repair scan over pools of
// at most a few dozen players), so this stays well under a millisecond in practice.
const MAX_GROUPING_ATTEMPTS = 40;

// Chop a shuffled pool into foursomes and pick each one's 2-2 split. Exported for tests.
//
// Naively slicing the shuffle into fours fixes who shares a court *before* partner
// history is consulted, which leaves splitBalanced only 3 candidate splits to work
// with — sometimes all 3 repeat a partnership. So we do two things it can't: repair
// a bad foursome by swapping a player with another group, and restart the whole
// shuffle if repair isn't enough, keeping the best arrangement we saw. Leftovers
// (pool size not divisible by 4) are returned for the caller to report as skipped.
export function buildRouletteGroups(
  eligible: number[],
  lastPartner: Map<number, number>,
  ratings: Map<string, number | null>,
): { groups: GroupSplit[]; leftoverIds: number[] } {
  if (eligible.length < 4) return { groups: [], leftoverIds: [...eligible] };

  const groupCount = Math.floor(eligible.length / 4);
  const splitOf = (g: [number, number, number, number]) =>
    splitBalanced(g, lastPartner, ratings);

  let best: { groups: GroupSplit[]; leftoverIds: number[]; repeats: number } | null = null;

  for (let attempt = 0; attempt < MAX_GROUPING_ATTEMPTS; attempt++) {
    const shuffled = shuffle(eligible);
    const foursomes: Array<[number, number, number, number]> = [];
    for (let i = 0; i < groupCount; i++) {
      foursomes.push(shuffled.slice(i * 4, i * 4 + 4) as [number, number, number, number]);
    }
    const leftoverIds = shuffled.slice(groupCount * 4);
    const splits = foursomes.map(splitOf);

    // Repair pass: for each foursome still forcing a repeat, look for a single player
    // swap with another foursome that cleans it up without breaking the donor.
    for (let i = 0; i < foursomes.length; i++) {
      if (splits[i].forcedRepeat === null) continue;

      repair: for (let j = 0; j < foursomes.length; j++) {
        if (i === j) continue;
        for (let x = 0; x < 4; x++) {
          for (let y = 0; y < 4; y++) {
            const candidateI = [...foursomes[i]] as [number, number, number, number];
            const candidateJ = [...foursomes[j]] as [number, number, number, number];
            [candidateI[x], candidateJ[y]] = [candidateJ[y], candidateI[x]];

            const splitI = splitOf(candidateI);
            if (splitI.forcedRepeat !== null) continue;
            const splitJ = splitOf(candidateJ);
            if (splitJ.forcedRepeat !== null) continue;

            foursomes[i] = candidateI;
            foursomes[j] = candidateJ;
            splits[i] = splitI;
            splits[j] = splitJ;
            break repair;
          }
        }
      }
    }

    const repeats = splits.filter((s) => s.forcedRepeat !== null).length;
    if (repeats === 0) return { groups: splits, leftoverIds };
    if (best === null || repeats < best.repeats) {
      best = { groups: splits, leftoverIds, repeats };
    }
  }

  return best === null
    ? { groups: [], leftoverIds: [...eligible] }
    : { groups: best.groups, leftoverIds: best.leftoverIds };
}

// Decide who actually gets a match when the pool doesn't divide into foursomes. Ranks by
// how long it's been since the player last *played* a ladder match — never-played first,
// then oldest — and defers the tail. So the leftover seats are always taken from the
// players who played most recently, and anyone waiting their turn is guaranteed a match
// as long as their tier has four eligible players. Exported for tests.
//
// Shuffling before the (stable) sort matters: most of a young cycle's pool has never
// played, and without it the tie would always be broken by player id, quietly freezing
// the same people out every round.
export function selectRoulettePool(
  eligible: number[],
  lastPlayedAt: Map<number, string>,
): { selected: number[]; deferred: number[] } {
  const capacity = Math.floor(eligible.length / 4) * 4;
  if (capacity === 0) return { selected: [], deferred: [...eligible] };

  const ranked = shuffle(eligible).sort((a, b) =>
    (lastPlayedAt.get(a) ?? "").localeCompare(lastPlayedAt.get(b) ?? ""),
  );

  return { selected: ranked.slice(0, capacity), deferred: ranked.slice(capacity) };
}

export type LadderHistory = {
  // Most recent partner per player this cycle, across *all* ladder matches — roulette
  // and manually-created alike, so a hand-logged ladder match still blocks a repeat.
  // Expired/swept matches are deliberately still counted — the pairing was already
  // handed out once, so we'd rather not repeat it.
  lastPartner: Map<number, number>;
  // When each player last actually *played* a ladder match (completed or forfeit).
  // Assignments they never turned up for don't count, so a lapsed match doesn't make
  // a player look recently active. Absent from the map = never played one.
  lastPlayedAt: Map<number, string>;
  // Players holding a live assignment they haven't put a date on yet. They sit out the
  // next roulette until they schedule it.
  unscheduledPlayerIds: Set<number>;
};

// One pass over this cycle's ladder matches, producing everything the roulette needs to
// know about a player's history. Looks at each player's ladder matches regardless of
// which tier they were in.
//
// Ordered by the played date when there is one, falling back to when the ladder_matches
// row was inserted: a manual match logged today for a game played last week must not
// outrank a newer roulette assignment.
async function fetchLadderHistory(
  supabase: AdminSupabaseClient,
  cycleId: number,
  playerIds: number[],
): Promise<LadderHistory> {
  const lastPartner = new Map<number, number>();
  const lastPlayedAt = new Map<number, string>();
  const unscheduledPlayerIds = new Set<number>();
  const empty = { lastPartner, lastPlayedAt, unscheduledPlayerIds };
  if (playerIds.length === 0) return empty;

  const { data: priorMatches } = await supabase
    .from("ladder_matches")
    .select("match_id, created_at, expired_at, matches(date_local, status)")
    .eq("cycle_id", cycleId);

  // The embed comes back as an object for a to-one relationship, but supabase-js hands
  // back a single-element array when it can't infer that from the FK — accept both.
  type MatchEmbed = { date_local?: string | null; status?: string | null };
  const joinedMatch = (row: { matches: unknown }): MatchEmbed | null => {
    const embed = row.matches as MatchEmbed | MatchEmbed[] | null | undefined;
    return (Array.isArray(embed) ? embed[0] : embed) ?? null;
  };
  const sortKey = (row: { created_at: unknown; matches: unknown }): string =>
    joinedMatch(row)?.date_local ?? (row.created_at as string | null) ?? "";

  const priorRows = [...(priorMatches ?? [])].sort((a, b) =>
    sortKey(b).localeCompare(sortKey(a)),
  );
  const priorMatchIds = priorRows.map((m) => m.match_id as number);
  if (priorMatchIds.length === 0) return empty;

  const playedAtByMatch = new Map<number, string>();
  const unscheduledMatchIds = new Set<number>();
  for (const row of priorRows) {
    const matchId = row.match_id as number;
    const status = joinedMatch(row)?.status ?? null;
    if (status === "completed" || status === "forfeit") {
      playedAtByMatch.set(matchId, sortKey(row));
    } else if (status === "assigned" && row.expired_at == null) {
      unscheduledMatchIds.add(matchId);
    }
  }

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
    const matchId = t.match_id as number;
    const p1 = t.player_1_id as number | null;
    const p2 = t.player_2_id as number | null;
    if (p1 == null || p2 == null) continue;
    if (!relevant.has(p1) && !relevant.has(p2)) continue;

    if (!lastPartner.has(p1)) lastPartner.set(p1, p2);
    if (!lastPartner.has(p2)) lastPartner.set(p2, p1);

    const playedAt = playedAtByMatch.get(matchId);
    if (playedAt !== undefined) {
      if (!lastPlayedAt.has(p1)) lastPlayedAt.set(p1, playedAt);
      if (!lastPlayedAt.has(p2)) lastPlayedAt.set(p2, playedAt);
    }

    if (unscheduledMatchIds.has(matchId)) {
      unscheduledPlayerIds.add(p1);
      unscheduledPlayerIds.add(p2);
    }
  }

  return { lastPartner, lastPlayedAt, unscheduledPlayerIds };
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

// Neutrally cancels roulette-assigned matches (whether never scheduled, or scheduled but
// never played) once their deadline has passed. No rating or ladder-standing impact, same
// as plain cancellation. Run standalone via the admin "Sweep" button, and automatically as
// the first step of generating a new proposal so stale assignments are cleared before a
// new round goes out.
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
// who aren't sitting on an unscheduled assignment, prioritizes whoever has gone longest
// without playing, and randomly pairs the resulting pool into groups of 4. Every player
// left out — blocked, deferred, or short of a foursome — is reported as skipped.
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
  // Cycle-wide, so it's fetched once and read per tier.
  const { lastPartner, lastPlayedAt, unscheduledPlayerIds } = await fetchLadderHistory(
    supabase,
    cycleId,
    optedInIds,
  );

  const tierProposals: TierProposal[] = [];

  for (const tier of targetTiers) {
    const inTier = optedInIds.filter((id) => {
      const standing = standingsByPlayer.get(String(id));
      return standing !== undefined && standing.tierId === tier.id;
    });

    // A player still sitting on an assignment they haven't put a date on doesn't get
    // handed another one. Scheduling it (or letting it expire) puts them back in.
    const blockedIds = inTier.filter((id) => unscheduledPlayerIds.has(id));
    const eligible = inTier.filter((id) => !unscheduledPlayerIds.has(id));

    const displayNameById = await fetchDisplayNames(supabase, inTier);
    const displayName = (id: number) => displayNameById.get(id) ?? "Unknown";
    const ratings = await fetchLatestRatingsByPlayerIds(supabase, eligible);
    const rating = (id: number) => ratings.get(String(id)) ?? null;

    const { selected, deferred } = selectRoulettePool(eligible, lastPlayedAt);

    const { groups: builtGroups, leftoverIds } = buildRouletteGroups(
      selected,
      lastPartner,
      ratings,
    );

    const groups: ProposedGroup[] = builtGroups.map(({ split, forcedRepeat }) => {
      const [[t1p1, t1p2], [t2p1, t2p2]] = split;
      return {
        team1: [
          { playerId: t1p1, displayName: displayName(t1p1), rating: rating(t1p1) },
          { playerId: t1p2, displayName: displayName(t1p2), rating: rating(t1p2) },
        ],
        team2: [
          { playerId: t2p1, displayName: displayName(t2p1), rating: rating(t2p1) },
          { playerId: t2p2, displayName: displayName(t2p2), rating: rating(t2p2) },
        ],
        repeatWarning: forcedRepeat
          ? `${displayName(forcedRepeat[0])} & ${displayName(forcedRepeat[1])} partnered in their last ladder match — no alternative pairing available`
          : null,
      };
    });

    // When the tier couldn't field a single foursome, nobody was really deprioritized —
    // say so plainly rather than blaming rotation.
    const deferredReason =
      selected.length === 0
        ? "insufficient pool"
        : "played most recently — deferred to next roulette";

    const skippedPlayers: RouletteSkippedPlayer[] = [
      ...blockedIds.map((id) => ({
        playerId: id,
        displayName: displayName(id),
        reason: "holds an unscheduled ladder match",
      })),
      ...deferred.map((id) => ({
        playerId: id,
        displayName: displayName(id),
        reason: deferredReason,
      })),
      // selectRoulettePool hands buildRouletteGroups a multiple of 4, so this is empty in
      // practice — kept so a future change there can't silently drop players.
      ...leftoverIds.map((id) => ({
        playerId: id,
        displayName: displayName(id),
        reason: "insufficient pool",
      })),
    ];

    tierProposals.push({ tierId: tier.id, tierName: tier.name, groups, skippedPlayers });
  }

  return {
    ok: true,
    proposal: { cycleId, deadlineDays: params.deadlineDays, sweep, tiers: tierProposals },
  };
}

// Phase 2: takes a proposal exactly as returned by generateLadderRouletteProposal (round
// tripped through the admin's confirm click) and actually creates the matches. It creates
// the pairing exactly as reviewed rather than re-running the random pairing — the admin
// already signed off on this one. Eligibility (unscheduled-assignment blocking, rotation
// priority) is likewise not re-evaluated here; it was settled when the proposal was built.
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
