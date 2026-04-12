"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { CarouselSlide } from "@/lib/types";

const FALLBACK_SLIDES: CarouselSlide[] = [
  {
    id: "1",
    image_url: "",
    title: "Padel League Philippines",
    subtitle: "The premier padel league in the Metro",
  },
  {
    id: "2",
    image_url: "",
    title: "Season 8 Underway",
    subtitle: "Track scores, ratings, and standings",
  },
  {
    id: "3",
    image_url: "",
    title: "Join the Competition",
    subtitle: "Duel · Doubles · KOTC · Team",
  },
];

interface Props {
  slides?: CarouselSlide[];
}

export default function HeroCarousel({ slides }: Props) {
  const items = slides && slides.length > 0 ? slides : FALLBACK_SLIDES;
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function go(n: number) {
    setIdx((prev) => (prev + n + items.length) % items.length);
  }

  useEffect(() => {
    if (paused) return;
    timerRef.current = setInterval(() => go(1), 5000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, items.length]);

  const slide = items[idx];

  return (
    <div
      className="relative w-full overflow-hidden bg-surface"
      style={{ height: "clamp(220px, 40vw, 480px)" }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
    >
      {/* Background image or gradient */}
      {slide.image_url ? (
        <Image
          src={slide.image_url}
          alt={slide.title || ""}
          fill
          className="object-cover"
          unoptimized
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-elevated via-surface to-bg" />
      )}

      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-bg/80 via-bg/20 to-transparent" />

      {/* Content */}
      {(slide.title || slide.subtitle) && (
        <div className="absolute bottom-12 left-6 right-16">
          {slide.title && (
            <h2 className="font-display text-4xl text-white italic mb-1">
              {slide.title}
            </h2>
          )}
          {slide.subtitle && (
            <p className="text-sec text-sm">{slide.subtitle}</p>
          )}
          {slide.link && (
            <Link
              href={slide.link}
              className="mt-3 inline-block text-xs text-accent border border-accent/40 px-3 py-1 rounded hover:bg-accent-dim transition-colors"
            >
              Learn more →
            </Link>
          )}
        </div>
      )}

      {/* Prev / Next */}
      <button
        onClick={() => go(-1)}
        className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 bg-bg/60 hover:bg-bg/90 rounded-full flex items-center justify-center text-white text-sm transition-colors"
        aria-label="Previous"
      >
        ‹
      </button>
      <button
        onClick={() => go(1)}
        className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 bg-bg/60 hover:bg-bg/90 rounded-full flex items-center justify-center text-white text-sm transition-colors"
        aria-label="Next"
      >
        ›
      </button>

      {/* Dots */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
        {items.map((_, i) => (
          <button
            key={i}
            onClick={() => setIdx(i)}
            className={`rounded-full transition-all duration-200 ${
              i === idx
                ? "w-5 h-1.5 bg-accent"
                : "w-1.5 h-1.5 bg-white/40 hover:bg-white/70"
            }`}
            aria-label={`Slide ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
