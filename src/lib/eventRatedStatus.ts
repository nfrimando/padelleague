import { Event } from "@/lib/types";

/**
 * Whether an event is "rated" (playing it affects player ratings). Events created
 * before the `is_rated` column existed (undefined) are treated as rated.
 */
export function isEventRated(event: Pick<Event, "is_rated">): boolean {
  return event.is_rated ?? true;
}

export function ratedStatusLabel(rated: boolean): string {
  return rated ? "Rated" : "Unrated";
}

/** Subtle dark-mode pill classes — emerald for rated, amber for the unrated exception. */
export function ratedStatusBadgeClass(rated: boolean): string {
  return rated
    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
    : "bg-amber-500/10 border-amber-500/30 text-amber-300";
}
