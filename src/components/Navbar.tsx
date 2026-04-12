"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/players", label: "Players" },
  { href: "/leaderboard", label: "Leaderboard" },
];

export default function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 bg-surface border-b border-bdr">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link
          href="/"
          className="font-display text-2xl text-accent tracking-wide uppercase italic"
        >
          Padel League PH
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-8">
          {LINKS.map((l) => {
            const active =
              l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`text-sm font-medium transition-colors pb-0.5 border-b-2 ${
                  active
                    ? "text-white border-accent"
                    : "text-sec border-transparent hover:text-white hover:border-muted"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </div>

        {/* Season badge */}
        <div className="hidden md:flex items-center">
          <span className="text-xs font-mono bg-gold-bg text-gold border border-gold/30 px-2 py-0.5 rounded">
            Season 8
          </span>
        </div>

        {/* Hamburger */}
        <button
          className="md:hidden flex flex-col justify-center items-center w-8 h-8 gap-1.5"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          <span
            className={`block h-0.5 w-5 bg-white transition-all duration-200 ${
              open ? "rotate-45 translate-y-2" : ""
            }`}
          />
          <span
            className={`block h-0.5 w-5 bg-white transition-all duration-200 ${
              open ? "opacity-0" : ""
            }`}
          />
          <span
            className={`block h-0.5 w-5 bg-white transition-all duration-200 ${
              open ? "-rotate-45 -translate-y-2" : ""
            }`}
          />
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden bg-surface border-t border-bdr px-4 py-3 flex flex-col gap-3">
          {LINKS.map((l) => {
            const active =
              l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className={`text-sm font-medium py-1 ${
                  active ? "text-accent" : "text-sec"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
          <span className="text-xs font-mono bg-gold-bg text-gold border border-gold/30 px-2 py-0.5 rounded w-fit">
            Season 8
          </span>
        </div>
      )}
    </nav>
  );
}
