import { ALL_MATCH_FILTER, MATCH_TYPES } from "@/lib/matches";

type EventOption = {
  id: number;
  label: string;
};

type MatchFiltersCardProps = {
  eventFilter: number | "ALL";
  events: EventOption[];
  selectedTypeFilter: string;
  onEventChange: (value: number | "ALL") => void;
  onTypeChange: (value: string) => void;
  variant?: "default" | "dark";
};

export default function MatchFiltersCard({
  eventFilter,
  events,
  selectedTypeFilter,
  onEventChange,
  onTypeChange,
  variant = "default",
}: MatchFiltersCardProps) {
  const isDark = variant === "dark";

  const labelClass = isDark
    ? "text-[10px] font-bold uppercase tracking-[0.15em] text-[#687FA3]"
    : "text-sm text-slate-500";

  const selectClass = isDark
    ? "text-sm bg-[#162032] border border-[#22304a] text-white rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#00C8DC] cursor-pointer"
    : "border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-sm bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100";

  const optionClass = isDark
    ? ""
    : "bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100";

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className={labelClass} htmlFor="event-filter">
        Event
      </label>
      <select
        id="event-filter"
        value={eventFilter}
        onChange={(e) => {
          const value = e.target.value;
          onEventChange(
            value === ALL_MATCH_FILTER ? ALL_MATCH_FILTER : Number(value),
          );
        }}
        className={selectClass}
      >
        <option value={ALL_MATCH_FILTER} className={optionClass}>
          All
        </option>
        {events.map((eventOption) => (
          <option
            key={eventOption.id}
            value={eventOption.id}
            className={optionClass}
          >
            {eventOption.label}
          </option>
        ))}
      </select>

      <label className={labelClass} htmlFor="type-filter">
        Type
      </label>
      <select
        id="type-filter"
        value={selectedTypeFilter}
        onChange={(e) => onTypeChange(e.target.value)}
        className={selectClass}
      >
        <option value={ALL_MATCH_FILTER} className={optionClass}>
          All
        </option>
        {MATCH_TYPES.map((t) => (
          <option key={t} value={t} className={optionClass}>
            {t.toUpperCase()}
          </option>
        ))}
      </select>
    </div>
  );
}
