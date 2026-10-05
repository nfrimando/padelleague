// Client-safe duo ladder constants, types and formatters. Server-side logic lives in ladderDuos.ts,
// ladderDuoPlacement.ts, ladderDuoQueue.ts etc.; this file must not import anything server-only.

// Two duos make a match.
export const DUO_QUEUE_GROUP_SIZE = 2;

// Cap on pending + active duos per player, so invites can't be used to spam.
export const MAX_LIVE_DUOS_PER_PLAYER = 6;

export const DUO_NAME_MAX_LENGTH = 40;

// An unanswered invite lapses after this. Expiry is applied lazily by expireStaleDuoInvites.
export const DUO_INVITE_EXPIRY_DAYS = 7;

export type DuoStatus = "pending" | "active" | "declined" | "withdrawn" | "dissolved" | "expired";

// When an invite sent at `invitedAt` lapses, or null if the timestamp is missing/invalid.
export function inviteExpiresAt(invitedAt: string | null | undefined): Date | null {
  if (!invitedAt) return null;
  const sent = new Date(invitedAt);
  if (Number.isNaN(sent.getTime())) return null;
  return new Date(sent.getTime() + DUO_INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
}

export function isInviteExpired(invitedAt: string | null | undefined, now: Date = new Date()): boolean {
  const expiresAt = inviteExpiresAt(invitedAt);
  return expiresAt !== null && expiresAt.getTime() <= now.getTime();
}

export type DuoPlayerLite = {
  player_id: number;
  name: string | null;
  nickname: string | null;
  image_link?: string | null;
};

// A duo is stored once per unordered pair, low id first.
export function canonicalPair(a: number, b: number): [number, number] {
  return a < b ? [a, b] : [b, a];
}

function shortName(p: { name: string | null; nickname: string | null } | null | undefined): string {
  if (!p) return "?";
  if (p.nickname?.trim()) return p.nickname.trim();
  const first = p.name?.trim().split(/\s+/)[0];
  return first || "?";
}

// The duo's chosen name, else "Nick1 & Nick2".
export function duoDisplayName(
  name: string | null | undefined,
  players: Array<{ name: string | null; nickname: string | null } | null | undefined>,
): string {
  if (name?.trim()) return name.trim();
  return players.map(shortName).join(" & ");
}

// Trims and validates a user-entered duo name. Empty means "no name".
export function normalizeDuoName(raw: unknown): { ok: true; name: string | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, name: null };
  if (typeof raw !== "string") return { ok: false, error: "Duo name must be text." };
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return { ok: true, name: null };
  if (trimmed.length > DUO_NAME_MAX_LENGTH) {
    return { ok: false, error: `Duo name must be ${DUO_NAME_MAX_LENGTH} characters or fewer.` };
  }
  return { ok: true, name: trimmed };
}

// The two players of a duo match team in canonical order — the shape match_teams must seat.
export function teamMatchesDuo(
  team: { player_1_id: number | null; player_2_id: number | null },
  duo: { player_low_id: number; player_high_id: number },
): boolean {
  const a = Number(team.player_1_id);
  const b = Number(team.player_2_id);
  const [low, high] = canonicalPair(a, b);
  return low === duo.player_low_id && high === duo.player_high_id;
}

// ---- Player-facing duo state (GET /api/ladder/duos) ------------------------------------------

export type MyDuoMatchTeam = { label: string; players: string[] };

export type MyDuoEntry = {
  duoId: number;
  name: string | null;
  label: string;
  status: DuoStatus;
  // Who sent the invite, from the viewer's point of view. "admin" = created by an admin.
  role: "inviter" | "invitee" | "admin";
  partner: DuoPlayerLite;
  invitedAt: string | null;
  standing: { tierId: number; tierName: string; stars: number; cushionAvailable: boolean } | null;
  waiting: { queuedAt: string; position: number; waitingCount: number; tierName: string } | null;
  openMatch: {
    matchId: number;
    status: "assigned" | "scheduled";
    source: string;
    playByAt: string | null;
    team1: MyDuoMatchTeam;
    team2: MyDuoMatchTeam;
  } | null;
  strikes: number;
};

export type PlayerDuoState = {
  // False until the duo ladder migrations are applied.
  available: boolean;
  cycleId: number | null;
  duos: MyDuoEntry[];
  incoming: MyDuoEntry[];
  outgoing: MyDuoEntry[];
};
