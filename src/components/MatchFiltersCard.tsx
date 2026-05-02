type TypeFilterOption = {
  value: string;
  label: string;
};

type EventOption = {
  id: number;
  label: string;
};

type MatchFiltersCardProps = {
  eventFilter: number | "ALL" | null;
  events: EventOption[];
  selectedTypeFilter?: string;
  typeFilterOptions?: readonly TypeFilterOption[];
  onEventChange: (value: number | "ALL") => void;
  onTypeChange?: (value: string) => void;
  showTypeFilter?: boolean;
};

export default function MatchFiltersCard({
  eventFilter,
  events,
  selectedTypeFilter,
  typeFilterOptions,
  onEventChange,
  onTypeChange,
  showTypeFilter = true,
}: MatchFiltersCardProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 mb-6">
      <label className="text-sm text-slate-500" htmlFor="event-filter">
        Event:
      </label>
      <select
        id="event-filter"
        value={eventFilter ?? ""}
        onChange={(e) => {
          const value = e.target.value;
          onEventChange(value === "ALL" ? "ALL" : Number(value));
        }}
        className="border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-sm bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100"
      >
        <option
          value="ALL"
          className="bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100"
        >
          ALL
        </option>
        {events.map((eventOption) => (
          <option
            key={eventOption.id}
            value={eventOption.id}
            className="bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100"
          >
            {eventOption.label}
          </option>
        ))}
      </select>

      {showTypeFilter && (
        <>
          <label className="text-sm text-slate-500" htmlFor="type-filter">
            Type:
          </label>
          <select
            id="type-filter"
            value={selectedTypeFilter ?? "ALL"}
            onChange={(e) => onTypeChange?.(e.target.value)}
            className="border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-sm bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100"
          >
            {(typeFilterOptions ?? []).map((option) => (
              <option
                key={option.value}
                value={option.value}
                className="bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100"
              >
                {option.label}
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}
