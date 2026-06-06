"use client";

import Link from "next/link";
import { Event } from "@/lib/types";

type Props = {
  event: Event;
  isAccepted?: boolean;
  currentPlayerRating?: number;
};

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateRange(start?: string | null, end?: string | null): string {
  if (!start && !end) return "Dates TBD";
  if (start && !end) return formatDate(start);
  if (!start && end) return `Until ${formatDate(end)}`;
  const s = new Date(start! + "T00:00:00");
  const e = new Date(end! + "T00:00:00");
  if (s.getFullYear() === e.getFullYear()) {
    if (s.getMonth() === e.getMonth()) {
      return `${s.toLocaleDateString("en-PH", { month: "short", day: "numeric" })} – ${e.getDate()}, ${e.getFullYear()}`;
    }
    return `${s.toLocaleDateString("en-PH", { month: "short", day: "numeric" })} – ${e.toLocaleDateString("en-PH", { month: "short", day: "numeric" })}, ${e.getFullYear()}`;
  }
  return `${formatDate(start)} – ${formatDate(end)}`;
}

const STATUS_STYLES: Record<Event["status"], { badge: string; label: string }> =
  {
    upcoming: {
      badge:
        "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
      label: "Upcoming",
    },
    ongoing: {
      badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
      label: "Ongoing",
    },
    completed: {
      badge:
        "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
      label: "Completed",
    },
  };

function buildRestrictionTags(event: Event): string[] {
  const r = event.restrictions;
  if (!r) return [];
  const tags: string[] = [];
  if (r.min_rating != null && r.max_rating != null) {
    tags.push(`Rating ${r.min_rating}–${r.max_rating}`);
  } else if (r.min_rating != null) {
    tags.push(`Rating ≥ ${r.min_rating}`);
  } else if (r.max_rating != null) {
    tags.push(`Rating ≤ ${r.max_rating}`);
  }
  if (r.max_games_per_player != null) {
    tags.push(`Max ${r.max_games_per_player} game${r.max_games_per_player !== 1 ? "s" : ""}/player`);
  }
  return tags;
}

function getEligibilityHint(event: Event, rating?: number): string | null {
  const r = event.restrictions;
  if (!r || rating == null) return null;
  if (r.min_rating != null && rating < r.min_rating) {
    return `Your rating (${Math.round(rating)}) is below the minimum`;
  }
  if (r.max_rating != null && rating > r.max_rating) {
    return `Your rating (${Math.round(rating)}) exceeds the maximum`;
  }
  return null;
}

export default function EventCard({ event, isAccepted = false, currentPlayerRating }: Props) {
  const statusStyle = STATUS_STYLES[event.status];
  const isOpen = event.registration_status === "open";
  const dateRange = formatDateRange(event.start_date, event.end_date);
  const restrictionTags = buildRestrictionTags(event);
  const eligibilityHint = isOpen ? getEligibilityHint(event, currentPlayerRating) : null;

  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      {/* Image */}
      <div className="relative aspect-[16/7] bg-slate-100 dark:bg-slate-800 overflow-hidden">
        {event.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.image_url}
            alt={event.name ?? "Event"}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-slate-400 dark:text-slate-500 text-4xl font-black italic uppercase tracking-tighter select-none">
              PADEL
            </span>
          </div>
        )}
        {/* Status overlay badge */}
        <span
          className={`absolute top-3 left-3 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide ${statusStyle.badge}`}
        >
          {statusStyle.label}
        </span>
        {isOpen && (
          <span className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
            Open
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-col flex-1 p-5 gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">
            {event.event_type.replace(/_/g, " ")}
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 leading-tight">
            {event.name ?? `Event #${event.event_id}`}
          </h3>
          {event.description && (
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-3">
              {event.description}
            </p>
          )}
        </div>

        {/* Details row */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-slate-300">
          <span>📅 {dateRange}</span>
        </div>

        {/* Restriction tags */}
        {restrictionTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {restrictionTags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-[11px] font-medium text-slate-500 dark:text-slate-400"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Eligibility hint */}
        {eligibilityHint && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400">
            {eligibilityHint}
          </p>
        )}

        {/* CTA */}
        <div className="mt-auto pt-1">
          {isOpen ? (
            <Link
              href={`/events/register?eventId=${event.event_id}`}
              className={`inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-700 transition-colors${eligibilityHint ? " opacity-50" : ""}`}
            >
              Register Now
            </Link>
          ) : event.status === "completed" ? (
            <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">
              Event completed
            </span>
          ) : isAccepted && event.url_link ? (
            <a
              href={event.url_link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-700 px-5 py-2 text-sm font-medium text-emerald-400 hover:border-emerald-500 hover:text-emerald-300 transition-colors cursor-pointer"
            >
              See details →
            </a>
          ) : (
            <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">
              Registration closed
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
