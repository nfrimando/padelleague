import { Suspense } from "react";
import LeaderboardView from "@/components/LeaderboardView";
import { fetchLeaderboardEvents, getLeaderboard } from "@/lib/leaderboardData";
import { ALL_MATCH_FILTER, MATCH_TYPE_FILTER_OPTIONS } from "@/lib/matches";

type PageProps = {
  searchParams: Promise<{ event?: string; type?: string }>;
};

async function LeaderboardContent({ searchParams }: PageProps) {
  const { event, type } = await searchParams;

  const events = await fetchLeaderboardEvents();

  // Default to the most recent event (highest event_id, first in list since ordered desc)
  const defaultEventId = events[0]?.event_id ?? null;
  const selectedEventId: number | "all" =
    event === "all" ? "all" : event ? Number(event) : defaultEventId ?? "all";

  const selectedEvent = typeof selectedEventId === "number"
    ? events.find((e) => e.event_id === selectedEventId)
    : undefined;

  const validTypeValues = MATCH_TYPE_FILTER_OPTIONS.map((o) => o.value as string);
  const selectedMatchType =
    type && validTypeValues.includes(type) ? type : ALL_MATCH_FILTER;

  const rows = await getLeaderboard(selectedEventId, selectedEvent?.status, selectedMatchType);

  return (
    <LeaderboardView
      events={events}
      rows={rows}
      selectedEventId={selectedEventId}
      selectedEventStatus={selectedEvent?.status}
      selectedMatchType={selectedMatchType}
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
