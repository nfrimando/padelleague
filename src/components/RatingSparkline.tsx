"use client";

import { useState } from "react";

export interface RatingSparklinePoint {
  rating: number;
  date?: string | null;
}

export default function RatingSparkline({
  history,
}: {
  history: RatingSparklinePoint[];
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
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

  // Polyline and dots start from index 1 (index 0 is the hidden baseline)
  const polyline = pts
    .slice(1)
    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
  const lineColor = "#0ea5e9"; // sky-500
  const dotColor = (i: number) => {
    const delta = ratings[i] - ratings[i - 1];
    if (delta > 0.005) return "#22c55e"; // green-500
    if (delta < -0.005) return "#ef4444"; // red-500
    return "#0ea5e9";
  };

  return (
    <div className="relative">
      {hoveredIdx !== null && (
        <div
          className="absolute pointer-events-none z-10 -translate-x-1/2 text-[10px] font-bold tabular-nums bg-sky-900/90 text-sky-100 rounded px-1.5 py-0.5 whitespace-nowrap shadow"
          style={{
            left: `${(pts[hoveredIdx].x / W) * 100}%`,
            bottom: "calc(100% + 3px)",
          }}
        >
          {history[hoveredIdx].rating.toFixed(2)}
        </div>
      )}
      <svg
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
        {pts.map((p, i) => {
          if (i === 0) return null; // baseline only, not rendered
          return (
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
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
