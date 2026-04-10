type TypeFilterOption = {
  value: string;
  label: string;
};

type MatchFiltersCardProps = {
  seasonFilter: number | "ALL" | null;
  seasons: number[];
  selectedTypeFilter: string;
  typeFilterOptions: readonly TypeFilterOption[];
  onSeasonChange: (value: number | "ALL") => void;
  onTypeChange: (value: string) => void;
};

export default function MatchFiltersCard({
  seasonFilter,
  seasons,
  selectedTypeFilter,
  typeFilterOptions,
  onSeasonChange,
  onTypeChange,
}: MatchFiltersCardProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 mb-6">
      <label className="text-sm text-slate-500" htmlFor="season-filter">
        Season:
      </label>
      <select
        id="season-filter"
        value={seasonFilter ?? ""}
        onChange={(e) => {
          const value = e.target.value;
          onSeasonChange(value === "ALL" ? "ALL" : Number(value));
        }}
        className="border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-sm bg-white dark:bg-slate-900"
      >
        <option value="ALL">ALL</option>
        {seasons.map((season) => (
          <option key={season} value={season}>
            {season}
          </option>
        ))}
      </select>

      <label className="text-sm text-slate-500" htmlFor="type-filter">
        Type:
      </label>
      <select
        id="type-filter"
        value={selectedTypeFilter}
        onChange={(e) => onTypeChange(e.target.value)}
        className="border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-sm bg-white dark:bg-slate-900"
      >
        {typeFilterOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
