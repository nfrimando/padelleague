"use client";

import { useEffect, useRef, useState } from "react";

// Small "i" affordance with a hover/tap tooltip. Hover alone never fires on touch,
// so the icon is a real button that toggles the bubble as well.
// Pass `children` to use any other element as the trigger (e.g. the ladder cushion shield).
export default function InfoTooltip({
  text,
  label = "More info",
  align = "center",
  children,
}: {
  text: string;
  label?: string;
  align?: "center" | "right";
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const visible = open || hovered;

  return (
    <span ref={ref} className="relative inline-flex shrink-0">
      <button
        type="button"
        aria-label={label}
        aria-expanded={visible}
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        className={`inline-flex items-center justify-center transition-colors rounded-full focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#00C8DC]/60 ${
          children
            ? "cursor-pointer"
            : "text-[#687FA3]/60 hover:text-[#687FA3] cursor-help"
        }`}
      >
        {children ?? (
          <svg viewBox="0 0 12 12" className="w-3.5 h-3.5 fill-current">
            <circle cx="6" cy="6" r="5.5" stroke="currentColor" strokeWidth="1" fill="none" />
            <text x="6" y="9" textAnchor="middle" fontSize="7" fontWeight="bold" fill="currentColor">
              i
            </text>
          </svg>
        )}
      </button>
      <span
        role="tooltip"
        className={`pointer-events-none absolute bottom-full mb-2 w-56 rounded-lg bg-slate-800 border border-slate-700 px-2.5 py-2 text-[9px] font-normal normal-case tracking-normal text-slate-300 leading-relaxed transition-opacity z-20 text-center whitespace-normal ${
          align === "right" ? "right-0" : "left-1/2 -translate-x-1/2"
        } ${visible ? "opacity-100" : "opacity-0"}`}
      >
        {text}
      </span>
    </span>
  );
}
