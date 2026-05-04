import LeaderboardView from "@/components/LeaderboardView";
import { fetchLeaderboardEvents, getLeaderboard } from "@/lib/leaderboardData";
import { ALL_MATCH_FILTER } from "@/lib/matches";

type PageProps = {
  searchParams: Promise<{ event?: string; type?: string }>;
};

export default async function LeaderboardPage({ searchParams }: PageProps) {
  const { event, type } = await searchParams;

  const events = await fetchLeaderboardEvents();

  // Default to the most recent event (highest event_id, first in list since ordered desc)
  const defaultEventId = events[0]?.event_id ?? null;
  const selectedEventId: number | "ALL" =
    event === "ALL" ? "ALL" : event ? Number(event) : (defaultEventId ?? "ALL");

  const selectedEvent =
    typeof selectedEventId === "number"
      ? events.find((e) => e.event_id === selectedEventId)
      : undefined;

  const selectedType =
    type && type !== ALL_MATCH_FILTER ? type : ALL_MATCH_FILTER;

  const rows = await getLeaderboard(
    selectedEventId,
    selectedEvent?.status,
    selectedType,
  );

  return (
    <LeaderboardView
      events={events}
      rows={rows}
      selectedEventId={selectedEventId}
      selectedEventStatus={selectedEvent?.status}
      selectedType={selectedType}
    />
  );
}
