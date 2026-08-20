"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { Modal } from "@/components/Modal";
import InfoTooltip from "@/components/InfoTooltip";
import { tierIconSrc, StarBadge } from "@/components/LadderTierBadge";

const ROULETTE_EXPLAINER =
  "The roulette auto-draws 2v2 ladder matches from opted-in players each cycle. Anyone can play ladder matches — opting in just enters you in the draw.";

const PRIMARY_BUTTON =
  "inline-flex items-center justify-center w-full sm:w-auto shrink-0 min-h-11 px-6 rounded-xl bg-[#00C8DC] text-[#0E1523] text-sm font-bold shadow-[0_0_20px_rgba(0,200,220,0.45)] transition-all cursor-pointer hover:bg-white hover:shadow-[0_0_24px_rgba(0,200,220,0.6)] disabled:opacity-60 disabled:cursor-not-allowed";

// The one place on /ladder that answers "am I in the roulette draw?" and lets you change it.
// Deliberately breaks the page's 10px uppercase chrome typography — status and action must
// read as content, not as another filter chip (which is exactly how the old pill was read).
export default function LadderOptInBanner({
  isLinked,
  optIn,
  saving,
  onToggle,
  tierName,
  stars,
}: {
  isLinked: boolean;
  optIn: boolean;
  saving: boolean;
  onToggle: () => void;
  tierName: string | null;
  stars: number | null;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isIn = isLinked && optIn;

  const headline = isIn
    ? "You're in the roulette draw"
    : "You're not in the roulette draw";

  const subtext = !isLinked
    ? "Link your profile to join the draw."
    : isIn
      ? "You'll be automatically drawn into 2v2 ladder matches this cycle."
      : "You won't be drawn into any ladder matches. You can still play ladder matches any time.";

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 mb-6">
      <div
        className={`rounded-xl border px-4 py-4 sm:px-5 ${
          isIn
            ? "border-emerald-500/25 bg-emerald-500/[0.04]"
            : "border-[#162032] bg-[#0f1729]"
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <span
              className={`shrink-0 flex items-center justify-center w-8 h-8 rounded-full ${
                isIn
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "bg-[#687FA3]/10 text-[#687FA3]"
              }`}
            >
              {isIn ? (
                <Check className="w-5 h-5" strokeWidth={3} />
              ) : (
                <X className="w-5 h-5" strokeWidth={3} />
              )}
            </span>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="text-lg sm:text-xl font-black text-white leading-tight">
                  {headline}
                </h2>
                <InfoTooltip
                  text={ROULETTE_EXPLAINER}
                  label="What is the roulette draw?"
                />
              </div>
              <p className="mt-1 text-sm text-[#687FA3] leading-relaxed">
                {subtext}
              </p>

              {tierName && (
                <div className="mt-2.5 inline-flex items-center gap-1.5">
                  <img
                    src={tierIconSrc(tierName)}
                    alt=""
                    className="w-5 h-5 object-contain shrink-0"
                  />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-[#687FA3]">
                    {tierName}
                  </span>
                  <StarBadge stars={stars ?? 0} />
                </div>
              )}
            </div>
          </div>

          {!isLinked ? (
            <Link href="/join" className={PRIMARY_BUTTON}>
              Link your profile
            </Link>
          ) : isIn ? (
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={saving}
              className="inline-flex items-center justify-center w-full sm:w-auto shrink-0 min-h-11 px-6 rounded-xl bg-[#1a2540] border border-[#687FA3]/30 text-white text-sm font-bold transition-colors cursor-pointer hover:border-rose-500/50 hover:text-rose-300 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Leave the roulette draw
            </button>
          ) : (
            <button
              type="button"
              onClick={onToggle}
              disabled={saving}
              className={PRIMARY_BUTTON}
            >
              Join the roulette draw
            </button>
          )}
        </div>
      </div>

      <Modal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Leave the roulette draw?"
        maxWidth="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-300 leading-relaxed">
            You&apos;ll stop being drawn into new 2v2 ladder matches. Your tier
            and stars stay exactly as they are, and you can rejoin any time.
          </p>
          <p className="text-sm text-slate-400 leading-relaxed">
            Matches you&apos;ve already been drawn into still stand — please
            play those.
          </p>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              className="inline-flex items-center justify-center min-h-11 px-5 rounded-xl border border-[#687FA3]/30 text-sm font-bold text-slate-300 transition-colors cursor-pointer hover:text-white hover:border-[#687FA3]/60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmOpen(false);
                onToggle();
              }}
              disabled={saving}
              className="inline-flex items-center justify-center min-h-11 px-5 rounded-xl bg-rose-500/90 text-white text-sm font-bold transition-colors cursor-pointer hover:bg-rose-500 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Yes, leave the draw
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
