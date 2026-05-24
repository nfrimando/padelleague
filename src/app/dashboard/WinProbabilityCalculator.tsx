"use client";

import {
  Fragment,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { GripHorizontal, MousePointer2, Pencil, X } from "lucide-react";
import { usePlayers } from "@/lib/usePlayers";
import { usePlayerSearch } from "@/lib/usePlayerSearch";
import { usePlayerMatchCounts } from "@/lib/usePlayerMatchCounts";
import { computeV3ExpectedWinProbability } from "@/lib/ratings/v3/calculate";
import { Player } from "@/lib/types";
import { usePlayerSchedules, ScheduleSlot } from "@/lib/usePlayerSchedules";
import EditScheduleModal from "./EditScheduleModal";

const FORMULA_NAME = "v3";

// ── Types ────────────────────────────────────────────────────────────────────
type SlotKey = "t1p1" | "t1p2" | "t2p1" | "t2p2";
type SlotState = { search: string; player: Player | null };
const EMPTY: SlotState = { search: "", player: null };

export type WinProbabilityCalculatorProps = {
  initialPlayerIds?: Partial<Record<SlotKey, string>>;
  currentPlayer?: Player | null;
  currentPlayerRating?: number | null;
  onSlotsChange?: (ids: Partial<Record<SlotKey, string>>) => void;
};

export type WinProbabilityCalculatorHandle = {
  addPlayer: (player: Player) => void;
};

// ── Search input ─────────────────────────────────────────────────────────────
function SlotSearch({
  value,
  suggestions,
  onChange,
  onSelect,
  onClear,
}: {
  value: string;
  suggestions: Player[];
  onChange: (v: string) => void;
  onSelect: (p: Player) => void;
  onClear: () => void;
}) {
  const [activeIdx, setActiveIdx] = useState(-1);
  const visible = suggestions.slice(0, 6);
  const showDrop = value.trim().length > 0 && visible.length > 0;

  const commit = (p: Player) => {
    onSelect(p);
    onClear();
    setActiveIdx(-1);
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2 bg-[#0d1520] border border-[#687FA3]/20 rounded-xl px-3 py-2.5 h-[52px]">
        <input
          type="text"
          value={value}
          onChange={(e) => {
            setActiveIdx(-1);
            onChange(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              if (showDrop)
                setActiveIdx((i) => (i < visible.length - 1 ? i + 1 : 0));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              if (showDrop)
                setActiveIdx((i) => (i > 0 ? i - 1 : visible.length - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (showDrop && activeIdx >= 0 && visible[activeIdx])
                commit(visible[activeIdx]);
            } else if (e.key === "Escape") {
              setActiveIdx(-1);
            }
          }}
          placeholder="Search player…"
          className="flex-1 bg-transparent text-sm text-slate-200 placeholder:text-[#687FA3]/50 focus:outline-none min-w-0"
        />
        {value.trim().length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 text-[#687FA3]/50 hover:text-slate-300 transition-colors"
          >
            <X size={11} />
          </button>
        )}
      </div>
      {showDrop && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-[#0d1520] border border-[#687FA3]/25 rounded-xl shadow-2xl overflow-hidden">
          {visible.map((p, i) => (
            <button
              key={p.player_id}
              type="button"
              onMouseEnter={() => setActiveIdx(i)}
              onClick={() => commit(p)}
              className={`w-full text-left px-3 py-2.5 transition-colors ${
                i === activeIdx ? "bg-[#1a2540]" : "hover:bg-[#1a2540]/60"
              }`}
            >
              <div className="text-sm font-medium text-slate-100 truncate">
                {p.name}
              </div>
              {p.nickname && (
                <div className="text-[11px] text-[#687FA3] truncate">
                  {p.nickname}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Selected player chip ──────────────────────────────────────────────────────
function PlayerChip({
  player,
  rating,
  isYou,
  isLocked,
  isDragging,
  team,
  onRemove,
  onDragStart,
}: {
  player: Player;
  rating: number | null;
  isYou?: boolean;
  isLocked?: boolean;
  isDragging?: boolean;
  team: 1 | 2;
  onRemove?: () => void;
  onDragStart?: () => void;
}) {
  const hasImg = !!(player.image_link && player.image_link !== "null");
  const src = hasImg ? player.image_link! : "/default-avatar.webp";
  const ringCls = team === 1 ? "ring-sky-500/40" : "ring-amber-500/40";

  return (
    <div
      draggable={!isLocked}
      onDragStart={!isLocked ? onDragStart : undefined}
      className={[
        "flex items-center gap-2.5 rounded-xl px-2.5 py-2 h-[52px] transition-opacity",
        isLocked
          ? "bg-sky-950/40 border border-sky-700/25 cursor-default"
          : "bg-[#0d1520] border border-[#687FA3]/20 cursor-grab active:cursor-grabbing",
        isDragging ? "opacity-40" : "",
      ].join(" ")}
    >
      <img
        src={src}
        alt={player.name}
        className={`h-8 w-8 rounded-full object-cover ring-1 shrink-0 ${ringCls}`}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-sm font-semibold text-slate-100 truncate leading-tight">
            {player.nickname ?? player.name}
          </span>
          {isYou && (
            <span className="shrink-0 text-[8px] font-black uppercase tracking-wider text-sky-400 bg-sky-400/10 border border-sky-400/20 px-1 py-px rounded-sm leading-tight">
              YOU
            </span>
          )}
        </div>
        <div className="text-[11px] font-mono text-[#687FA3] leading-tight mt-0.5">
          {rating != null ? rating.toFixed(2) : "—"}
        </div>
      </div>
      {!isLocked && (
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 text-[#687FA3]/40 hover:text-rose-400 transition-colors p-0.5 rounded"
        >
          <X size={11} />
        </button>
      )}
    </div>
  );
}

// ── Schedule intersection ─────────────────────────────────────────────────────
const SCHED_HOURS = [
  6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0,
];
const SCHED_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function schedHourLabel(h: number): string {
  if (h === 0) return "12a";
  if (h < 12) return `${h}a`;
  if (h === 12) return "12p";
  return `${h - 12}p`;
}

// Four distinct hues so 1/2/3/4 are unambiguous at a glance
const COUNT_COLORS = [
  "",
  "bg-slate-600/50 border-slate-500/40", // 1 — dim gray-blue
  "bg-amber-600/60 border-amber-500/50", // 2 — amber
  "bg-orange-500/75 border-orange-400/65", // 3 — orange
  "bg-emerald-500 border-emerald-400/80", // 4 — green
];

function fullSchedHourLabel(h: number): string {
  if (h === 0) return "midnight";
  if (h < 12) return `${h}am`;
  if (h === 12) return "noon";
  return `${h - 12}pm`;
}

function ScheduleIntersectionGrid({
  schedules,
  playerIdsWithNoSchedule,
  playerIdToName,
  totalPlayers,
  onEditSchedule,
}: {
  schedules: Map<string, ScheduleSlot[]>;
  playerIdsWithNoSchedule: string[];
  playerIdToName: Map<string, string>;
  totalPlayers: number;
  onEditSchedule?: () => void;
}) {
  const [hoverInfo, setHoverInfo] = useState<{
    label: string;
    available: string[];
    unavailable: string[];
  } | null>(null);

  const { countMap, slotPlayersMap } = useMemo(() => {
    const counts = new Map<string, number>();
    const players = new Map<string, string[]>();
    for (const [pid, slots] of schedules.entries()) {
      const name = playerIdToName.get(pid) ?? "?";
      for (const s of slots) {
        const key = `${s.day_of_week}-${s.start_hour}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
        if (!players.has(key)) players.set(key, []);
        players.get(key)!.push(name);
      }
    }
    return { countMap: counts, slotPlayersMap: players };
  }, [schedules, playerIdToName]);

  const missingNames = playerIdsWithNoSchedule
    .map((id) => playerIdToName.get(id) ?? "Unknown")
    .join(", ");

  return (
    <div className="pt-3 border-t border-[#687FA3]/10 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-black uppercase tracking-widest text-[#687FA3]">
            Schedule Alignment
          </span>
          {onEditSchedule && (
            <button
              type="button"
              onClick={onEditSchedule}
              className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-[#00C8DC] bg-[#00C8DC]/10 border border-[#00C8DC]/25 hover:bg-[#00C8DC]/20 hover:border-[#00C8DC]/50 px-2 py-0.5 rounded-full transition-colors cursor-pointer"
            >
              <Pencil size={8} />
              <span>Edit mine</span>
            </button>
          )}
        </div>
        {/* Legend */}
        <div className="flex items-center gap-1.5">
          {Array.from({ length: totalPlayers }, (_, i) => i + 1).map((n) => (
            <div key={n} className="flex items-center gap-0.5">
              <div
                className={`w-2.5 h-2.5 rounded-[2px] border ${COUNT_COLORS[n]}`}
              />
              <span className="text-[8px] text-[#687FA3]/60">{n}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Info row — fixed height; shows hover details, missing-schedule notice, or prompt */}
      <div className="h-4 px-1 flex items-center gap-1.5 overflow-hidden">
        {hoverInfo ? (
          <>
            <span className="text-[9px] text-[#687FA3]/60 shrink-0">
              {hoverInfo.label} ·
            </span>
            {hoverInfo.available.map((n) => (
              <span
                key={n}
                className="text-[9px] font-semibold text-emerald-400 shrink-0"
              >
                {n}
              </span>
            ))}
            {hoverInfo.unavailable.map((n) => (
              <span key={n} className="text-[9px] text-red-400/80 shrink-0">
                {n}
              </span>
            ))}
          </>
        ) : playerIdToName.size === 0 ? (
          <span className="text-[9px] text-[#687FA3]/40">
            Add players above to see schedule overlap.
          </span>
        ) : playerIdsWithNoSchedule.length > 0 ? (
          <span className="text-[9px] text-[#687FA3]/60">
            No schedule:{" "}
            <span className="font-semibold text-[#687FA3]/80">
              {missingNames}
            </span>
          </span>
        ) : null}
      </div>

      <div
        className="grid"
        style={{ gridTemplateColumns: "1.5rem repeat(7, 1fr)", gap: "2px" }}
      >
        {/* Day headers */}
        <div />
        {SCHED_DAYS.map((d) => (
          <div
            key={d}
            className="text-[8px] font-black uppercase tracking-widest text-center text-[#687FA3]/60 pb-0.5 select-none"
          >
            {d}
          </div>
        ))}

        {/* Hour rows */}
        {SCHED_HOURS.map((hour) => (
          <Fragment key={hour}>
            <div className="flex items-center justify-end pr-0.5 text-[8px] font-mono text-[#687FA3]/40 select-none">
              {schedHourLabel(hour)}
            </div>
            {SCHED_DAYS.map((_, d) => {
              const key = `${d}-${hour}`;
              const count = Math.min(countMap.get(key) ?? 0, totalPlayers);
              const names = slotPlayersMap.get(key);
              return (
                <div
                  key={key}
                  className={`h-4 rounded-[2px] border cursor-default transition-colors ${
                    count === 0
                      ? "bg-[#0d1520] border-transparent"
                      : (COUNT_COLORS[count] ?? COUNT_COLORS[4])
                  }`}
                  onMouseEnter={() => {
                    const available = names ?? [];
                    const allNames = Array.from(playerIdToName.values());
                    const unavailable = allNames.filter(
                      (n) => !available.includes(n),
                    );
                    setHoverInfo({
                      label: `${SCHED_DAYS[d]} ${fullSchedHourLabel(hour)}`,
                      available,
                      unavailable,
                    });
                  }}
                  onMouseLeave={() => setHoverInfo(null)}
                />
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
const SLOT_ORDER: SlotKey[] = ["t1p1", "t1p2", "t2p1", "t2p2"];

const WinProbabilityCalculator = forwardRef<
  WinProbabilityCalculatorHandle,
  WinProbabilityCalculatorProps
>(function WinProbabilityCalculator(
  { initialPlayerIds, currentPlayer, currentPlayerRating, onSlotsChange },
  ref,
) {
  const { players: allPlayers, loading: playersLoading } = usePlayers({
    orderByName: true,
    onlyActivePlayers: true,
  });

  const [editScheduleOpen, setEditScheduleOpen] = useState(false);
  const [dragSlot, setDragSlot] = useState<SlotKey | null>(null);

  const [slots, setSlots] = useState<Record<SlotKey, SlotState>>({
    t1p1: { ...EMPTY },
    t1p2: { ...EMPTY },
    t2p1: { ...EMPTY },
    t2p2: { ...EMPTY },
  });

  const hasInitialized = useRef(false);

  useEffect(() => {
    if (hasInitialized.current) return;
    if (playersLoading) return;
    hasInitialized.current = true;
    if (!initialPlayerIds) return;

    const patch: Partial<Record<SlotKey, SlotState>> = {};
    for (const key of SLOT_ORDER) {
      const id = initialPlayerIds[key];
      if (!id) continue;
      const found =
        allPlayers.find((p) => String(p.player_id) === id) ??
        (currentPlayer && String(currentPlayer.player_id) === id
          ? currentPlayer
          : null);
      if (found) patch[key] = { player: found, search: "" };
    }
    if (Object.keys(patch).length > 0)
      setSlots((prev) => ({ ...prev, ...patch }));
  }, [playersLoading, allPlayers, initialPlayerIds, currentPlayer]);

  useEffect(() => {
    if (!hasInitialized.current) return;
    if (!onSlotsChange) return;
    const ids: Partial<Record<SlotKey, string>> = {};
    for (const key of SLOT_ORDER) {
      const p = slots[key].player;
      if (p) ids[key] = String(p.player_id);
    }
    onSlotsChange(ids);
  }, [slots, onSlotsChange]);

  const updateSlot = (key: SlotKey, patch: Partial<SlotState>) =>
    setSlots((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const clearSlot = (key: SlotKey) => {
    setSlots((prev) => ({ ...prev, [key]: { ...EMPTY } }));
  };

  useImperativeHandle(ref, () => ({
    addPlayer: (player: Player) => {
      const nextEmpty = SLOT_ORDER.find((k) => !slots[k].player);
      if (nextEmpty) updateSlot(nextEmpty, { player, search: "" });
    },
  }));

  const selectedIds = useMemo(
    () =>
      new Set(
        Object.values(slots)
          .map((s) => (s.player ? String(s.player.player_id) : ""))
          .filter(Boolean),
      ),
    [slots],
  );

  const makeExcluded = (key: SlotKey): Set<string> => {
    const own = slots[key].player
      ? String(slots[key].player!.player_id)
      : null;
    return new Set([...selectedIds].filter((id) => id !== own));
  };

  // One hook per slot (hooks must be unconditional)
  const t1p1Sugg = usePlayerSearch(allPlayers, slots.t1p1.search);
  const t1p2Sugg = usePlayerSearch(allPlayers, slots.t1p2.search);
  const t2p1Sugg = usePlayerSearch(allPlayers, slots.t2p1.search);
  const t2p2Sugg = usePlayerSearch(allPlayers, slots.t2p2.search);

  const filterSugg = (sugg: Player[], key: SlotKey) =>
    sugg.filter((p) => !makeExcluded(key).has(String(p.player_id)));

  const suggMap: Record<SlotKey, Player[]> = {
    t1p1: filterSugg(t1p1Sugg, "t1p1"),
    t1p2: filterSugg(t1p2Sugg, "t1p2"),
    t2p1: filterSugg(t2p1Sugg, "t2p1"),
    t2p2: filterSugg(t2p2Sugg, "t2p2"),
  };

  // Fetch ratings for selected players
  // Depend only on the player IDs, not the full slots object (which includes
  // search text), so typing in a search box doesn't re-trigger rating fetches.
  const selectedPlayerIds = useMemo(
    () =>
      Object.values(slots)
        .filter((s) => s.player)
        .map((s) => String(s.player!.player_id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      slots.t1p1.player?.player_id,
      slots.t1p2.player?.player_id,
      slots.t2p1.player?.player_id,
      slots.t2p2.player?.player_id,
    ],
  );

  const { latestRatings, loading: ratingsLoading } =
    usePlayerMatchCounts(selectedPlayerIds);

  const getRating = (key: SlotKey): number | null => {
    const p = slots[key].player;
    if (!p) return null;
    if (
      currentPlayer &&
      String(p.player_id) === String(currentPlayer.player_id) &&
      currentPlayerRating != null
    )
      return currentPlayerRating;
    return latestRatings[String(p.player_id)] ?? null;
  };

  const r = {
    t1p1: getRating("t1p1"),
    t1p2: getRating("t1p2"),
    t2p1: getRating("t2p1"),
    t2p2: getRating("t2p2"),
  };

  const allSelected = !!(
    slots.t1p1.player &&
    slots.t1p2.player &&
    slots.t2p1.player &&
    slots.t2p2.player
  );

  const schedulePlayerIds = selectedPlayerIds;
  const { schedules, playerIdsWithNoSchedule } =
    usePlayerSchedules(schedulePlayerIds);

  const playerIdToName = useMemo(() => {
    const m = new Map<string, string>();
    for (const slot of Object.values(slots)) {
      if (slot.player) {
        m.set(
          String(slot.player.player_id),
          slot.player.nickname ?? slot.player.name,
        );
      }
    }
    return m;
  }, [slots]);
  const allRatings =
    r.t1p1 != null && r.t1p2 != null && r.t2p1 != null && r.t2p2 != null;
  const loadingResult = allSelected && ratingsLoading;
  const showResult = allSelected && allRatings && !loadingResult;

  const [ewp1, ewp2] = showResult
    ? computeV3ExpectedWinProbability(
        (r.t1p1! + r.t1p2!) / 2,
        (r.t2p1! + r.t2p2!) / 2,
      )
    : [0.5, 0.5];

  const handleDrop = (targetKey: SlotKey) => {
    if (!dragSlot || dragSlot === targetKey) return;
    setSlots((prev) => ({
      ...prev,
      [dragSlot]: prev[targetKey],
      [targetKey]: prev[dragSlot],
    }));
    setDragSlot(null);
  };

  // ── Slot renderer ────────────────────────────────────────────────────────────
  const renderSlot = (key: SlotKey, team: 1 | 2) => {
    const slot = slots[key];
    const isYou = !!(
      currentPlayer &&
      slot.player &&
      String(slot.player.player_id) === String(currentPlayer.player_id)
    );
    const isBeingDragged = dragSlot === key;
    const isDropTarget = dragSlot !== null && dragSlot !== key;

    const dropProps = {
      onDragOver: (e: React.DragEvent) => {
        if (dragSlot && dragSlot !== key) e.preventDefault();
      },
      onDrop: () => handleDrop(key),
      onDragLeave: () => {},
    };

    if (slot.player) {
      return (
        <div
          {...dropProps}
          className={[
            "rounded-xl transition-colors",
            isDropTarget ? "ring-1 ring-[#00C8DC]/40 bg-[#00C8DC]/5" : "",
          ].join(" ")}
        >
          <PlayerChip
            player={slot.player}
            rating={getRating(key)}
            isYou={isYou}
            isLocked={false}
            isDragging={isBeingDragged}
            team={team}
            onRemove={() => clearSlot(key)}
            onDragStart={() => setDragSlot(key)}
          />
        </div>
      );
    }

    if (playersLoading) {
      return (
        <div className="h-[52px] bg-[#0d1520] rounded-xl animate-pulse border border-[#687FA3]/10" />
      );
    }

    return (
      <div
        {...dropProps}
        className={[
          "rounded-xl transition-colors",
          isDropTarget ? "ring-1 ring-[#00C8DC]/40 bg-[#00C8DC]/5" : "",
        ].join(" ")}
      >
        <SlotSearch
          value={slot.search}
          suggestions={suggMap[key]}
          onChange={(v) => updateSlot(key, { search: v })}
          onSelect={(p) => updateSlot(key, { player: p, search: "" })}
          onClear={() => updateSlot(key, { search: "" })}
        />
      </div>
    );
  };

  return (
    <>
      {currentPlayer && (
        <EditScheduleModal
          playerId={Number(currentPlayer.player_id)}
          isOpen={editScheduleOpen}
          onClose={() => setEditScheduleOpen(false)}
        />
      )}
      <section className="bg-[#162032] border border-[#687FA3]/10 sm:rounded-3xl">
        {/* Header */}
        <div className="px-6 pt-5 pb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xs font-black uppercase tracking-widest text-[#687FA3]">
              Win Probability and Schedule Alignment
            </h2>
            <p className="mt-0.5 text-[10px] text-slate-600">
              Find the best time to play with / against peers of similar
              caliber.
            </p>
          </div>
          <div className="shrink-0 flex flex-col items-end gap-1.5">
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-[#00C8DC]/80">
                <MousePointer2 size={9} />
                <span>Click peer to add</span>
              </div>
              <div className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-[#00C8DC]/55">
                <GripHorizontal size={9} />
                <span>Drag to swap</span>
              </div>
            </div>
            <span className="text-[9px] font-mono text-[#687FA3]/40 bg-[#687FA3]/5 border border-[#687FA3]/10 px-2 py-1 rounded-full">
              {FORMULA_NAME}
            </span>
          </div>
        </div>

        <div className="px-4 pb-6 space-y-4">
          {/* Team columns */}
          <div className="flex flex-col sm:grid sm:grid-cols-[1fr_28px_1fr] sm:items-center gap-3 sm:gap-2">
            {/* Team 1 */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 px-0.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0" />
                <span className="text-[9px] font-black uppercase tracking-widest text-sky-500">
                  Team 1
                </span>
              </div>
              {renderSlot("t1p1", 1)}
              {renderSlot("t1p2", 1)}
            </div>

            {/* VS — horizontal on mobile, vertical on sm+ */}
            <div className="flex sm:hidden items-center gap-3">
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#687FA3]/20 to-transparent" />
              <span className="text-[10px] font-black text-[#687FA3]/50 tracking-widest">
                VS
              </span>
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#687FA3]/20 to-transparent" />
            </div>
            <div className="hidden sm:flex flex-col items-center justify-center gap-1 self-stretch pt-5">
              <div className="flex-1 w-px bg-gradient-to-b from-transparent via-[#687FA3]/20 to-transparent" />
              <span className="text-[10px] font-black text-[#687FA3]/50 tracking-widest">
                VS
              </span>
              <div className="flex-1 w-px bg-gradient-to-b from-transparent via-[#687FA3]/20 to-transparent" />
            </div>

            {/* Team 2 */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 px-0.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                <span className="text-[9px] font-black uppercase tracking-widest text-amber-500">
                  Team 2
                </span>
              </div>
              {renderSlot("t2p1", 2)}
              {renderSlot("t2p2", 2)}
            </div>
          </div>

          {/* Result */}
          <div className="space-y-2 pt-1">
            {/* Probability bar */}
            <div className="relative h-11 rounded-xl overflow-hidden bg-[#0d1520]">
              {loadingResult ? (
                <div className="absolute inset-0 animate-pulse bg-[#1a2540]" />
              ) : showResult ? (
                <>
                  {/* Team 1 fill */}
                  <div
                    className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-sky-700 to-sky-400 transition-all duration-700 ease-out"
                    style={{ width: `${ewp1 * 100}%` }}
                  />
                  {/* Team 2 fill */}
                  <div
                    className="absolute right-0 top-0 bottom-0 bg-gradient-to-l from-amber-700 to-amber-400 transition-all duration-700 ease-out"
                    style={{ width: `${ewp2 * 100}%` }}
                  />
                  {/* Thin divider at meeting point */}
                  <div
                    className="absolute top-0 bottom-0 w-px bg-[#162032]/60 transition-all duration-700 ease-out"
                    style={{ left: `${ewp1 * 100}%` }}
                  />
                  {/* Labels */}
                  <div className="absolute inset-0 flex items-center justify-between px-4">
                    <span className="text-sm font-black tabular-nums text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.6)]">
                      {(ewp1 * 100).toFixed(1)}%
                    </span>
                    <span className="text-sm font-black tabular-nums text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.6)]">
                      {(ewp2 * 100).toFixed(1)}%
                    </span>
                  </div>
                </>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[11px] text-[#687FA3]/40 font-medium">
                    {allSelected
                      ? "Fetching ratings…"
                      : "Select all 4 players to calculate"}
                  </span>
                </div>
              )}
            </div>

            {/* Favored label row — fixed height prevents layout shift */}
            <div className="h-5 flex items-center justify-between px-1">
              {showResult && (
                <>
                  <div className="flex items-center gap-1.5">
                    {ewp1 > ewp2 && (
                      <span className="text-[8px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-1.5 py-0.5 rounded-sm">
                        Favored
                      </span>
                    )}
                    {ewp1 <= ewp2 && (
                      <span className="text-[10px] text-sky-500/60 font-semibold tabular-nums">
                        {(ewp1 * 100).toFixed(1)}%
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {ewp2 > ewp1 && (
                      <span className="text-[8px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-1.5 py-0.5 rounded-sm">
                        Favored
                      </span>
                    )}
                    {ewp2 <= ewp1 && (
                      <span className="text-[10px] text-amber-500/60 font-semibold tabular-nums">
                        {(ewp2 * 100).toFixed(1)}%
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Schedule alignment — always visible, updates incrementally as players are added */}
            <ScheduleIntersectionGrid
              schedules={schedules}
              playerIdsWithNoSchedule={playerIdsWithNoSchedule}
              playerIdToName={playerIdToName}
              totalPlayers={selectedPlayerIds.length}
              onEditSchedule={
                currentPlayer &&
                Object.values(slots).some(
                  (s) =>
                    s.player &&
                    String(s.player.player_id) ===
                      String(currentPlayer.player_id),
                )
                  ? () => setEditScheduleOpen(true)
                  : undefined
              }
            />
          </div>
        </div>
      </section>
    </>
  );
});

export default WinProbabilityCalculator;
