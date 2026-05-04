type EventLabelSource = {
  event_id: number | string | bigint;
  name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
};

function getTodayDateString(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getEventStatusMarker(
  event: Pick<EventLabelSource, "start_date" | "end_date">,
  now = new Date(),
): string {
  const today = getTodayDateString(now);

  if (event.end_date && event.end_date < today) {
    return "✓";
  }

  if (event.start_date || event.end_date) {
    return "●";
  }

  return "";
}

export function formatEventOptionLabel(
  event: EventLabelSource,
  now = new Date(),
): string {
  const baseLabel = event.name ?? `Event ${event.event_id}`;
  const marker = getEventStatusMarker(event, now);

  return marker ? `${baseLabel} ${marker}` : baseLabel;
}