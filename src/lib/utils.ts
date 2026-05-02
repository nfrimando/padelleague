import type { MatchWithTeams } from "@/lib/types";

export function playerLabel(
  p: { name: string; nickname: string } | null | undefined,
): string {
  return p?.nickname || p?.name || "TBD";
}

export function versusLabel(match: Pick<MatchWithTeams, "type">): string {
  const type = String(match.type || "").toLowerCase();
  if (type === "kotc") return "👑";
  if (type === "duel") return "⚔️";
  return "vs";
}

export function matchTopLine(match: MatchWithTeams): string {
  if (match.status === "completed" && match.sets && match.sets.length > 0) {
    return [...match.sets]
      .sort((a, b) => a.set_number - b.set_number)
      .map((s) => `${s.team_1_games}-${s.team_2_games}`)
      .join(", ");
  }
  const venue = match.venue || "No venue";
  const time = formatMatchTime(match.time_local);
  return time ? `${venue} · ${time}` : venue;
}

export const formatMatchDate = (dateString: string | null) => {
  if (!dateString) return "N/A";
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateString;

  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  return `${months[date.getMonth()]} ${String(date.getDate()).padStart(2, "0")} ${date.getFullYear()}`;
};

export const formatMatchTime = (timeString: string | null) => {
  if (!timeString) return "";

  const [hourPart, minutePart] = timeString.split(":");
  if (!hourPart || !minutePart) return timeString;

  let hour = Number(hourPart);
  const minute = minutePart.padStart(2, "0");
  if (Number.isNaN(hour)) return timeString;

  const ampm = hour >= 12 ? "pm" : "am";
  hour = hour % 12 || 12;
  return `${hour}:${minute} ${ampm}`;
};
