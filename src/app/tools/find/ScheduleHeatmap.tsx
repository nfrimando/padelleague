"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import {
  SCHED_DAYS,
  SCHED_HOURS,
  schedHourLabel,
  fullSchedHourLabel,
  slotKey,
} from "@/lib/scheduleGrid";
import type { ScheduleRow, SchedulePlayer } from "@/lib/useAllPlayerSchedules";

// Density buckets — counts grow unbounded across the whole league, so we bucket
// rather than map 1:1 to a fixed palette.
function densityClass(count: number): string {
  if (count <= 0) return "bg-[#0d1520] border-transparent";
  if (count === 1) return "bg-slate-600/40 border-slate-500/30";
  if (count === 2) return "bg-sky-700/50 border-sky-500/40";
  if (count <= 4) return "bg-cyan-600/60 border-cyan-400/50";
  if (count <= 7) return "bg-emerald-600/70 border-emerald-400/60";
  return "bg-emerald-500/85 border-emerald-300/70";
}

function avatarSrc(p: SchedulePlayer): string {
  return p.image_link && p.image_link !== "null"
    ? p.image_link
    : "/default-avatar.webp";
}

function playerTitle(p: SchedulePlayer): string {
  const rating = p.latestRating != null ? p.latestRating.toFixed(2) : "—";
  const side = p.preferred_side ? ` · ${p.preferred_side}` : "";
  return `${p.nickname || p.name || "Player"} · ${rating}${side}`;
}

function CellAvatars({ players }: { players: SchedulePlayer[] }) {
  const shown = players.slice(0, 3);
  const extra = players.length - shown.length;
  return (
    <div className="flex items-center justify-center -space-x-1.5">
      {shown.map((p) => (
        <img
          key={p.id}
          src={avatarSrc(p)}
          alt={p.name ?? "Player"}
          title={playerTitle(p)}
          className="h-5 w-5 rounded-full object-cover ring-1 ring-[#162032]"
        />
      ))}
      {extra > 0 && (
        <span className="pl-2 text-[9px] font-bold text-white/80 tabular-nums">
          +{extra}
        </span>
      )}
    </div>
  );
}

function PlayerRow({ p }: { p: SchedulePlayer }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <img
        src={avatarSrc(p)}
        alt={p.name ?? "Player"}
        className="h-6 w-6 rounded-full object-cover ring-1 ring-white/10 shrink-0"
      />
      <span className="text-xs text-slate-200 truncate">
        {p.nickname || p.name || "—"}
      </span>
      <span className="text-[11px] font-mono text-[#00C8DC] tabular-nums shrink-0">
        {p.latestRating != null ? p.latestRating.toFixed(2) : "—"}
      </span>
      {p.preferred_side && (
        <span className="text-[8px] font-black uppercase text-[#687FA3]/80 bg-[#687FA3]/10 border border-[#687FA3]/20 px-1 rounded-sm leading-none shrink-0">
          {p.preferred_side === "both" ? "L·R" : p.preferred_side[0]}
        </span>
      )}
    </div>
  );
}

type SlotDetail = { label: string; players: SchedulePlayer[] };

// Modal listing everyone free in a tapped slot. Replaces the old hover panel,
// which shifted the grid as its player list wrapped to multiple lines.
function SlotPlayersModal({
  slot,
  onClose,
}: {
  slot: SlotDetail | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!slot) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slot, onClose]);

  // Highest rating first; unrated players fall to the bottom.
  const players = useMemo(
    () =>
      slot
        ? [...slot.players].sort(
            (a, b) => (b.latestRating ?? -Infinity) - (a.latestRating ?? -Infinity),
          )
        : [],
    [slot],
  );

  if (!slot) return null;

  const modal = (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="fixed inset-0 bg-black/70 cursor-pointer"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full sm:max-w-sm bg-[#0e1523] border border-[#687FA3]/20 sm:rounded-2xl shadow-2xl flex flex-col max-h-[80dvh]">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[#687FA3]/10 shrink-0">
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-white">
              {slot.label}
            </h2>
            <p className="text-[10px] text-[#687FA3] mt-0.5">
              {players.length} {players.length === 1 ? "player" : "players"} free
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/40 hover:text-white transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-2.5">
          {players.length === 0 ? (
            <p className="text-xs text-[#687FA3]/60">No one free.</p>
          ) : (
            players.map((p) => <PlayerRow key={p.id} p={p} />)
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

export default function ScheduleHeatmap({
  rows,
  playersById,
  min,
  max,
}: {
  rows: ScheduleRow[];
  playersById: Map<string, SchedulePlayer>;
  min: number | null;
  max: number | null;
}) {
  const slotMap = useMemo(() => {
    const m = new Map<string, SchedulePlayer[]>();
    for (const row of rows) {
      const p = playersById.get(row.playerId);
      if (!p) continue;
      if (min != null && (p.latestRating == null || p.latestRating < min)) continue;
      if (max != null && (p.latestRating == null || p.latestRating > max)) continue;
      const key = slotKey(row.dayOfWeek, row.startHour);
      let arr = m.get(key);
      if (!arr) {
        arr = [];
        m.set(key, arr);
      }
      arr.push(p);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => (b.latestRating ?? 0) - (a.latestRating ?? 0));
    }
    return m;
  }, [rows, playersById, min, max]);

  const [openSlot, setOpenSlot] = useState<SlotDetail | null>(null);

  // Mobile agenda: default to the current weekday (Mon=0 … Sun=6).
  const todayIdx = (new Date().getDay() + 6) % 7;
  const [selectedDay, setSelectedDay] = useState(todayIdx);

  const agendaHours = SCHED_HOURS.map((hour) => ({
    hour,
    players: slotMap.get(slotKey(selectedDay, hour)) ?? [],
  })).filter((h) => h.players.length > 0);

  return (
    <section className="bg-[#162032] border border-[#687FA3]/10 sm:rounded-3xl">
      <SlotPlayersModal slot={openSlot} onClose={() => setOpenSlot(null)} />

      {/* ── Desktop heatmap ── */}
      <div className="hidden sm:block p-5">
        <p className="text-[11px] text-[#687FA3]/50 mb-3 px-1">
          Tap a block to see who&apos;s free. Brighter = more players available.
        </p>

        <div
          className="grid"
          style={{ gridTemplateColumns: "2rem repeat(7, 1fr)", gap: "2px" }}
        >
          <div />
          {SCHED_DAYS.map((d) => (
            <div
              key={d}
              className="text-[9px] font-black uppercase tracking-widest text-center text-[#687FA3]/60 pb-1 select-none"
            >
              {d}
            </div>
          ))}

          {SCHED_HOURS.map((hour) => (
            <Fragment key={hour}>
              <div className="flex items-center justify-end pr-1 text-[9px] font-mono text-[#687FA3]/40 select-none">
                {schedHourLabel(hour)}
              </div>
              {SCHED_DAYS.map((_, d) => {
                const players = slotMap.get(slotKey(d, hour)) ?? [];
                const count = players.length;
                return (
                  <button
                    key={`${d}-${hour}`}
                    type="button"
                    disabled={count === 0}
                    onClick={() =>
                      setOpenSlot({
                        label: `${SCHED_DAYS[d]} ${fullSchedHourLabel(hour)}`,
                        players,
                      })
                    }
                    className={`h-9 rounded-[3px] border flex items-center justify-center px-0.5 transition-all ${
                      count > 0
                        ? "cursor-pointer hover:brightness-125"
                        : "cursor-default"
                    } ${densityClass(count)}`}
                  >
                    {count > 0 && <CellAvatars players={players} />}
                  </button>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>

      {/* ── Mobile agenda ── */}
      <div className="sm:hidden p-4">
        <div className="flex gap-1 overflow-x-auto pb-3" style={{ scrollbarWidth: "none" }}>
          {SCHED_DAYS.map((d, i) => (
            <button
              key={d}
              type="button"
              onClick={() => setSelectedDay(i)}
              className={`flex-1 min-w-[3rem] py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors cursor-pointer ${
                selectedDay === i
                  ? "bg-[#1a2540] text-white"
                  : "text-[#687FA3] hover:text-white"
              }`}
            >
              {d}
            </button>
          ))}
        </div>

        {agendaHours.length === 0 ? (
          <p className="py-8 text-center text-xs text-[#687FA3]/60">
            No availability set for {SCHED_DAYS[selectedDay]}
            {min != null || max != null ? " in this rating range" : ""}.
          </p>
        ) : (
          <div className="divide-y divide-[#687FA3]/10">
            {agendaHours.map(({ hour, players }) => (
              <div key={hour} className="flex gap-3 py-3">
                <div className="w-14 shrink-0 text-[11px] font-mono text-[#687FA3] pt-0.5">
                  {fullSchedHourLabel(hour)}
                </div>
                <div className="flex-1 min-w-0 space-y-1.5">
                  {players.map((p) => (
                    <PlayerRow key={p.id} p={p} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
