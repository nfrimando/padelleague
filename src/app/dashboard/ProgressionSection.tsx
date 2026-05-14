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
import type { MatchWithTeams, Player, TeamWithPlayers } from "@/lib/types";

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

function findMyTeam(match: MatchWithTeams, pid: string): TeamWithPlayers | null {
  return (
    match.teams.find(
      (t) =>
        String(t.player_1?.player_id) === pid ||
        String(t.player_2?.player_id) === pid,
    ) ?? null
  );
}

function getScore(match: MatchWithTeams): string {
  if (!match.sets?.length) return "";
  return [...match.sets]
    .sort((a, b) => a.set_number - b.set_number)
    .map((s) => `${s.team_1_games}-${s.team_2_games}`)
    .join("  ");
}

function didWin(match: MatchWithTeams, pid: string): boolean | null {
  if (match.status !== "completed" || match.winner_team === null) return null;
  const myTeam = findMyTeam(match, pid);
  if (!myTeam) return null;
  return match.winner_team === myTeam.team_number;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
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

// ── Hover tooltip (compact) ───────────────────────────────────────────────────

function HoverTooltip({
  point,
  playerId,
}: {
  point: ChartPoint;
  playerId: string;
}) {
  const { match, rating, delta } = point;
  const myTeam = findMyTeam(match, playerId);
  const oppTeam = match.teams.find((t) => t.team_number !== myTeam?.team_number);
  const partner =
    myTeam &&
    (String(myTeam.player_1?.player_id) === playerId
      ? myTeam.player_2
      : myTeam.player_1);
  const opponents = [oppTeam?.player_1, oppTeam?.player_2].filter(Boolean);
  const score = getScore(match);
  const won = didWin(match, playerId);
  const ratingBefore = delta !== null ? rating - delta : null;

  return (
    <div className="bg-[#0E1523] border border-[#687FA3]/30 rounded-xl p-3 shadow-xl text-xs min-w-[200px] max-w-[240px]">
      <div className="flex items-center justify-between gap-3 mb-2.5">
        <span className="text-[#687FA3]">
          {formatDate(match.date_local)}
          {match.type && (
            <span className="ml-1 text-[9px] uppercase">· {match.type}</span>
          )}
        </span>
        {won !== null && (
          <span
            className={`text-[10px] font-black uppercase tracking-widest ${won ? "text-emerald-400" : "text-red-400"}`}
          >
            {won ? "Win" : "Loss"}
          </span>
        )}
      </div>
      {partner && (
        <div className="mb-1.5">
          <span className="text-[#687FA3] text-[9px] uppercase tracking-wider">
            w/{" "}
          </span>
          <Link
            href={`/players/${encodeURIComponent(String(partner.player_id))}`}
            className="font-bold text-white/90 hover:text-[#00C8DC] transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            {partner.nickname || partner.name}
          </Link>
        </div>
      )}
      <div className="mb-2">
        <span className="text-[#687FA3] text-[9px] uppercase tracking-wider">
          vs{" "}
        </span>
        {opponents.map((p, i) => (
          <span key={String(p!.player_id)}>
            <Link
              href={`/players/${encodeURIComponent(String(p!.player_id))}`}
              className="font-bold text-white/90 hover:text-[#00C8DC] transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              {p!.nickname || p!.name}
            </Link>
            {i < opponents.length - 1 && (
              <span className="text-[#687FA3] mx-0.5">&amp;</span>
            )}
          </span>
        ))}
      </div>
      {score && <p className="font-mono text-white/70 mb-2">{score}</p>}
      <div className="border-t border-[#687FA3]/20 pt-2 flex items-center gap-1.5 font-mono">
        {ratingBefore !== null && (
          <>
            <span className="text-white/40">{ratingBefore.toFixed(2)}</span>
            <span className="text-[#687FA3]">→</span>
          </>
        )}
        <span className="font-bold text-white">{rating.toFixed(2)}</span>
        {delta !== null && (
          <span
            className={`text-[10px] font-black ${delta > 0 ? "text-emerald-400" : delta < 0 ? "text-red-400" : "text-[#687FA3]"}`}
          >
            ({delta > 0 ? "+" : ""}
            {delta.toFixed(2)})
          </span>
        )}
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
  const { match, rating, delta } = point;
  const myTeam = findMyTeam(match, playerId);
  const oppTeam = match.teams.find((t) => t.team_number !== myTeam?.team_number);
  const myPlayer =
    myTeam &&
    (String(myTeam.player_1?.player_id) === playerId
      ? myTeam.player_1
      : myTeam.player_2);
  const partner =
    myTeam &&
    (String(myTeam.player_1?.player_id) === playerId
      ? myTeam.player_2
      : myTeam.player_1);
  const opponents = [oppTeam?.player_1, oppTeam?.player_2].filter(Boolean);
  const score = getScore(match);
  const won = didWin(match, playerId);
  const ratingBefore = delta !== null ? rating - delta : null;

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
          <span>{formatDate(match.date_local)}</span>
          {match.type && (
            <span className="uppercase text-[#687FA3]/60">· {match.type}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {isLatest && (
            <span className="text-[9px] font-black uppercase tracking-widest text-[#00C8DC]/70">
              Latest
            </span>
          )}
          {won !== null && (
            <span
              className={`text-[10px] font-black uppercase tracking-widest ${won ? "text-emerald-400" : "text-red-400"}`}
            >
              {won ? "W" : "L"}
            </span>
          )}
          {match.youtube_link && (
            <a
              href={match.youtube_link}
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
            <PlayerAvatar player={myPlayer || null} />
          </div>
          {partner && (
            <div className="relative z-0">
              <PlayerAvatar player={partner} />
            </div>
          )}
        </div>
        <span className="text-[#687FA3] text-[9px] shrink-0">vs</span>
        <div className="flex -space-x-1.5">
          {oppTeam?.player_1 && (
            <div className="relative z-10">
              <PlayerAvatar player={oppTeam.player_1} />
            </div>
          )}
          {oppTeam?.player_2 && (
            <div className="relative z-0">
              <PlayerAvatar player={oppTeam.player_2} />
            </div>
          )}
        </div>
      </div>

      {/* Player names */}
      <div className="space-y-0.5 min-w-0">
        {partner && (
          <div className="flex items-center gap-1 text-[10px] min-w-0">
            <span className="text-[#687FA3] shrink-0">w/</span>
            <Link
              href={`/players/${encodeURIComponent(String(partner.player_id))}`}
              className="text-white/80 font-bold hover:text-[#00C8DC] transition-colors truncate"
            >
              {partner.nickname || partner.name}
            </Link>
          </div>
        )}
        <div className="flex items-center gap-1 text-[10px] min-w-0">
          <span className="text-[#687FA3] shrink-0">vs</span>
          <div className="truncate text-white/60">
            {opponents
              .map((p) => p!.nickname || p!.name.split(" ")[0])
              .join(" & ")}
          </div>
        </div>
      </div>

      {/* Score */}
      {score && (
        <p className="font-mono text-[11px] text-white/60">{score}</p>
      )}

      {/* Rating */}
      <div className="border-t border-[#687FA3]/10 pt-2 mt-auto flex items-center gap-1.5 font-mono text-[10px] flex-wrap">
        {ratingBefore !== null && (
          <>
            <span className="text-white/40">{ratingBefore.toFixed(2)}</span>
            <span className="text-[#687FA3]">→</span>
          </>
        )}
        <span className="font-bold text-white">{rating.toFixed(2)}</span>
        {delta !== null && (
          <span
            className={`font-black ${delta > 0 ? "text-emerald-400" : delta < 0 ? "text-red-400" : "text-[#687FA3]"}`}
          >
            ({delta > 0 ? "+" : ""}
            {delta.toFixed(2)})
          </span>
        )}
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
        key={`dot-${payload.matchIndex}`}
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
                dataKey="matchIndex"
                tickFormatter={(idx: number) => {
                  const point = chartData[idx - 1];
                  return point ? formatDate(point.match.date_local) : "";
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
                key={point.match.match_id}
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
