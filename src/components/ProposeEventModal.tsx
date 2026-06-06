"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

type Props = {
  onClose: () => void;
};

const inputCls =
  "block w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#00C8DC]/40";
const labelCls =
  "block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5";

export default function ProposeEventModal({ onClose }: Props) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [description, setDescription] = useState("");
  const [format, setFormat] = useState("");
  const [playerLimit, setPlayerLimit] = useState("");
  const [eventUrl, setEventUrl] = useState("");
  const [proposerNotes, setProposerNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("Event name is required.");
      return;
    }
    if (!startDate) {
      setError("Start date is required.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError("You must be signed in to propose an event.");
      setSubmitting(false);
      return;
    }

    const body: Record<string, unknown> = {
      name: name.trim(),
      start_date: startDate,
    };
    if (endDate) body.end_date = endDate;
    if (description.trim()) body.description = description.trim();
    if (format.trim()) body.format = format.trim();
    if (playerLimit && parseInt(playerLimit, 10) > 0)
      body.player_limit = parseInt(playerLimit, 10);
    if (eventUrl.trim()) body.event_url = eventUrl.trim();
    if (proposerNotes.trim()) body.proposer_notes = proposerNotes.trim();

    const res = await fetch("/api/event-proposals", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const json = (await res.json()) as { error?: string };

    if (!res.ok) {
      setError(json.error ?? "Failed to submit proposal.");
      setSubmitting(false);
      return;
    }

    setSuccess(true);
    setSubmitting(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 cursor-pointer"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <div>
            <h2 className="text-base font-bold text-slate-100">Propose an Event</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Submitted proposals are reviewed by the committee before going live.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition-colors text-xl leading-none cursor-pointer"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {success ? (
          <div className="px-5 py-10 text-center space-y-3">
            <div className="text-3xl">✓</div>
            <p className="text-sm font-medium text-slate-100">
              Proposal submitted!
            </p>
            <p className="text-xs text-slate-400">
              The committee will review your proposal and get back to you.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 inline-flex items-center rounded-full bg-slate-700 px-5 py-2 text-sm font-medium text-slate-100 hover:bg-slate-600 transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="px-5 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelCls}>
                  Event Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  className={inputCls}
                  placeholder="e.g. Summer Open 2026"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div>
                <label className={labelCls}>
                  Start Date <span className="text-rose-400">*</span>
                </label>
                <input
                  type="date"
                  className={inputCls}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <div>
                <label className={labelCls}>End Date</label>
                <input
                  type="date"
                  className={inputCls}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>

              <div>
                <label className={labelCls}>Format</label>
                <input
                  type="text"
                  className={inputCls}
                  placeholder="e.g. Doubles, Mixed"
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                />
              </div>

              <div>
                <label className={labelCls}>Player Limit</label>
                <input
                  type="number"
                  min={1}
                  className={inputCls}
                  placeholder="e.g. 32"
                  value={playerLimit}
                  onChange={(e) => setPlayerLimit(e.target.value)}
                />
              </div>

              <div className="sm:col-span-2">
                <label className={labelCls}>Event URL Slug</label>
                <input
                  type="text"
                  className={inputCls}
                  placeholder="e.g. summer-open-2026"
                  value={eventUrl}
                  onChange={(e) => setEventUrl(e.target.value)}
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Will become /events/{eventUrl || "your-slug"}
                </p>
              </div>

              <div className="sm:col-span-2">
                <label className={labelCls}>Description</label>
                <textarea
                  rows={3}
                  className={inputCls}
                  placeholder="Tell us about the event..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="sm:col-span-2">
                <label className={labelCls}>Notes for Committee</label>
                <textarea
                  rows={2}
                  className={inputCls}
                  placeholder="Any context or special requests..."
                  value={proposerNotes}
                  onChange={(e) => setProposerNotes(e.target.value)}
                />
              </div>
            </div>

            {error && (
              <div className="rounded-md border border-rose-800/40 bg-rose-900/20 px-3 py-2 text-sm text-rose-300">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-slate-700 px-4 py-1.5 text-sm text-slate-400 hover:text-slate-200 hover:border-slate-500 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={submitting || !name.trim() || !startDate}
                className="inline-flex items-center rounded-full bg-[#00C8DC] px-5 py-1.5 text-sm font-bold text-slate-900 hover:bg-[#00b5c8] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                {submitting ? "Submitting…" : "Submit Proposal"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
