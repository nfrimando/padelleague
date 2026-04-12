"use client";

import { SeasonFilter, TypeFilter } from "@/lib/types";

const SEASONS: SeasonFilter[] = [
  "ALL", "S8", "S7", "S6", "S5", "S4", "S3", "S2", "S1",
];
const TYPES: { value: TypeFilter; label: string }[] = [
  { value: "ALL", label: "All Types" },
  { value: "duel", label: "Duel" },
  { value: "doubles", label: "Doubles" },
  { value: "kotc", label: "KOTC" },
  { value: "team", label: "Team" },
];

interface Props {
  season: SeasonFilter;
  type: TypeFilter;
  onSeasonChange: (s: SeasonFilter) => void;
  onTypeChange: (t: TypeFilter) => void;
  loading?: boolean;
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
        active
          ? "bg-accent text-bg font-semibold"
          : "bg-surface text-sec border border-bdr hover:border-accent/50 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

export default function MatchFiltersCard({
  season,
  type,
  onSeasonChange,
  onTypeChange,
  loading,
}: Props) {
  return (
    <div className="bg-surface border border-bdr rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted uppercase tracking-wider font-medium">
          Filters
        </span>
        {loading && (
          <div className="flex items-center gap-1.5 text-xs text-sec">
            <span className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse" />
            Updating…
          </div>
        )}
      </div>

      {/* Season pills */}
      <div className="flex flex-wrap gap-2">
        {SEASONS.map((s) => (
          <Pill key={s} active={season === s} onClick={() => onSeasonChange(s)}>
            {s === "ALL" ? "All Seasons" : s}
          </Pill>
        ))}
      </div>

      {/* Type pills */}
      <div className="flex flex-wrap gap-2">
        {TYPES.map((t) => (
          <Pill key={t.value} active={type === t.value} onClick={() => onTypeChange(t.value)}>
            {t.label}
          </Pill>
        ))}
      </div>
    </div>
  );
}
