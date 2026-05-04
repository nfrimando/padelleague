"use client";

import { useEffect, useState } from "react";
import SiteHeader from "@/components/SiteHeader";
import EventCard from "@/components/EventCard";
import { Event } from "@/lib/types";

type Section = {
  key: string;
  heading: string;
  events: Event[];
};

function buildSections(events: Event[]): Section[] {
  const open = events.filter(
    (e) => e.registration_status === "open" && e.status !== "ongoing",
  );
  const upcoming = events.filter(
    (e) => e.status === "upcoming" && e.registration_status !== "open",
  );
  const ongoing = events.filter((e) => e.status === "ongoing");
  const completed = events.filter((e) => e.status === "completed");

  return [
    { key: "open", heading: "Open for Signup", events: open },
    { key: "upcoming", heading: "Upcoming", events: upcoming },
    { key: "ongoing", heading: "Ongoing", events: ongoing },
    { key: "completed", heading: "Completed", events: completed },
  ].filter((s) => s.events.length > 0);
}

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/events");
        const json = (await res.json()) as {
          error?: string;
          events?: Event[];
        };

        if (!cancelled) {
          if (!res.ok) {
            setError(json.error ?? "Failed to load events.");
          } else {
            // Defensive: sort by start_date descending in case API changes or SSR mismatch
            const sorted = (json.events ?? []).slice().sort((a, b) => {
              const aDate = a.start_date ? new Date(a.start_date).getTime() : 0;
              const bDate = b.start_date ? new Date(b.start_date).getTime() : 0;
              return bDate - aDate;
            });
            setEvents(sorted);
          }
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError("Failed to load events.");
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const sections = buildSections(events);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <SiteHeader activePath="/events" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-24 pb-20">
        {/* Page heading */}
        <div className="mb-10">
          <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-slate-100">
            Events
          </h1>
          <p className="mt-2 text-slate-500 dark:text-slate-400">
            All seasons, tournaments, and other events -- past and present.
          </p>
        </div>

        {loading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden animate-pulse"
              >
                <div className="aspect-[16/7] bg-slate-200 dark:bg-slate-800" />
                <div className="p-5 space-y-3">
                  <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/3" />
                  <div className="h-6 bg-slate-200 dark:bg-slate-800 rounded w-2/3" />
                  <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="rounded-lg border border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-900/10 p-4 text-sm text-rose-700 dark:text-rose-300">
            {error}
          </div>
        ) : sections.length === 0 ? (
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            No events found.
          </p>
        ) : (
          <div className="space-y-14">
            {sections.map((section) => (
              <section key={section.key}>
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-5 pb-2 border-b border-slate-200 dark:border-slate-800">
                  {section.heading}
                </h2>
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {section.events.map((event) => (
                    <EventCard key={event.event_id} event={event} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
