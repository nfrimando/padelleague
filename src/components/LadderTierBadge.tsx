import { Shield, ShieldOff, Star } from "lucide-react";
import InfoTooltip from "@/components/InfoTooltip";

export const MAX_STARS = 2;

export function tierIconSrc(tierName: string): string {
  return `/ladder/${tierName.trim().toLowerCase()}.png`;
}

export function StarBadge({ stars }: { stars: number }) {
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      {Array.from({ length: MAX_STARS }, (_, i) => (
        <Star
          key={i}
          className={
            i < stars
              ? "w-4 h-4 fill-[#00C8DC] text-[#00C8DC]"
              : "w-4 h-4 text-[#687FA3]/30"
          }
        />
      ))}
    </div>
  );
}

// The cushion is one free loss at 0★, re-armed on every tier entry — see
// src/lib/ladder/ladderStandingTransition.ts. `atRisk` means the player is at 0★ with the
// cushion already spent, so their next loss demotes them.
export function CushionBadge({
  cushionAvailable,
  atRisk,
}: {
  cushionAvailable: boolean;
  atRisk: boolean;
}) {
  const { Icon, className, label, text } = cushionAvailable
    ? {
        Icon: Shield,
        className: "w-3.5 h-3.5 text-emerald-400/70 fill-emerald-400/10",
        label: "Cushion intact",
        text: "Cushion intact — one free loss at 0★. The cushion re-arms every time you enter a tier.",
      }
    : atRisk
      ? {
          Icon: ShieldOff,
          className: "w-3.5 h-3.5 text-rose-400/80",
          label: "No cushion left",
          text: "No cushion left at 0★ — the next loss drops you a tier.",
        }
      : {
          Icon: ShieldOff,
          className: "w-3.5 h-3.5 text-[#687FA3]/30",
          label: "Cushion used",
          text: "Cushion used — it's already been spent in this tier. Drop to 0★ and the next loss demotes you.",
        };

  return (
    <InfoTooltip text={text} label={label} align="right">
      <Icon className={className} />
    </InfoTooltip>
  );
}
