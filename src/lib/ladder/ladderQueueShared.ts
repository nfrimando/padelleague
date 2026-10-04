// Client-safe constants and formatters for the ladder queue. Server-side logic lives in
// ladderQueue.ts; this file must not import anything server-only.

export const QUEUE_GROUP_SIZE = 4;
// After this, an admin may expire the match from the Queue tab (expiry is never automatic).
export const QUEUE_PLAY_WINDOW_DAYS = 10;

// The league plays in the Philippines; deadlines are shown in Manila time.
export const LEAGUE_TIME_ZONE = "Asia/Manila";

export function computePlayByAt(from: Date = new Date()): string {
  return new Date(from.getTime() + QUEUE_PLAY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

// "Tue, Oct 14" in Manila time.
export function formatPlayBy(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: LEAGUE_TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}
