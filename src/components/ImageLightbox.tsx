"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  src: string;
  alt: string;
};

export default function ImageLightbox({ isOpen, onClose, src, alt }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 cursor-zoom-out"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
      aria-label={`Enlarged photo of ${alt}`}
    >
      <div className="absolute inset-0 bg-black/80" aria-hidden="true" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="relative max-w-full max-h-full rounded-2xl shadow-2xl object-contain"
        style={{ maxWidth: "min(90vw, 480px)", maxHeight: "80vh" }}
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body,
  );
}
