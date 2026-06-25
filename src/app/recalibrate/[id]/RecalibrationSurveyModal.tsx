"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { SurveyChoice } from "@/lib/recalibration/survey";

type PublicAnchor = {
  player_id: number;
  name: string | null;
  nickname: string | null;
  image_link: string | null;
};

type CalibrateeInfo = {
  name: string | null;
  nickname: string | null;
  image_link: string | null;
};

type Recap = { better: number; worse: number; total: number };

type Phase =
  | { kind: "loading" }
  | { kind: "question"; anchor: PublicAnchor; answeredCount: number; softTarget: number }
  | { kind: "done"; recap: Recap }
  | { kind: "error"; message: string };

const CHOICES: { choice: SurveyChoice; label: string; tone: string }[] = [
  {
    choice: "significantly_better",
    label: "Significantly better",
    tone: "border-emerald-500/40 hover:border-emerald-400/80 hover:bg-emerald-500/10 text-emerald-200",
  },
  {
    choice: "slightly_better",
    label: "Slightly better",
    tone: "border-emerald-500/20 hover:border-emerald-400/50 hover:bg-emerald-500/5 text-emerald-100/90",
  },
  {
    choice: "slightly_worse",
    label: "Slightly worse",
    tone: "border-rose-500/20 hover:border-rose-400/50 hover:bg-rose-500/5 text-rose-100/90",
  },
  {
    choice: "significantly_worse",
    label: "Significantly worse",
    tone: "border-rose-500/40 hover:border-rose-400/80 hover:bg-rose-500/10 text-rose-200",
  },
];

async function authHeader(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

function Avatar({ player, ring }: { player: { name: string | null; image_link: string | null }; ring: string }) {
  const initial = (player.name ?? "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <div className={`w-16 h-16 rounded-full overflow-hidden border-2 ${ring} bg-[#1a2540] flex items-center justify-center shrink-0`}>
      {player.image_link ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={player.image_link} alt={player.name ?? "Player"} className="w-full h-full object-cover" />
      ) : (
        <span className="text-xl font-black text-white/70">{initial}</span>
      )}
    </div>
  );
}

export default function RecalibrationSurveyModal({
  isOpen,
  onClose,
  requestId,
  calibratee,
  onCompleted,
}: {
  isOpen: boolean;
  onClose: () => void;
  requestId: number;
  calibratee: CalibrateeInfo;
  onCompleted: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const post = useCallback(
    async (payload: Record<string, unknown>) => {
      const headers = await authHeader();
      const res = await fetch(`/api/recalibration/${requestId}/respondents/me/survey`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      return { ok: res.ok, json } as { ok: boolean; json: Record<string, unknown> };
    },
    [requestId],
  );

  const applyResult = useCallback((ok: boolean, json: Record<string, unknown>) => {
    if (!ok) {
      setPhase({ kind: "error", message: (json.error as string) ?? "Something went wrong." });
      return;
    }
    if (json.done) {
      setPhase({ kind: "done", recap: (json.recap as Recap) ?? { better: 0, worse: 0, total: 0 } });
      return;
    }
    const question = json.question as { anchorPlayer: PublicAnchor } | undefined;
    if (!question?.anchorPlayer) {
      setPhase({ kind: "error", message: "Unexpected response from the server." });
      return;
    }
    setPhase({
      kind: "question",
      anchor: question.anchorPlayer,
      answeredCount: (json.answeredCount as number) ?? 0,
      softTarget: (json.softTarget as number) ?? 5,
    });
  }, []);

  // Start (or resume) the survey once when the modal opens.
  useEffect(() => {
    if (!isOpen) {
      startedRef.current = false;
      setPhase({ kind: "loading" });
      return;
    }
    if (startedRef.current) return;
    startedRef.current = true;
    void (async () => {
      const { ok, json } = await post({ action: "start" });
      applyResult(ok, json);
    })();
  }, [isOpen, post, applyResult]);

  async function answer(choice: SurveyChoice) {
    if (phase.kind !== "question" || busy) return;
    setBusy(true);
    const { ok, json } = await post({
      action: "answer",
      anchorPlayerId: phase.anchor.player_id,
      choice,
    });
    setBusy(false);
    applyResult(ok, json);
  }

  function handleDone() {
    onCompleted();
    onClose();
  }

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/60 cursor-pointer" onClick={onClose} aria-hidden="true" />
        <div className="relative w-full max-w-lg bg-[#162032] border border-[#687FA3]/20 rounded-2xl shadow-2xl p-6 space-y-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#00C8DC] mb-0.5">
                Recalibration
              </p>
              <h2 className="text-base font-black text-white">Compare players</h2>
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

          {phase.kind === "loading" && (
            <div className="py-10 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-[#00C8DC] border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {phase.kind === "error" && (
            <div className="space-y-4">
              <div className="bg-red-500/5 border border-red-500/20 rounded-xl px-4 py-3">
                <p className="text-sm text-red-300 leading-relaxed">{phase.message}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-full bg-[#1a2540] hover:bg-[#1e2d50] border border-[#687FA3]/20 text-white/70 font-black py-2.5 px-4 rounded-xl text-sm transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          )}

          {phase.kind === "question" && (
            <div className="space-y-5">
              <p className="text-[11px] text-[#687FA3]">
                Question {phase.answeredCount + 1} · usually a handful of comparisons
              </p>

              {/* Two players, stacked on mobile */}
              <div className="relative flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-3">
                <div className="flex flex-col items-center gap-2 text-center">
                  <Avatar player={calibratee} ring="border-[#00C8DC]/60" />
                  <div>
                    <p className="text-sm font-bold text-white leading-tight">{calibratee.name ?? "Player"}</p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#00C8DC]/80">Being rated</p>
                  </div>
                </div>

                <span className="text-xs font-black uppercase tracking-widest text-[#687FA3] py-1">vs</span>

                <div className="flex flex-col items-center gap-2 text-center">
                  <Avatar player={phase.anchor} ring="border-white/15" />
                  <div>
                    <p className="text-sm font-bold text-white leading-tight">{phase.anchor.name ?? "Player"}</p>
                    {phase.anchor.nickname ? (
                      <p className="text-[11px] text-[#687FA3]">{phase.anchor.nickname}</p>
                    ) : (
                      <p className="text-[10px] font-black uppercase tracking-widest text-[#687FA3]">Compare to</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="relative space-y-2">
                <p className="text-sm text-white/80 text-center leading-relaxed">
                  Compared to <strong>{phase.anchor.name ?? "this player"}</strong>,{" "}
                  <strong>{calibratee.name ?? "they"}</strong> is…
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {CHOICES.map((c) => (
                    <button
                      key={c.choice}
                      type="button"
                      disabled={busy}
                      onClick={() => answer(c.choice)}
                      className={`py-3 px-4 rounded-xl border ${c.tone} bg-[#0E1523]/40 font-bold text-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => answer("dont_know")}
                  className="w-full mt-1 py-2.5 px-4 rounded-xl text-xs font-bold uppercase tracking-widest text-[#687FA3] hover:text-white border border-transparent hover:border-white/10 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  I don&apos;t know this player
                </button>

                {busy && (
                  <div className="absolute inset-0 flex items-center justify-center bg-[#162032]/60 rounded-xl">
                    <div className="w-5 h-5 border-2 border-[#00C8DC] border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
            </div>
          )}

          {phase.kind === "done" && (
            <div className="space-y-4">
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-4 py-4 text-center space-y-1">
                <p className="text-sm font-black text-emerald-300">Assessment recorded ✓</p>
                <p className="text-xs text-white/70 leading-relaxed">
                  Thanks — your comparisons have been recorded.
                  {phase.recap.total > 0 && (
                    <>
                      {" "}You rated {calibratee.name ?? "them"} better than{" "}
                      <strong>{phase.recap.better}</strong> and worse than{" "}
                      <strong>{phase.recap.worse}</strong> of the players shown.
                    </>
                  )}
                </p>
                <p className="text-[11px] text-[#687FA3] leading-relaxed">
                  The committee combines everyone&apos;s comparisons — the resulting rating stays hidden from raters.
                </p>
              </div>
              <button
                type="button"
                onClick={handleDone}
                className="w-full bg-[#00C8DC] hover:bg-white text-[#0E1523] font-black py-2.5 px-4 rounded-xl text-sm transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
