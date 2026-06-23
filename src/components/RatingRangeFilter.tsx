"use client";

// Controlled min/max rating filter shared by Duel Roulette and Find Players.
// Empty input maps to null (no bound). Parent owns the state.
export default function RatingRangeFilter({
  min,
  max,
  onChange,
  className = "",
}: {
  min: number | null;
  max: number | null;
  onChange: (min: number | null, max: number | null) => void;
  className?: string;
}) {
  const parse = (v: string): number | null => {
    if (v.trim() === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const inputCls =
    "w-16 bg-[#0d1520] border border-[#687FA3]/20 rounded-lg px-2 py-1.5 text-sm text-slate-200 tabular-nums placeholder:text-[#687FA3]/40 focus:outline-none focus:border-[#00C8DC]/50";

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="text-[9px] font-black uppercase tracking-widest text-[#687FA3] shrink-0">
        Rating
      </span>
      <input
        type="number"
        inputMode="decimal"
        step="0.1"
        value={min ?? ""}
        onChange={(e) => onChange(parse(e.target.value), max)}
        placeholder="min"
        aria-label="Minimum rating"
        className={inputCls}
      />
      <span className="text-[#687FA3]/50 text-xs">–</span>
      <input
        type="number"
        inputMode="decimal"
        step="0.1"
        value={max ?? ""}
        onChange={(e) => onChange(min, parse(e.target.value))}
        placeholder="max"
        aria-label="Maximum rating"
        className={inputCls}
      />
    </div>
  );
}
