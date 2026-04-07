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
