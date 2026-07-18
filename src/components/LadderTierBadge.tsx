import { Star } from "lucide-react";

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
