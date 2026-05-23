"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase";

// Hours shown in display order: 6am–11pm then midnight
const DISPLAY_HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TOTAL_BLOCKS = DISPLAY_HOURS.length * DAYS.length; // 133

function hourLabel(h: number): string {
  if (h === 0) return "12am";
  if (h < 12) return `${h}am`;
  if (h === 12) return "12pm";
  return `${h - 12}pm`;
}

function slotKey(day: number, hour: number): string {
  return `${day}-${hour}`;
}

type Props = {
  playerId: number;
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

export default function EditScheduleModal({ isOpen, onClose, onSaved }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingPrefs, setLoadingPrefs] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Rectangular drag-select state — kept in refs to avoid re-renders mid-drag
  const dragStartRef = useRef<{ day: number; hour: number } | null>(null);
  const dragModeRef = useRef<"add" | "remove" | null>(null);
  const baseSelectionRef = useRef<Set<string>>(new Set()); // snapshot at drag start
  const lastRectEndRef = useRef<string | null>(null);      // skip recompute if end cell unchanged

  // Fetch existing schedule on open
  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setLoadingPrefs(true);
    void (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) return;
        const res = await fetch("/api/players/schedule-preferences", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) return;
        const json = (await res.json()) as {
          schedule?: { day_of_week: number; start_hour: number }[];
        };
        const keys = new Set((json.schedule ?? []).map((s) => slotKey(s.day_of_week, s.start_hour)));
        setSelected(keys);
      } catch {
        // silently ignore; start with empty
      } finally {
        setLoadingPrefs(false);
      }
    })();
  }, [isOpen]);

  // Body lock + Escape
  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [isOpen, onClose]);

  // End drag on pointer up anywhere on the page
  useEffect(() => {
    const onUp = () => {
      dragStartRef.current = null;
      dragModeRef.current = null;
      baseSelectionRef.current = new Set();
      lastRectEndRef.current = null;
    };
    window.addEventListener("pointerup", onUp);
    return () => window.removeEventListener("pointerup", onUp);
  }, []);

  // Recompute the full bounding rectangle from drag start → (currentDay, currentHour)
  // and apply add/remove to a snapshot of the selection taken at drag start.
  function applyRect(currentDay: number, currentHour: number) {
    if (!dragStartRef.current || !dragModeRef.current) return;

    const { day: startDay, hour: startHour } = dragStartRef.current;
    const minDay = Math.min(startDay, currentDay);
    const maxDay = Math.max(startDay, currentDay);
    const startHourIdx = DISPLAY_HOURS.indexOf(startHour);
    const currentHourIdx = DISPLAY_HOURS.indexOf(currentHour);
    const minHourIdx = Math.min(startHourIdx, currentHourIdx);
    const maxHourIdx = Math.max(startHourIdx, currentHourIdx);

    const next = new Set(baseSelectionRef.current);
    for (let d = minDay; d <= maxDay; d++) {
      for (let hi = minHourIdx; hi <= maxHourIdx; hi++) {
        const key = slotKey(d, DISPLAY_HOURS[hi]);
        if (dragModeRef.current === "add") next.add(key);
        else next.delete(key);
      }
    }
    setSelected(next);
  }

  function handleCellPointerDown(day: number, hour: number, e: React.PointerEvent, isOn: boolean) {
    e.preventDefault();
    dragStartRef.current = { day, hour };
    dragModeRef.current = isOn ? "remove" : "add";
    baseSelectionRef.current = new Set(selected); // snapshot before any changes
    lastRectEndRef.current = null;
    applyRect(day, hour); // apply single-cell rect immediately
  }

  // pointermove on the grid container — works for both mouse and touch
  function handleGridPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragStartRef.current || !dragModeRef.current) return;
    e.preventDefault();
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el) return;
    const cell = (el as Element).closest("[data-sched-cell]");
    if (!cell) return;
    const currentDay = Number(cell.getAttribute("data-day"));
    const currentHour = Number(cell.getAttribute("data-hour"));
    if (isNaN(currentDay) || isNaN(currentHour)) return;
    const endKey = `${currentDay}-${currentHour}`;
    if (endKey === lastRectEndRef.current) return; // pointer still on same cell, skip
    lastRectEndRef.current = endKey;
    applyRect(currentDay, currentHour);
  }

  function toggleDay(day: number) {
    const allForDay = DISPLAY_HOURS.map((h) => slotKey(day, h));
    const allSel = allForDay.every((k) => selected.has(k));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSel) allForDay.forEach((k) => next.delete(k));
      else allForDay.forEach((k) => next.add(k));
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setError("Session expired. Please refresh.");
        return;
      }

      const slots = Array.from(selected).map((key) => {
        const [day, hour] = key.split("-").map(Number);
        return { day_of_week: day, start_hour: hour };
      });

      const res = await fetch("/api/players/schedule-preferences", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ slots }),
      });

      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        setError(json.error ?? "Failed to save. Please try again.");
        return;
      }

      onSaved?.();
      onClose();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!mounted || !isOpen) return null;

  const meetsMinimum = selected.size / TOTAL_BLOCKS > 0.3;

  const modal = (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 cursor-pointer"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative w-full sm:max-w-lg bg-[#0e1523] border border-[#687FA3]/20 sm:rounded-2xl shadow-2xl flex flex-col max-h-[90dvh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[#687FA3]/10 shrink-0">
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-white">
              Schedule Preferences
            </h2>
            <p className="text-[10px] text-[#687FA3] mt-0.5">
              Drag to select blocks. Tap a day header to toggle the whole day.
            </p>
            <p className="text-[10px] text-red-400 mt-1 font-bold">
              Select more than 30% of blocks to save.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/40 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Grid */}
        <div className="overflow-y-auto flex-1 px-4 py-4">
          {loadingPrefs ? (
            <div className="space-y-1.5">
              {DISPLAY_HOURS.map((h) => (
                <div key={h} className="h-7 rounded bg-[#1a2540] animate-pulse" />
              ))}
            </div>
          ) : (
            <div
              className="grid"
              style={{
                gridTemplateColumns: "2.5rem repeat(7, 1fr)",
                gap: "2px",
                touchAction: "none", // lets pointermove fire on touch without triggering scroll
              }}
              onPointerMove={handleGridPointerMove}
            >
              {/* Day headers */}
              <div /> {/* empty corner */}
              {DAYS.map((day, d) => {
                const allForDay = DISPLAY_HOURS.map((h) => slotKey(d, h));
                const allSel = allForDay.every((k) => selected.has(k));
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(d)}
                    title={allSel ? `Clear ${day}` : `Select all ${day}`}
                    className={`text-[9px] font-black uppercase tracking-widest pb-1 transition-colors cursor-pointer ${
                      allSel ? "text-[#00C8DC]" : "text-[#687FA3] hover:text-slate-300"
                    }`}
                  >
                    {day}
                  </button>
                );
              })}

              {/* Hour rows */}
              {DISPLAY_HOURS.map((hour) => (
                <Fragment key={hour}>
                  <div
                    className="flex items-center justify-end pr-1.5 text-[9px] font-mono text-[#687FA3]/60 select-none"
                  >
                    {hourLabel(hour)}
                  </div>
                  {DAYS.map((_, d) => {
                    const key = slotKey(d, hour);
                    const on = selected.has(key);
                    return (
                      <button
                        key={`${d}-${hour}`}
                        type="button"
                        data-sched-cell=""
                        data-day={d}
                        data-hour={hour}
                        onPointerDown={(e) => handleCellPointerDown(d, hour, e, on)}
                        className={`h-7 rounded select-none cursor-pointer transition-colors ${
                          on
                            ? meetsMinimum
                              ? "bg-green-500/25 border border-green-500/50"
                              : "bg-red-500/20 border border-red-500/40"
                            : "bg-[#0d1520] border border-[#687FA3]/10 hover:bg-[#1a2540]"
                        }`}
                        aria-label={`${DAYS[d]} ${hourLabel(hour)} ${on ? "selected" : "not selected"}`}
                      />
                    );
                  })}
                </Fragment>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[#687FA3]/10 shrink-0 space-y-3">
          {error && (
            <p className="text-red-400 text-xs bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <span className={`text-[10px] font-bold ${meetsMinimum ? "text-green-400" : selected.size > 0 ? "text-red-400" : "text-[#687FA3]"}`}>
              {selected.size} / {TOTAL_BLOCKS} slots ({Math.round(selected.size / TOTAL_BLOCKS * 100)}%)
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest text-[#687FA3] hover:text-white bg-[#1a2540] hover:bg-[#1e2d50] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving || !meetsMinimum}
                className="px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest bg-[#00C8DC] hover:bg-[#00b8ca] disabled:opacity-50 disabled:cursor-not-allowed text-[#0e1523] transition-colors flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <span className="w-3 h-3 border-2 border-[#0e1523] border-t-transparent rounded-full animate-spin" />
                    Saving…
                  </>
                ) : (
                  "Save"
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
