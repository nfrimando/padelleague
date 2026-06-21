"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

type Eligibility = {
  eligible: boolean;
  nextEligibleAt: string | null;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function RecalibrationRequestModal({ isOpen, onClose }: Props) {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [requestorNotes, setRequestorNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setSubmitted(false);
    setRequestorNotes("");
    setLoading(true);

    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }

      const res = await fetch("/api/recalibration/eligibility", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setEligibility({
          eligible: json.eligible,
          nextEligibleAt: json.nextEligibleAt ?? null,
        });
      } else {
        setError(json.error ?? "Failed to check eligibility.");
      }
      setLoading(false);
    })();
  }, [isOpen]);

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setSubmitting(false);
      setError("You must be signed in.");
      return;
    }

    const res = await fetch("/api/recalibration", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ requestor_notes: requestorNotes || undefined }),
    });

    const json = await res.json().catch(() => ({}));
    setSubmitting(false);

    if (!res.ok) {
      if (json.nextEligibleAt) {
        setEligibility({
          eligible: false,
          nextEligibleAt: json.nextEligibleAt,
        });
      }
      setError(json.error ?? "Failed to submit request.");
      return;
    }

    setSubmitted(true);
  }

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className="fixed inset-0 bg-black/60 cursor-pointer"
          onClick={onClose}
          aria-hidden="true"
        />
        <div className="relative w-full max-w-lg bg-[#162032] border border-[#687FA3]/20 rounded-2xl shadow-2xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#00C8DC] mb-0.5">
                Rating
              </p>
              <h2 className="text-base font-black text-white">
                Request Rating Recalibration
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-white/40 hover:text-white transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>

          {loading ? (
            <div className="py-6 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-[#00C8DC] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : submitted ? (
            <div className="space-y-4">
              <p className="text-sm text-white/80 leading-relaxed">
                Your recalibration request has been submitted. The committee
                will select respondents to assess your rating, and you'll be
                emailed once it's resolved.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="w-full bg-[#1a2540] hover:bg-[#1e2d50] border border-[#687FA3]/20 text-white/70 font-black py-2.5 px-4 rounded-xl text-sm transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          ) : eligibility && !eligibility.eligible ? (
            <div className="space-y-4">
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl px-4 py-3">
                <p className="font-bold text-amber-300 text-sm">
                  You're not eligible yet
                </p>
                <p className="text-amber-200/60 text-xs leading-relaxed mt-0.5">
                  You can only request a recalibration every 3 months.
                  {eligibility.nextEligibleAt && (
                    <>
                      {" "}
                      You can request your next recalibration on{" "}
                      <strong>{formatDate(eligibility.nextEligibleAt)}</strong>.
                    </>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-full bg-[#1a2540] hover:bg-[#1e2d50] border border-[#687FA3]/20 text-white/70 font-black py-2.5 px-4 rounded-xl text-sm transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <ul className="space-y-3 text-sm text-[#9aabc7] leading-relaxed list-disc pl-4">
                <li>
                  Request recalibration if you have reasonable basis that your
                  current rating significantly does not reflect your current
                  skill.
                </li>
                <li>
                  At least 3 of your recent opponents will be asked to assess
                  your current rating. This group is committee selected to avoid
                  bias. Any attempt to influence the reassessment will nullify
                  your request.
                </li>
                <li>
                  Average rating will be computed from the respondents. If the
                  computed new rating is &ge;0.5 delta, your rating will be
                  updated. If the computed rating is below your current,{" "}
                  <strong className="text-white">
                    your rating will be updated to the lower rating
                  </strong>
                  . If within 0 to 0.5, your rating will not be changed.
                </li>
                <li>You can only request a recalibration every 3 months.</li>
              </ul>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[#687FA3]">
                  Anything you'd like the committee to know? (optional)
                </label>
                <textarea
                  value={requestorNotes}
                  onChange={(e) => setRequestorNotes(e.target.value)}
                  maxLength={1000}
                  rows={3}
                  placeholder="Share your reasoning here..."
                  className="w-full bg-[#1a2540] border border-[#687FA3]/20 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-[#687FA3]/60 focus:outline-none focus:border-[#00C8DC]/50 transition-colors resize-none"
                />
              </div>

              {error && <p className="text-red-400 text-sm">{error}</p>}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="flex-1 bg-[#1a2540] hover:bg-[#1e2d50] border border-[#687FA3]/20 text-white/70 font-black py-2.5 px-4 rounded-xl text-sm transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={submitting}
                  className="flex-1 bg-[#00C8DC] hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed text-[#0E1523] font-black py-2.5 px-4 rounded-xl text-sm transition-colors cursor-pointer"
                >
                  {submitting
                    ? "Submitting…"
                    : "I understand - request recalibration"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
