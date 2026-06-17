import type {
  MatchWithTeams,
  Player,
  PlayerRatingEvent,
  TeamWithPlayers,
} from "@/lib/types";

// ─── Shared match helpers (lifted from ProgressionSection so the sparkline + dashboard agree) ─────

export function findMyTeam(
  match: MatchWithTeams,
  pid: string,
): TeamWithPlayers | null {
  return (
    match.teams.find(
      (t) =>
        String(t.player_1?.player_id) === pid ||
        String(t.player_2?.player_id) === pid,
    ) ?? null
  );
}

export function getScore(match: MatchWithTeams): string {
  if (!match.sets?.length) return "";
  return [...match.sets]
    .sort((a, b) => a.set_number - b.set_number)
    .map((s) => `${s.team_1_games}-${s.team_2_games}`)
    .join("  ");
}

export function didWin(match: MatchWithTeams, pid: string): boolean | null {
  if (match.status !== "completed" || match.winner_team === null) return null;
  const myTeam = findMyTeam(match, pid);
  if (!myTeam) return null;
  return match.winner_team === myTeam.team_number;
}

// ─── Event description ───────────────────────────────────────────────────────────────────────────

export type RatingEventDescription =
  | {
      kind: "match";
      result: "win" | "loss" | null;
      me: Player | null;
      partner: Player | null;
      opponents: Player[];
      score: string | null;
      matchType: string | null;
      date: string | null;
      before: number | null;
      after: number;
      delta: number | null;
    }
  | {
      kind: "initial";
      label: string;
      after: number;
      date: string | null;
    }
  | {
      kind: "other";
      label: string;
      after: number;
      delta: number | null;
      date: string | null;
    };

function humanizeEventType(eventType: string): string {
  const spaced = eventType.replace(/_/g, " ").trim();
  return spaced.length > 0
    ? spaced.charAt(0).toUpperCase() + spaced.slice(1)
    : "Rating change";
}

// Translate one ledger event (+ its match, if it's a match event and the match is loaded) into a
// structured shape the tooltips render. Unknown / future event types fall through to "other".
export function describeRatingEvent(
  event: PlayerRatingEvent,
  match: MatchWithTeams | null,
  playerId: string,
): RatingEventDescription {
  if (event.eventType === "initial_rating") {
    return {
      kind: "initial",
      label: "Starting rating",
      after: event.ratingAfter,
      date: event.occurredAt,
    };
  }

  const isMatchEvent =
    event.sourceType === "match" ||
    event.eventType === "match_win" ||
    event.eventType === "match_loss";

  if (isMatchEvent && match) {
    const myTeam = findMyTeam(match, playerId);
    const oppTeam =
      match.teams.find((t) => t.team_number !== myTeam?.team_number) ?? null;
    const me = myTeam
      ? String(myTeam.player_1?.player_id) === playerId
        ? myTeam.player_1
        : myTeam.player_2
      : null;
    const partner = myTeam
      ? String(myTeam.player_1?.player_id) === playerId
        ? myTeam.player_2
        : myTeam.player_1
      : null;
    const opponents = [oppTeam?.player_1, oppTeam?.player_2].filter(
      Boolean,
    ) as Player[];
    const result: "win" | "loss" | null =
      event.eventType === "match_win"
        ? "win"
        : event.eventType === "match_loss"
          ? "loss"
          : didWin(match, playerId) === null
            ? null
            : didWin(match, playerId)
              ? "win"
              : "loss";

    return {
      kind: "match",
      result,
      me: me ?? null,
      partner: partner ?? null,
      opponents,
      score: getScore(match) || null,
      matchType: match.type,
      date: match.date_local ?? event.occurredAt,
      before: event.ratingBefore,
      after: event.ratingAfter,
      delta: event.ratingDelta,
    };
  }

  // Unknown / future event type, or a match event whose match isn't loaded.
  return {
    kind: "other",
    label: humanizeEventType(event.eventType),
    after: event.ratingAfter,
    delta: event.ratingDelta,
    date: event.occurredAt,
  };
}
