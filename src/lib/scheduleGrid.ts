// Shared weekly schedule-grid scaffolding used by the dashboard's schedule
// alignment grid (WinProbabilityCalculator) and the Find Players heatmap.
// Days are stored 0–6 (0 = Mon … 6 = Sun) to match the visual column order below.
// Hours run 6am → 11pm then wrap to midnight, matching player_schedule_preferences.

// Display order: 6am–11pm, then midnight last.
export const SCHED_HOURS = [
  6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0,
];

export const SCHED_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Compact label (grid axis): "6a", "12p", "12a".
export function schedHourLabel(h: number): string {
  if (h === 0) return "12a";
  if (h < 12) return `${h}a`;
  if (h === 12) return "12p";
  return `${h - 12}p`;
}

// Verbose label (tooltips / agenda): "6am", "noon", "midnight".
export function fullSchedHourLabel(h: number): string {
  if (h === 0) return "midnight";
  if (h < 12) return `${h}am`;
  if (h === 12) return "noon";
  return `${h - 12}pm`;
}

// Stable key for a (day, hour) slot — used to bucket schedule rows.
export function slotKey(dayOfWeek: number, startHour: number): string {
  return `${dayOfWeek}-${startHour}`;
}
