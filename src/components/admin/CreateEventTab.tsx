"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

type AdminEventRow = {
  event_id: number;
};

const inputCls =
  "block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#00C8DC]/40";
const labelCls =
  "block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5";

export function CreateEventTab() {
  const [newEventName, setNewEventName] = useState("");
  const [newEventType, setNewEventType] = useState("league_season");
  const [newEventStart, setNewEventStart] = useState("");
  const [newEventEnd, setNewEventEnd] = useState("");
  const [newEventFee, setNewEventFee] = useState("1000");
  const [newEventImageUrl, setNewEventImageUrl] = useState("");
  const [newEventDescription, setNewEventDescription] = useState("");
  const [newEventPaymentInstructions, setNewEventPaymentInstructions] = useState("");
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
        image_url: newEventImageUrl || undefined,
        description: newEventDescription || undefined,
        payment_instructions: newEventPaymentInstructions || undefined,
      }),
    });

    const json = (await res.json()) as {
      error?: string;
      event?: AdminEventRow;
    };

    if (!res.ok) {
      setError(json.error ?? "Failed to create event.");
      setCreating(false);
      return;
    }

    if (json.event) {
      setSuccess(`Event created (ID ${json.event.event_id}).`);
      setNewEventName("");
      setNewEventType("league_season");
      setNewEventStart("");
      setNewEventEnd("");
      setNewEventFee("1000");
      setNewEventImageUrl("");
      setNewEventDescription("");
      setNewEventPaymentInstructions("");
      setNewEventRegStatus("open");
      setNewEventStatus("upcoming");
    }

    setCreating(false);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Create Event
        </h2>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Add a new league season, tournament, or event.
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-4">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Event Details
        </h3>
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
            <label className={labelCls}>Registration Fee (Php)</label>
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
          <div className="sm:col-span-2 lg:col-span-3">
            <label className={labelCls}>Image URL (optional)</label>
            <input
              type="url"
              className={inputCls}
              placeholder="https://..."
              value={newEventImageUrl}
              onChange={(ev) => setNewEventImageUrl(ev.target.value)}
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className={labelCls}>Description (optional)</label>
            <textarea
              rows={3}
              className={inputCls}
              placeholder="Short description of the event..."
              value={newEventDescription}
              onChange={(ev) => setNewEventDescription(ev.target.value)}
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className={labelCls}>Payment Instructions (optional)</label>
            <textarea
              rows={4}
              className={inputCls}
              placeholder="e.g. Bank: BDO&#10;Account: 1234567890&#10;Name: Padel League PH&#10;GCash: 0917-xxx-xxxx"
              value={newEventPaymentInstructions}
              onChange={(ev) => setNewEventPaymentInstructions(ev.target.value)}
            />
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-md border border-rose-200 dark:border-rose-800/40 bg-rose-50 dark:bg-rose-900/20 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          {success}
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={creating || !newEventStart || !newEventEnd}
          className="inline-flex items-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {creating ? "Creating…" : "Create Event"}
        </button>
      </div>
    </div>
  );
}
