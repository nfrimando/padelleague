"use client";

import PlayerSearchBox from "@/components/PlayerSearchBox";
import PlayerCard from "@/components/PlayerCard";
import { Player } from "@/lib/types";

type PlayerSlotPickerProps = {
  label: string;
  suggestions: Player[];
  selectedPlayer: Player | null;
  search: string;
  onSearchChange: (v: string) => void;
  onSelect: (player: Player) => void;
  onClear: () => void;
  placeholder?: string;
  maxSuggestions?: number;
};

/**
 * A labelled player slot that swaps between a search box and the selected player.
 * Lifted out of ScheduleMatchTab so the partner picker can reuse it.
 *
 * Callers must call `usePlayerSearch` once per slot, unconditionally at the top
 * level, and pass the result in as `suggestions`.
 */
export default function PlayerSlotPicker({
  label,
  suggestions,
  selectedPlayer,
  search,
  onSearchChange,
  onSelect,
  onClear,
  placeholder = "Search by name or nickname...",
  maxSuggestions = 6,
}: PlayerSlotPickerProps) {
  return (
    <div className="space-y-1.5">
      <span className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
        {label}
      </span>
      {selectedPlayer ? (
        <div className="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-800/40 px-2.5 py-2">
          <div className="flex-1 min-w-0">
            <PlayerCard
              player={selectedPlayer}
              size="sm"
              disableLink
              showLatestRating={false}
            />
          </div>
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 text-[11px] font-medium text-slate-400 hover:text-rose-400 transition-colors px-1.5 py-0.5 rounded hover:bg-rose-900/20 cursor-pointer"
          >
            Change
          </button>
        </div>
      ) : (
        <PlayerSearchBox
          value={search}
          suggestions={suggestions}
          onValueChange={onSearchChange}
          onSelectPlayer={(p) => {
            onSelect(p);
            onSearchChange("");
          }}
          onClear={() => onSearchChange("")}
          placeholder={placeholder}
          maxSuggestions={maxSuggestions}
        />
      )}
    </div>
  );
}
