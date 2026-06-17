"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type { RatingEventDescription } from "@/lib/ratingEventDisplay";

export interface RatingSparklinePoint {
  rating: number;
  date?: string | null;
  // Optional rich-hover detail (what caused this rating change). When present the tooltip
  // explains the event; when absent it falls back to the bare rating value.
  detail?: RatingEventDescription | null;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + (dateStr.length <= 10 ? "T00:00:00" : ""));
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

function DetailTooltip({ detail }: { detail: RatingEventDescription }) {
  if (detail.kind === "initial") {
    return (
      <div className="bg-[#0E1523] border border-[#687FA3]/30 rounded-lg p-2.5 shadow-xl text-xs min-w-[140px]">
        <p className="text-[#687FA3] text-[9px] uppercase tracking-wider mb-1">
          Starting rating
        </p>
        <p className="font-mono font-bold text-white">
          {detail.after.toFixed(2)}
        </p>
      </div>
    );
  }

  if (detail.kind === "other") {
    return (
      <div className="bg-[#0E1523] border border-[#687FA3]/30 rounded-lg p-2.5 shadow-xl text-xs min-w-[140px]">
        <div className="flex items-center justify-between gap-3 mb-1.5">
          <span className="text-[#687FA3] text-[9px] uppercase tracking-wider">
            {detail.label}
          </span>
          {detail.date && (
            <span className="text-[#687FA3] text-[9px]">
              {formatDate(detail.date)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 font-mono">
          <span className="font-bold text-white">{detail.after.toFixed(2)}</span>
          {detail.delta !== null && (
            <span
              className={`text-[10px] font-black ${detail.delta > 0 ? "text-emerald-400" : detail.delta < 0 ? "text-red-400" : "text-[#687FA3]"}`}
            >
              ({detail.delta > 0 ? "+" : ""}
              {detail.delta.toFixed(2)})
            </span>
          )}
        </div>
      </div>
    );
  }

  // match
  return (
    <div className="bg-[#0E1523] border border-[#687FA3]/30 rounded-lg p-2.5 shadow-xl text-xs min-w-[170px] max-w-[220px]">
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <span className="text-[#687FA3] text-[9px]">
          {formatDate(detail.date)}
          {detail.matchType && (
            <span className="ml-1 uppercase">· {detail.matchType}</span>
          )}
        </span>
        {detail.result && (
          <span
            className={`text-[9px] font-black uppercase tracking-widest ${detail.result === "win" ? "text-emerald-400" : "text-red-400"}`}
          >
            {detail.result === "win" ? "Win" : "Loss"}
          </span>
        )}
      </div>
      {detail.partner && (
        <div className="mb-1 text-[10px]">
          <span className="text-[#687FA3] uppercase tracking-wider">w/ </span>
          <Link
            href={`/players/${encodeURIComponent(String(detail.partner.player_id))}`}
            className="font-bold text-white/90 hover:text-[#00C8DC] transition-colors"
          >
            {detail.partner.nickname || detail.partner.name}
          </Link>
        </div>
      )}
      {detail.opponents.length > 0 && (
        <div className="mb-1.5 text-[10px]">
          <span className="text-[#687FA3] uppercase tracking-wider">vs </span>
          {detail.opponents.map((p, i) => (
            <span key={String(p.player_id)}>
              <Link
                href={`/players/${encodeURIComponent(String(p.player_id))}`}
                className="font-bold text-white/90 hover:text-[#00C8DC] transition-colors"
              >
                {p.nickname || p.name}
              </Link>
              {i < detail.opponents.length - 1 && (
                <span className="text-[#687FA3] mx-0.5">&amp;</span>
              )}
            </span>
          ))}
        </div>
      )}
      {detail.score && (
        <p className="font-mono text-white/70 mb-1.5">{detail.score}</p>
      )}
      <div className="border-t border-[#687FA3]/20 pt-1.5 flex items-center gap-1.5 font-mono">
        {detail.before !== null && (
          <>
            <span className="text-white/40">{detail.before.toFixed(2)}</span>
            <span className="text-[#687FA3]">→</span>
          </>
        )}
        <span className="font-bold text-white">{detail.after.toFixed(2)}</span>
        {detail.delta !== null && (
          <span
            className={`text-[10px] font-black ${detail.delta > 0 ? "text-emerald-400" : detail.delta < 0 ? "text-red-400" : "text-[#687FA3]"}`}
          >
            ({detail.delta > 0 ? "+" : ""}
            {detail.delta.toFixed(2)})
          </span>
        )}
      </div>
    </div>
  );
}

export default function RatingSparkline({
  history,
}: {
  history: RatingSparklinePoint[];
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => setMounted(true), []);

  if (history.length < 2) return null;

  const W = 80;
  const H = 32;
  const PAD = 3;
  const ratings = history.map((h) => h.rating);
  const min = Math.min(...ratings);
  const max = Math.max(...ratings);
  const range = max - min || 0.01;
  const toX = (i: number) => PAD + (i / (history.length - 1)) * (W - PAD * 2);
  const toY = (r: number) => PAD + (1 - (r - min) / range) * (H - PAD * 2);
  const pts = history.map((h, i) => ({ x: toX(i), y: toY(h.rating) }));

  const polyline = pts
    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
  const lineColor = "#0ea5e9"; // sky-500

  // Per-point colour: prefer the event's own delta, else compare to the previous point.
  const dotColor = (i: number) => {
    const detail = history[i].detail;
    let delta: number | null = null;
    if (detail && (detail.kind === "match" || detail.kind === "other")) {
      delta = detail.delta;
    } else if (detail && detail.kind === "initial") {
      delta = null;
    } else if (i > 0) {
      delta = ratings[i] - ratings[i - 1];
    }
    if (delta === null) return "#0ea5e9";
    if (delta > 0.005) return "#22c55e"; // green-500
    if (delta < -0.005) return "#ef4444"; // red-500
    return "#0ea5e9";
  };

  const handleMouseEnter = (i: number) => {
    setHoveredIdx(i);
    if (svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      setTooltipPos({
        x: rect.left + (pts[i].x / W) * rect.width,
        y: rect.top + window.scrollY,
      });
    }
  };

  const handleMouseLeave = () => {
    setHoveredIdx(null);
    setTooltipPos(null);
  };

  const hovered = hoveredIdx !== null ? history[hoveredIdx] : null;

  const tooltip =
    mounted && hoveredIdx !== null && hovered && tooltipPos
      ? createPortal(
          <div
            className="pointer-events-none z-[9999] absolute -translate-x-1/2 -translate-y-full"
            style={{ left: tooltipPos.x, top: tooltipPos.y - 6 }}
          >
            {hovered.detail ? (
              <DetailTooltip detail={hovered.detail} />
            ) : (
              <div className="text-[10px] font-bold tabular-nums bg-sky-900/90 text-sky-100 rounded px-1.5 py-0.5 whitespace-nowrap shadow">
                {hovered.rating.toFixed(2)}
              </div>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="relative">
      {tooltip}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-20 h-8"
        fill="none"
        aria-hidden="true"
      >
        <polyline
          points={polyline}
          stroke={lineColor}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.85"
        />
        {pts.map((p, i) => (
          <g key={i}>
            <circle
              cx={p.x.toFixed(1)}
              cy={p.y.toFixed(1)}
              r={hoveredIdx === i ? 3.5 : i === pts.length - 1 ? 2.5 : 1.5}
              fill={dotColor(i)}
            />
            <circle
              cx={p.x.toFixed(1)}
              cy={p.y.toFixed(1)}
              r="8"
              fill="transparent"
              className="cursor-pointer"
              onMouseEnter={() => handleMouseEnter(i)}
              onMouseLeave={handleMouseLeave}
            />
          </g>
        ))}
      </svg>
    </div>
  );
}
