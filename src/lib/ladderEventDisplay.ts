import type { LadderStandingEvent, LadderTier } from "@/lib/ladderData";
import { formatMatchDateRelative } from "@/lib/utils";

function tierName(tierId: number | null, tiers: LadderTier[]): string {
  if (tierId == null) return "—";
  return tiers.find((t) => t.id === tierId)?.name ?? "—";
}

function humanizeEventType(eventType: string): string {
  const spaced = eventType.replace(/_/g, " ").trim();
  return spaced.length > 0
    ? spaced.charAt(0).toUpperCase() + spaced.slice(1)
    : "Standing update";
}

// Translate one ladder ledger event into a short human-readable line for the
// always-visible subtitle under a player's row. Unknown / future event types
// fall through to a humanized label, mirroring describeRatingEvent's rule.
export function describeLadderEvent(
  event: LadderStandingEvent | null,
  tiers: LadderTier[],
): string {
  if (!event) return "Opted in — not yet placed this cycle";

  const when = formatMatchDateRelative(event.occurredAt);
  const suffix = when ? ` · ${when}` : "";

  switch (event.eventType) {
    case "cycle_start":
      return `Placed in ${tierName(event.tierAfterId, tiers)} at ${event.starsAfter}★${suffix}`;
    case "match_win":
      return `Won a match · ${event.starsBefore ?? 0}★ → ${event.starsAfter}★${suffix}`;
    case "match_loss":
      // A loss at 0★ that spent the cushion reads as "0★ → 0★" otherwise, which hides the
      // thing that actually changed.
      return event.metadata?.cushion_consumed === true
        ? `Lost a match · cushion used${suffix}`
        : `Lost a match · ${event.starsBefore ?? 0}★ → ${event.starsAfter}★${suffix}`;
    case "promotion":
      return `Promoted to ${tierName(event.tierAfterId, tiers)}${suffix}`;
    case "demotion":
      return `Demoted to ${tierName(event.tierAfterId, tiers)}${suffix}`;
    case "cycle_reset":
      return `Cycle reset · dropped to ${tierName(event.tierAfterId, tiers)}${suffix}`;
    default:
      return `${humanizeEventType(event.eventType)}${suffix}`;
  }
}
