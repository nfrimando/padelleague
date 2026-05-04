import { Suspense } from "react";
import LeaderboardView from "@/components/LeaderboardView";
import { fetchLeaderboardEvents, getLeaderboard } from "@/lib/leaderboard-data";

type PageProps = {
  searchParams: Promise<{ event?: string }>;
};

async function LeaderboardContent({ searchParams }: PageProps) {
  const { event } = await searchParams;

  const events = await fetchLeaderboardEvents();

  // Default to the most recent event (highest event_id, first in list since ordered desc)
  const defaultEventId = events[0]?.event_id ?? null;
  const selectedEventId: number | "all" =
    event === "all" ? "all" : event ? Number(event) : defaultEventId ?? "all";

  const selectedEvent = typeof selectedEventId === "number"
    ? events.find((e) => e.event_id === selectedEventId)
    : undefined;

  const rows = await getLeaderboard(selectedEventId, selectedEvent?.status);

  return (
    <LeaderboardView
      events={events}
      rows={rows}
      selectedEventId={selectedEventId}
      selectedEventStatus={selectedEvent?.status}
    />
  );
}

export default function LeaderboardPage(props: PageProps) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center p-12 text-sm text-[#687FA3]">
          Loading leaderboard...
        </div>
      }
    >
      <LeaderboardContent {...props} />
    </Suspense>
  );
}
