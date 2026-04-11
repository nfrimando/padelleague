"use client";

import { useEffect, useMemo, useState } from "react";
import { Player } from "@/lib/types";

type PlayerSearchBoxProps = {
  value: string;
  suggestions: Player[];
  onValueChange: (value: string) => void;
  onSelectPlayer: (player: Player) => void;
  onClear: () => void;
  placeholder?: string;
  maxSuggestions?: number;
  selectedPlayerName?: string | null;
};

export default function PlayerSearchBox({
  value,
  suggestions,
  onValueChange,
  onSelectPlayer,
  onClear,
  placeholder = "Search player by name or nickname...",
  maxSuggestions = 5,
  selectedPlayerName,
}: PlayerSearchBoxProps) {
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);

  const visibleSuggestions = useMemo(
    () => suggestions.slice(0, maxSuggestions),
    [suggestions, maxSuggestions],
  );

  const shouldShowDropdown =
    value.trim().length > 0 &&
    visibleSuggestions.length > 0 &&
    (!selectedPlayerName ||
      value.trim().toLowerCase() !== selectedPlayerName.trim().toLowerCase());

  useEffect(() => {
    setActiveSuggestionIndex(-1);
  }, [value, suggestions]);

  return (
    <div className="relative">
      <input
        type="text"
        placeholder={placeholder}
        className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 pr-10 rounded"
        value={value}
        onKeyDown={(e) => {
          if (!shouldShowDropdown) {
            return;
          }

          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveSuggestionIndex((prev) =>
              prev < visibleSuggestions.length - 1 ? prev + 1 : 0,
            );
          }

          if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveSuggestionIndex((prev) =>
              prev > 0 ? prev - 1 : visibleSuggestions.length - 1,
            );
          }

          if (e.key === "Enter" && activeSuggestionIndex >= 0) {
            e.preventDefault();
            const selected = visibleSuggestions[activeSuggestionIndex];
            if (selected) {
              onSelectPlayer(selected);
            }
          }

          if (e.key === "Escape") {
            setActiveSuggestionIndex(-1);
          }
        }}
        onChange={(e) => onValueChange(e.target.value)}
      />

      {value.trim().length > 0 && (
        <button
          type="button"
          aria-label="Clear player search"
          className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors"
          onClick={onClear}
        >
          ×
        </button>
      )}

      {shouldShowDropdown && (
        <div className="absolute left-0 right-0 top-full mt-2 z-50 border border-slate-200 dark:border-slate-700 rounded shadow bg-white dark:bg-slate-900">
          {visibleSuggestions.map((player, index) => (
            <button
              key={player.player_id}
              type="button"
              className={`w-full text-left px-3 py-2 transition-colors ${
                index === activeSuggestionIndex
                  ? "bg-slate-100 dark:bg-slate-800"
                  : "hover:bg-slate-50 dark:hover:bg-slate-800/70"
              }`}
              onMouseEnter={() => setActiveSuggestionIndex(index)}
              onClick={() => onSelectPlayer(player)}
            >
              <div className="font-medium text-slate-900 dark:text-slate-100">
                {player.name}
              </div>
              {player.nickname && (
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {player.nickname}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
