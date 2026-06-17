"use client";

import { useRef, useEffect, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import Link from "next/link";
import type { ChartPoint, DashboardStats } from "@/lib/useDashboardStats";
import { describeRatingEvent } from "@/lib/ratingEventDisplay";
import type { Player } from "@/lib/types";

type Props = {
  chartData: ChartPoint[];
  currentRating: number | null;
  peakRating: number | null;
  ratingLast5Delta: number | null;
  currentStreak: DashboardStats["currentStreak"];
  playerId: string;
  loading: boolean;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + (dateStr.length <= 10 ? "T00:00:00" : ""));
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

// ── Player avatar ─────────────────────────────────────────────────────────────

function PlayerAvatar({ player }: { player: Player | null | undefined }) {
  const initial = player
    ? ((player.nickname || player.name || "?")[0] || "?").toUpperCase()
    : "?";
  return player?.image_link ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={player.image_link}
      alt={player.name || ""}
      className="w-6 h-6 rounded-full border-2 border-[#1a2540] object-cover"
    />
  ) : (
    <div className="w-6 h-6 rounded-full bg-[#687FA3]/20 border-2 border-[#1a2540] flex items-center justify-center">
      <span className="text-[8px] font-black text-[#687FA3]">{initial}</span>
    </div>
  );
}

function RatingFlow({
  before,
  after,
  delta,
  size = "sm",
}: {
  before: number | null;
  after: number;
  delta: number | null;
  size?: "sm" | "xs";
}) {
  const deltaText = size === "sm" ? "text-[10px]" : "";
  return (
    <div
      className={`flex items-center gap-1.5 font-mono ${size === "xs" ? "text-[10px]" : ""}`}
    >
      {before !== null && (
        <>
          <span className="text-white/40">{before.toFixed(2)}</span>
          <span className="text-[#687FA3]">→</span>
        </>
      )}
      <span className="font-bold text-white">{after.toFixed(2)}</span>
      {delta !== null && (
        <span
          className={`font-black ${deltaText} ${delta > 0 ? "text-emerald-400" : delta < 0 ? "text-red-400" : "text-[#687FA3]"}`}
        >
          ({delta > 0 ? "+" : ""}
          {delta.toFixed(2)})
        </span>
      )}
    </div>
  );
}

// ── Hover tooltip (compact) ───────────────────────────────────────────────────

function HoverTooltip({
  point,
  playerId,
}: {
  point: ChartPoint;
  playerId: string;
}) {
  const desc = describeRatingEvent(point.event, point.match, playerId);

  if (desc.kind === "initial") {
    return (
      <div className="bg-[#0E1523] border border-[#687FA3]/30 rounded-xl p-3 shadow-xl text-xs min-w-[160px]">
        <p className="text-[#687FA3] text-[9px] uppercase tracking-wider mb-1.5">
          Starting rating
        </p>
        <p className="font-mono font-bold text-white text-sm">
          {desc.after.toFixed(2)}
        </p>
      </div>
    );
  }

  if (desc.kind === "other") {
    return (
      <div className="bg-[#0E1523] border border-[#687FA3]/30 rounded-xl p-3 shadow-xl text-xs min-w-[180px]">
        <div className="flex items-center justify-between gap-3 mb-2">
          <span className="text-[#687FA3] text-[10px] uppercase tracking-wider">
            {desc.label}
          </span>
          {desc.date && (
            <span className="text-[#687FA3] text-[10px]">
              {formatDate(desc.date)}
            </span>
          )}
        </div>
        <RatingFlow before={null} after={desc.after} delta={desc.delta} />
      </div>
    );
  }

  const opponents = desc.opponents;
  return (
    <div className="bg-[#0E1523] border border-[#687FA3]/30 rounded-xl p-3 shadow-xl text-xs min-w-[200px] max-w-[240px]">
      <div className="flex items-center justify-between gap-3 mb-2.5">
        <span className="text-[#687FA3]">
          {formatDate(desc.date)}
          {desc.matchType && (
            <span className="ml-1 text-[9px] uppercase">· {desc.matchType}</span>
          )}
        </span>
        {desc.result && (
          <span
            className={`text-[10px] font-black uppercase tracking-widest ${desc.result === "win" ? "text-emerald-400" : "text-red-400"}`}
          >
            {desc.result === "win" ? "Win" : "Loss"}
          </span>
        )}
      </div>
      {desc.partner && (
        <div className="mb-1.5">
          <span className="text-[#687FA3] text-[9px] uppercase tracking-wider">
            w/{" "}
          </span>
          <Link
            href={`/players/${encodeURIComponent(String(desc.partner.player_id))}`}
            className="font-bold text-white/90 hover:text-[#00C8DC] transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            {desc.partner.nickname || desc.partner.name}
          </Link>
        </div>
      )}
      {opponents.length > 0 && (
        <div className="mb-2">
          <span className="text-[#687FA3] text-[9px] uppercase tracking-wider">
            vs{" "}
          </span>
          {opponents.map((p, i) => (
            <span key={String(p.player_id)}>
              <Link
                href={`/players/${encodeURIComponent(String(p.player_id))}`}
                className="font-bold text-white/90 hover:text-[#00C8DC] transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                {p.nickname || p.name}
              </Link>
              {i < opponents.length - 1 && (
                <span className="text-[#687FA3] mx-0.5">&amp;</span>
              )}
            </span>
          ))}
        </div>
      )}
      {desc.score && <p className="font-mono text-white/70 mb-2">{desc.score}</p>}
      <div className="border-t border-[#687FA3]/20 pt-2">
        <RatingFlow before={desc.before} after={desc.after} delta={desc.delta} />
      </div>
    </div>
  );
}

// ── Scroll match card ─────────────────────────────────────────────────────────

function YoutubeIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1C24 15.9 24 12 24 12s0-3.9-.5-5.8zM9.75 15.5V8.5l6.5 3.5-6.5 3.5z" />
    </svg>
  );
}

function MatchScrollCard({
  point,
  playerId,
  isLatest,
}: {
  point: ChartPoint;
  playerId: string;
  isLatest: boolean;
}) {
  const desc = describeRatingEvent(point.event, point.match, playerId);

  // Non-match events (initial rating, future recalibrations/adjustments).
  if (desc.kind !== "match") {
    const label = desc.kind === "initial" ? "Starting rating" : desc.label;
    const delta = desc.kind === "initial" ? null : desc.delta;
    return (
      <div
        className={`shrink-0 w-52 rounded-2xl p-4 flex flex-col gap-2.5 border ${
          isLatest
            ? "bg-[#1a2540] border-[#00C8DC]/40"
            : "bg-[#1a2540] border-[#687FA3]/10"
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-[#687FA3] text-[10px] uppercase tracking-wider">
            {label}
          </span>
          {isLatest && (
            <span className="text-[9px] font-black uppercase tracking-widest text-[#00C8DC]/70">
              Latest
            </span>
          )}
        </div>
        {desc.date && (
          <p className="text-[#687FA3] text-[10px]">{formatDate(desc.date)}</p>
        )}
        <div className="border-t border-[#687FA3]/10 pt-2 mt-auto">
          <RatingFlow before={null} after={desc.after} delta={delta} size="xs" />
        </div>
      </div>
    );
  }

  const youtube = point.match?.youtube_link ?? null;
  const opponents = desc.opponents;

  return (
    <div
      className={`shrink-0 w-52 rounded-2xl p-4 flex flex-col gap-2.5 border transition-colors ${
        isLatest
          ? "bg-[#1a2540] border-[#00C8DC]/40"
          : "bg-[#1a2540] border-[#687FA3]/10"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[#687FA3] text-[10px]">
          <span>{formatDate(desc.date)}</span>
          {desc.matchType && (
            <span className="uppercase text-[#687FA3]/60">· {desc.matchType}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {isLatest && (
            <span className="text-[9px] font-black uppercase tracking-widest text-[#00C8DC]/70">
              Latest
            </span>
          )}
          {desc.result && (
            <span
              className={`text-[10px] font-black uppercase tracking-widest ${desc.result === "win" ? "text-emerald-400" : "text-red-400"}`}
            >
              {desc.result === "win" ? "W" : "L"}
            </span>
          )}
          {youtube && (
            <a
              href={youtube}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              aria-label="Watch on YouTube"
              className="text-[#687FA3]/50 hover:text-red-400 transition-colors"
            >
              <YoutubeIcon size={12} />
            </a>
          )}
        </div>
      </div>

      {/* Teams: avatars */}
      <div className="flex items-center gap-2">
        <div className="flex -space-x-1.5">
          <div className="relative z-10">
            <PlayerAvatar player={desc.me} />
          </div>
          {desc.partner && (
            <div className="relative z-0">
              <PlayerAvatar player={desc.partner} />
            </div>
          )}
        </div>
        <span className="text-[#687FA3] text-[9px] shrink-0">vs</span>
        <div className="flex -space-x-1.5">
          {opponents.map((p, i) => (
            <div key={String(p.player_id)} className={i === 0 ? "relative z-10" : "relative z-0"}>
              <PlayerAvatar player={p} />
            </div>
          ))}
        </div>
      </div>

      {/* Player names */}
      <div className="space-y-0.5 min-w-0">
        {desc.partner && (
          <div className="flex items-center gap-1 text-[10px] min-w-0">
            <span className="text-[#687FA3] shrink-0">w/</span>
            <Link
              href={`/players/${encodeURIComponent(String(desc.partner.player_id))}`}
              className="text-white/80 font-bold hover:text-[#00C8DC] transition-colors truncate"
            >
              {desc.partner.nickname || desc.partner.name}
            </Link>
          </div>
        )}
        <div className="flex items-center gap-1 text-[10px] min-w-0">
          <span className="text-[#687FA3] shrink-0">vs</span>
          <div className="truncate text-white/60">
            {opponents.map((p) => p.nickname || p.name.split(" ")[0]).join(" & ")}
          </div>
        </div>
      </div>

      {/* Score */}
      {desc.score && (
        <p className="font-mono text-[11px] text-white/60">{desc.score}</p>
      )}

      {/* Rating */}
      <div className="border-t border-[#687FA3]/10 pt-2 mt-auto">
        <RatingFlow
          before={desc.before}
          after={desc.after}
          delta={desc.delta}
          size="xs"
        />
      </div>
    </div>
  );
}

// ── Stat chip ─────────────────────────────────────────────────────────────────

function StatChip({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: "cyan" | "green" | "red" | "default";
}) {
  const valueColor =
    color === "cyan"
      ? "text-[#00C8DC]"
      : color === "green"
        ? "text-emerald-400"
        : color === "red"
          ? "text-red-400"
          : "text-white";

  return (
    <div className="bg-[#1a2540] border border-[#687FA3]/10 rounded-xl px-4 py-3">
      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#687FA3] mb-1">
        {label}
      </p>
      <p className={`text-xl font-black tracking-tighter ${valueColor}`}>
        {value}
      </p>
    </div>
  );
}

// ── Dot renderer ──────────────────────────────────────────────────────────────

function makeDotRenderer(lastIndex: number) {
  return function DotRenderer(props: unknown) {
    const { cx, cy, payload, index } = props as {
      cx: number;
      cy: number;
      payload: ChartPoint;
      index: number;
    };
    const isLast = index === lastIndex;
    const color =
      payload.delta === null
        ? "#00C8DC"
        : payload.delta > 0
          ? "#10b981"
          : payload.delta < 0
            ? "#ef4444"
            : "#687FA3";

    if (isLast) {
      return (
        <g key="dot-last">
          <circle cx={cx} cy={cy} r={11} fill={color} opacity={0.15} />
          <circle
            cx={cx}
            cy={cy}
            r={7}
            fill={color}
            stroke="#0E1523"
            strokeWidth={2}
          />
        </g>
      );
    }
    return (
      <circle
        key={`dot-${payload.index}`}
        cx={cx}
        cy={cy}
        r={3.5}
        fill={color}
        stroke="#0E1523"
        strokeWidth={1.5}
      />
    );
  };
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ProgressionSection({
  chartData,
  currentRating,
  peakRating,
  ratingLast5Delta,
  currentStreak,
  playerId,
  loading,
}: Props) {
  const hasData = chartData.length >= 2;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Auto-scroll to latest (rightmost) card on load
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollLeft = el.scrollWidth;
    });
  }, [chartData.length]);

  // Tight Y-axis domain proportional to the data range
  const yDomain: [number, number] = (() => {
    if (!hasData) return [0, 10];
    const ratings = chartData.map((p) => p.rating);
    const minR = Math.min(...ratings);
    const maxR = Math.max(...ratings);
    const range = Math.max(maxR - minR, 0.5);
    const pad = range * 0.25;
    return [minR - pad, maxR + pad];
  })();

  const useLargeScale = yDomain[1] > 100;

  const dotRenderer = hasData ? makeDotRenderer(chartData.length - 1) : null;

  const streakLabel = currentStreak
    ? `${currentStreak.count}${currentStreak.type}`
    : "—";
  const streakColor =
    currentStreak?.type === "W"
      ? "green"
      : currentStreak?.type === "L"
        ? "red"
        : "default";

  const deltaLabel =
    ratingLast5Delta !== null
      ? `${ratingLast5Delta > 0 ? "+" : ""}${ratingLast5Delta.toFixed(2)}`
      : "—";
  const deltaColor =
    ratingLast5Delta === null
      ? "default"
      : ratingLast5Delta > 0
        ? "green"
        : ratingLast5Delta < 0
          ? "red"
          : "default";

  return (
    <div className="bg-[#162032] border border-[#687FA3]/10 sm:rounded-3xl p-6 space-y-5">
      <div className="border-b border-[#687FA3]/10 pb-4">
        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#687FA3]">
          Rating Progression
        </span>
      </div>

      {/* Stat chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatChip
          label="Current"
          value={
            loading
              ? "…"
              : currentRating !== null
                ? currentRating.toFixed(2)
                : "—"
          }
          color="cyan"
        />
        <StatChip
          label="Peak"
          value={
            loading ? "…" : peakRating !== null ? peakRating.toFixed(2) : "—"
          }
        />
        <StatChip
          label="Δ Last 5"
          value={loading ? "…" : deltaLabel}
          color={loading ? "default" : deltaColor}
        />
        <StatChip
          label="Streak"
          value={loading ? "…" : streakLabel}
          color={loading ? "default" : streakColor}
        />
      </div>

      {/* Chart */}
      <div className="h-60 sm:h-72 w-full">
        {loading ? (
          <div className="h-full bg-[#1a2540] rounded-xl animate-pulse" />
        ) : !hasData ? (
          <div className="h-full flex items-center justify-center text-[#687FA3] text-sm">
            Not enough match data to show progression.
          </div>
        ) : !mounted ? (
          <div className="h-full bg-[#1a2540] rounded-xl animate-pulse" />
        ) : (
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 1, height: 1 }}>
            <LineChart
              data={chartData}
              margin={{ top: 12, right: 16, bottom: 0, left: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#687FA3"
                strokeOpacity={0.08}
                vertical={false}
              />
              <XAxis
                dataKey="index"
                tickFormatter={(idx: number) => {
                  const point = chartData[idx - 1];
                  if (!point) return "";
                  return formatDate(
                    point.match?.date_local ?? point.event.occurredAt,
                  );
                }}
                tick={{ fill: "#687FA3", fontSize: 10 }}
                tickLine={false}
                axisLine={{ stroke: "#687FA3", strokeOpacity: 0.1 }}
                interval={Math.max(0, Math.ceil(chartData.length / 5) - 1)}
              />
              <YAxis
                domain={yDomain}
                tick={{ fill: "#687FA3", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                width={52}
                tickFormatter={(v: number) =>
                  useLargeScale ? v.toFixed(0) : v.toFixed(1)
                }
              />
              <Tooltip
                content={(props) => {
                  if (!props.active || !props.payload?.length) return null;
                  const point = (
                    props.payload[0] as { payload: ChartPoint }
                  ).payload;
                  return <HoverTooltip point={point} playerId={playerId} />;
                }}
                cursor={{
                  stroke: "#687FA3",
                  strokeWidth: 1,
                  strokeDasharray: "4 4",
                }}
              />
              <Line
                type="monotone"
                dataKey="rating"
                stroke="#00C8DC"
                strokeWidth={2}
                dot={dotRenderer!}
                activeDot={{
                  r: 7,
                  fill: "#00C8DC",
                  stroke: "#0E1523",
                  strokeWidth: 2,
                }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Horizontal scrollable match cards */}
      {!loading && chartData.length > 0 && (
        <div className="border-t border-[#687FA3]/10 pt-5">
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#687FA3] mb-3">
            Match History
          </p>
          <div
            ref={scrollRef}
            className="flex gap-3 overflow-x-auto pb-2"
            style={{ scrollbarWidth: "none" }}
          >
            {chartData.map((point, i) => (
              <MatchScrollCard
                key={point.event.id}
                point={point}
                playerId={playerId}
                isLatest={i === chartData.length - 1}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
