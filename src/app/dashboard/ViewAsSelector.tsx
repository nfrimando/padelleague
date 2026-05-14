"use client";

import { useState, useRef, useEffect } from "react";
import { Eye, X, ChevronDown } from "lucide-react";
import PlayerSearchBox from "@/components/PlayerSearchBox";
import { usePlayerSearch } from "@/lib/usePlayerSearch";
import type { Player } from "@/lib/types";

type Props = {
  players: Player[];
  selected: Player | null;
  onSelect: (player: Player | null) => void;
};

export default function ViewAsSelector({ players, selected, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const suggestions = usePlayerSearch(players, query);

  useEffect(() => {
    function onOutsideClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setQuery("");
      }
    }
    if (open) document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, [open]);

  function handleSelect(player: Player) {
    onSelect(player);
    setOpen(false);
    setQuery("");
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onSelect(null);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={containerRef} className="relative">
      {selected ? (
        <button
          type="button"
          onClick={handleClear}
          className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-[#00C8DC] hover:text-white transition-colors"
        >
          <Eye size={13} />
          <span className="hidden sm:inline max-w-[120px] truncate">
            {selected.nickname || selected.name}
          </span>
          <X size={11} />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-[#687FA3] hover:text-[#00C8DC] transition-colors"
        >
          <Eye size={13} />
          <span className="hidden sm:inline">View As</span>
          <ChevronDown size={11} />
        </button>
      )}

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-[#162032] border border-[#687FA3]/20 rounded-2xl shadow-2xl p-3 z-50">
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#687FA3] mb-2.5 px-1">
            View dashboard as&hellip;
          </p>
          <PlayerSearchBox
            value={query}
            suggestions={suggestions}
            onValueChange={setQuery}
            onSelectPlayer={handleSelect}
            onClear={() => setQuery("")}
            placeholder="Search player…"
            maxSuggestions={6}
          />
        </div>
      )}
    </div>
  );
}
