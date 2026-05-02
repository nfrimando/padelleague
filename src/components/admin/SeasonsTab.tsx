"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { AdminSeasonRow, useAdminSeasons } from "@/lib/useAdminSeasons";

const inputCls =
  "mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-slate-900 dark:text-slate-100 text-sm";
const labelCls =
  "text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide";

export function SeasonsTab({ enabled }: { enabled: boolean }) {
  const { seasons, setSeasons, loading } = useAdminSeasons(enabled);

  const [updatingSeasonId, setUpdatingSeasonId] = useState<number | null>(null);
  const [newSeasonName, setNewSeasonName] = useState("");
  const [newSeasonStart, setNewSeasonStart] = useState("");
  const [newSeasonEnd, setNewSeasonEnd] = useState("");
  const [newSeasonFee, setNewSeasonFee] = useState("1000");
  const [newSeasonRegStatus, setNewSeasonRegStatus] = useState<
    "open" | "closed"
  >("open");
  const [newSeasonStatus, setNewSeasonStatus] = useState<
    "upcoming" | "ongoing" | "completed"
  >("upcoming");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!newSeasonStart || !newSeasonEnd) {
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
    const res = await fetch("/api/admin/seasons", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        name: newSeasonName || undefined,
        start_date: newSeasonStart,
        end_date: newSeasonEnd,
        registration_fee: newSeasonFee ? Number(newSeasonFee) : 1000,
        registration_status: newSeasonRegStatus,
        status: newSeasonStatus,
      }),
    });
    const json = (await res.json()) as {
      error?: string;
      season?: AdminSeasonRow;
    };
    if (!res.ok) {
      setError(json.error ?? "Failed to create season.");
    } else if (json.season) {
      setSuccess(`Season created (ID ${json.season.season_id}).`);
      setSeasons((prev) => [json.season as AdminSeasonRow, ...prev]);
      setNewSeasonName("");
      setNewSeasonStart("");
      setNewSeasonEnd("");
      setNewSeasonFee("1000");
    }
    setCreating(false);
  };

  const handleToggleReg = async (season: AdminSeasonRow) => {
    setUpdatingSeasonId(season.season_id);
    const newStatus = season.registration_status === "open" ? "closed" : "open";
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setUpdatingSeasonId(null);
      return;
    }
    const res = await fetch("/api/admin/seasons", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        season_id: season.season_id,
        registration_status: newStatus,
      }),
    });
    if (res.ok) {
      const json = (await res.json()) as { season?: AdminSeasonRow };
      if (json.season) {
        setSeasons((prev) =>
          prev.map((s) =>
            s.season_id === season.season_id
              ? (json.season as AdminSeasonRow)
              : s,
          ),
        );
      }
    }
    setUpdatingSeasonId(null);
  };

  const regBadge = (status: string) =>
    status === "open"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
      : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400";

  const statusBadge = (s: string) => {
    if (s === "ongoing")
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
    if (s === "completed")
      return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400";
    return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
  };

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-6 text-sm">
      {/* ── Existing seasons ── */}
      <div>
        <div className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-3">
          All Seasons
        </div>
        {loading ? (
          <div className="text-slate-500 animate-pulse">Loading…</div>
        ) : seasons.length === 0 ? (
          <p className="text-slate-500 dark:text-slate-400">
            No seasons yet. Create one below.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
            {seasons.map((s) => {
              const label = s.name ?? `Season ${s.season_id}`;
              return (
                <div
                  key={s.season_id}
                  className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-900 flex-wrap"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-slate-100">
                      {label}
                    </p>
                    <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">
                      {s.start_date && s.end_date
                        ? `${s.start_date} → ${s.end_date}`
                        : "Dates TBD"}
                      {s.registration_fee != null &&
                        ` · ₱${s.registration_fee.toLocaleString()}`}
                    </p>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-bold uppercase ${statusBadge(s.status)}`}
                  >
                    {s.status}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-bold uppercase ${regBadge(s.registration_status)}`}
                  >
                    Reg: {s.registration_status}
                  </span>
                  <button
                    type="button"
                    disabled={updatingSeasonId === s.season_id}
                    onClick={() => void handleToggleReg(s)}
                    className="text-xs font-medium px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 text-slate-700 dark:text-slate-300"
                  >
                    {updatingSeasonId === s.season_id
                      ? "…"
                      : s.registration_status === "open"
                        ? "Close Registration"
                        : "Open Registration"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Create season ── */}
      <div className="border-t border-slate-100 dark:border-slate-800 pt-5">
        <div className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">
          Create Season
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={labelCls}>Name (optional)</label>
            <input
              type="text"
              className={inputCls}
              placeholder="e.g. Season 11"
              value={newSeasonName}
              onChange={(e) => setNewSeasonName(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Start Date</label>
            <input
              type="date"
              className={inputCls}
              value={newSeasonStart}
              onChange={(e) => setNewSeasonStart(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>End Date</label>
            <input
              type="date"
              className={inputCls}
              value={newSeasonEnd}
              onChange={(e) => setNewSeasonEnd(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Registration Fee (₱)</label>
            <input
              type="number"
              className={inputCls}
              placeholder="1000"
              value={newSeasonFee}
              onChange={(e) => setNewSeasonFee(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Registration</label>
            <select
              className={inputCls}
              value={newSeasonRegStatus}
              onChange={(e) =>
                setNewSeasonRegStatus(e.target.value as "open" | "closed")
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
              value={newSeasonStatus}
              onChange={(e) =>
                setNewSeasonStatus(
                  e.target.value as "upcoming" | "ongoing" | "completed",
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
          disabled={creating || !newSeasonStart || !newSeasonEnd}
          className="mt-4 inline-flex items-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {creating ? "Creating…" : "Create Season"}
        </button>
      </div>
    </div>
  );
}
