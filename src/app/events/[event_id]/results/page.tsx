import { notFound } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { SEASON_11 } from "@/lib/data/season-11";
import { getSeason11Results } from "@/lib/seasonResultsData";
import SeasonResultsView from "./SeasonResultsView";

type PageProps = { params: Promise<{ event_id: string }> };

export default async function EventResultsPage({ params }: PageProps) {
  const { event_id } = await params;
  const eventId = Number(event_id);

  // Only Season 11 has bracket data wired up so far. Other events 404.
  if (eventId !== SEASON_11.event_id) notFound();

  const results = await getSeason11Results();

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0E1523", color: "#E8ECF4" }}>
      <SiteHeader />
      <main className="flex-1">
        <SeasonResultsView season={SEASON_11} results={results} />
      </main>
    </div>
  );
}
