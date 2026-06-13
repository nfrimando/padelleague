"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Props = {
  onClose: () => void;
};

const inputCls =
  "block w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#00C8DC]/40";
const labelCls =
  "block text-xs font-medium text-slate-300 uppercase tracking-wide mb-1.5";
const reqStar = <span className="text-rose-400 font-bold ml-0.5">*</span>;

export default function ProposeEventModal({ onClose }: Props) {
  // Required
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [signupDeadline, setSignupDeadline] = useState("");

  // Optional
  const [endDate, setEndDate] = useState("");
  const [format, setFormat] = useState("");
  const [playerPool, setPlayerPool] = useState("");
  const [minRating, setMinRating] = useState("");
  const [maxRating, setMaxRating] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdEventId, setCreatedEventId] = useState<number | null>(null);

  const canSubmit = name.trim() && startDate && signupDeadline;

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("Event name is required.");
      return;
    }
    if (!startDate) {
      setError("Start date is required.");
      return;
    }
    if (!signupDeadline) {
      setError("Signup deadline is required.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError("You must be signed in to create an event.");
      setSubmitting(false);
      return;
    }

    const body: Record<string, unknown> = {
      name: name.trim(),
      start_date: startDate,
      signup_deadline: signupDeadline,
    };
    if (endDate) body.end_date = endDate;
    if (format.trim()) body.format = format.trim();
    if (playerPool && parseInt(playerPool, 10) > 0)
      body.player_limit = parseInt(playerPool, 10);
    if (minRating && !isNaN(parseFloat(minRating)))
      body.min_rating = parseFloat(minRating);
    if (maxRating && !isNaN(parseFloat(maxRating)))
      body.max_rating = parseFloat(maxRating);
    if (description.trim()) body.description = description.trim();
    if (notes.trim()) body.notes = notes.trim();
    if (imageUrl.trim()) body.image_url = imageUrl.trim();

    const res = await fetch("/api/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const json = (await res.json()) as {
      error?: string;
      event?: { event_id: number };
    };

    if (!res.ok) {
      setError(json.error ?? "Failed to create event.");
      setSubmitting(false);
      return;
    }

    setCreatedEventId(json.event?.event_id ?? null);
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
            <h2 className="text-base font-bold text-slate-100">
              Propose an Event
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Submitted proposals are reviewed by the committee before going
              live.
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

        {createdEventId !== null ? (
          <div className="px-5 py-10 text-center space-y-3">
            <div className="text-3xl text-emerald-400">✓</div>
            <p className="text-sm font-semibold text-slate-100">
              Event proposal submitted!
            </p>
            <p className="text-xs text-slate-400">
              The committee will review your proposal. In the meantime, you can
              view and edit your event page.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center mt-4">
              <Link
                href={`/events/${createdEventId}`}
                onClick={onClose}
                className="inline-flex items-center justify-center rounded-full bg-[#00C8DC] px-5 py-2 text-sm font-bold text-slate-900 hover:bg-[#00b5c8] transition-colors cursor-pointer"
              >
                View event page →
              </Link>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center justify-center rounded-full bg-slate-700 px-5 py-2 text-sm font-medium text-slate-100 hover:bg-slate-600 transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="max-h-[70vh] overflow-y-auto">
            {/* Required section */}
            <div className="px-5 pt-5 pb-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-rose-400 mb-3">
                Required
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={labelCls}>Event Name {reqStar}</label>
                  <input
                    type="text"
                    className={inputCls}
                    placeholder="e.g. Summer Open 2026"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelCls}>Start Date {reqStar}</label>
                  <input
                    type="date"
                    className={inputCls}
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelCls}>Signup Deadline {reqStar}</label>
                  <input
                    type="date"
                    className={inputCls}
                    value={signupDeadline}
                    onChange={(e) => setSignupDeadline(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-slate-700/60 mx-5" />

            {/* Optional section */}
            <div className="px-5 pt-4 pb-5">
              <div className="flex items-baseline gap-2 mb-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Optional
                </p>
                <span className="text-[10px] text-slate-600 normal-case tracking-normal">
                  — you can edit these after your proposal is accepted
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
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
                    placeholder="E.g. Fixed Partners, Teams of 3, etc."
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelCls}>Estimated Player Pool</label>
                  <input
                    type="number"
                    min={1}
                    className={inputCls}
                    placeholder="e.g. 32"
                    value={playerPool}
                    onChange={(e) => setPlayerPool(e.target.value)}
                  />
                </div>
                <div />
                <div>
                  <label className={labelCls}>Minimum Rating</label>
                  <input
                    type="number"
                    className={inputCls}
                    placeholder="e.g. 2.00"
                    value={minRating}
                    onChange={(e) => setMinRating(e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelCls}>Maximum Rating</label>
                  <input
                    type="number"
                    className={inputCls}
                    placeholder="e.g. 4.00"
                    value={maxRating}
                    onChange={(e) => setMaxRating(e.target.value)}
                  />
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
                  <label className={labelCls}>Other Notes</label>
                  <textarea
                    rows={2}
                    className={inputCls}
                    placeholder="Any context or special requests for the organizers..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Image URL</label>
                  <input
                    type="url"
                    className={inputCls}
                    placeholder="https://..."
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {error && (
              <div className="mx-5 mb-3 rounded-md border border-rose-800/40 bg-rose-900/20 px-3 py-2 text-sm text-rose-300">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 px-5 pb-5">
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
                disabled={submitting || !canSubmit}
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
