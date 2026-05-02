"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { AdminEventRow, useAdminEvents } from "@/lib/useAdminEvents";

const inputCls =
  "mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-slate-900 dark:text-slate-100 text-sm";
const labelCls =
  "text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide";

export function EventsTab({ enabled }: { enabled: boolean }) {
  const { events, setEvents, loading } = useAdminEvents(enabled);

  const [updatingEventId, setUpdatingEventId] = useState<number | null>(null);
  const [newEventName, setNewEventName] = useState("");
  const [newEventType, setNewEventType] = useState("league_season");
  const [newEventStart, setNewEventStart] = useState("");
  const [newEventEnd, setNewEventEnd] = useState("");
  const [newEventFee, setNewEventFee] = useState("1000");
  const [newEventRegStatus, setNewEventRegStatus] = useState<"open" | "closed">(
    "open",
  );
  const [newEventStatus, setNewEventStatus] = useState<
    "upcoming" | "ongoing" | "completed"
  >("upcoming");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!newEventStart || !newEventEnd) {
      setError("Start date and end date are required.");
      return;
    }
    setCreating(true);
    setError(null);
    setSuccess(null);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setError("No active session.");
      setCreating(false);
      return;
    }

    const res = await fetch("/api/admin/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        name: newEventName || undefined,
        event_type: newEventType,
        start_date: newEventStart,
        end_date: newEventEnd,
        registration_fee: newEventFee ? Number(newEventFee) : 1000,
        registration_status: newEventRegStatus,
        status: newEventStatus,
      }),
    });

    const json = (await res.json()) as {
      error?: string;
      event?: AdminEventRow;
    };

    if (!res.ok) {
      setError(json.error ?? "Failed to create event.");
    } else if (json.event) {
      setSuccess(`Event created (ID ${json.event.event_id}).`);
      setEvents((prev) => [json.event as AdminEventRow, ...prev]);
      setNewEventName("");
      setNewEventType("league_season");
      setNewEventStart("");
      setNewEventEnd("");
      setNewEventFee("1000");
    }
    setCreating(false);
  };

  const handleToggleReg = async (event: AdminEventRow) => {
    setUpdatingEventId(event.event_id);
    const newStatus = event.registration_status === "open" ? "closed" : "open";
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setUpdatingEventId(null);
      return;
    }

    const res = await fetch("/api/admin/events", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        event_id: event.event_id,
        registration_status: newStatus,
      }),
    });

    if (res.ok) {
      const json = (await res.json()) as { event?: AdminEventRow };
      if (json.event) {
        setEvents((prev) =>
          prev.map((e) =>
            e.event_id === event.event_id ? (json.event as AdminEventRow) : e,
          ),
        );
      }
    }
    setUpdatingEventId(null);
  };

  const regBadge = (status: string) =>
    status === "open"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
      : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400";

  const statusBadge = (s: string) => {
    if (s === "ongoing") {
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
    }
    if (s === "completed") {
      return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400";
    }
    return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
  };

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-6 text-sm">
      <div>
        <div className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-3">
          All Events
        </div>
        {loading ? (
          <div className="text-slate-500 animate-pulse">Loading…</div>
        ) : events.length === 0 ? (
          <p className="text-slate-500 dark:text-slate-400">
            No events yet. Create one below.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
            {events.map((e) => {
              const label = e.name ?? `Event ${e.event_id}`;
              return (
                <div
                  key={e.event_id}
                  className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-900 flex-wrap"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-slate-100">
                      {label}
                    </p>
                    <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">
                      {e.start_date && e.end_date
                        ? `${e.start_date} → ${e.end_date}`
                        : "Dates TBD"}
                      {` · ${e.event_type}`}
                      {e.registration_fee != null
                        ? ` · ₱${e.registration_fee.toLocaleString()}`
                        : ""}
                    </p>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-bold uppercase ${statusBadge(e.status)}`}
                  >
                    {e.status}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-bold uppercase ${regBadge(e.registration_status)}`}
                  >
                    Reg: {e.registration_status}
                  </span>
                  <button
                    type="button"
                    disabled={updatingEventId === e.event_id}
                    onClick={() => void handleToggleReg(e)}
                    className="text-xs font-medium px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 text-slate-700 dark:text-slate-300"
                  >
                    {updatingEventId === e.event_id
                      ? "…"
                      : e.registration_status === "open"
                        ? "Close Registration"
                        : "Open Registration"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-slate-100 dark:border-slate-800 pt-5">
        <div className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">
          Create Event
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={labelCls}>Name (optional)</label>
            <input
              type="text"
              className={inputCls}
              placeholder="e.g. Summer Open"
              value={newEventName}
              onChange={(ev) => setNewEventName(ev.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Type</label>
            <input
              type="text"
              className={inputCls}
              placeholder="league_season"
              value={newEventType}
              onChange={(ev) => setNewEventType(ev.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Start Date</label>
            <input
              type="date"
              className={inputCls}
              value={newEventStart}
              onChange={(ev) => setNewEventStart(ev.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>End Date</label>
            <input
              type="date"
              className={inputCls}
              value={newEventEnd}
              onChange={(ev) => setNewEventEnd(ev.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Registration Fee (₱)</label>
            <input
              type="number"
              className={inputCls}
              value={newEventFee}
              onChange={(ev) => setNewEventFee(ev.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Registration</label>
            <select
              className={inputCls}
              value={newEventRegStatus}
              onChange={(ev) =>
                setNewEventRegStatus(ev.target.value as "open" | "closed")
              }
            >
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Status</label>
            <select
              className={inputCls}
              value={newEventStatus}
              onChange={(ev) =>
                setNewEventStatus(
                  ev.target.value as "upcoming" | "ongoing" | "completed",
                )
              }
            >
              <option value="upcoming">Upcoming</option>
              <option value="ongoing">Ongoing</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded bg-rose-50 dark:bg-rose-900/20 px-3 py-2 text-rose-700 dark:text-rose-300 text-xs">
            {error}
          </div>
        )}
        {success && (
          <div className="mt-3 rounded bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-emerald-700 dark:text-emerald-300 text-xs">
            ✓ {success}
          </div>
        )}

        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={creating || !newEventStart || !newEventEnd}
          className="mt-4 inline-flex items-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {creating ? "Creating…" : "Create Event"}
        </button>
      </div>
    </div>
  );
}
