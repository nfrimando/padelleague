"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { PredictableMatch } from "@/lib/usePredictableMatches";

type Props = {
  match: PredictableMatch;
  team: 1 | 2;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
};

function teamLabel(match: PredictableMatch, team: 1 | 2): string {
  const p1 = team === 1 ? match.team1Player1 : match.team2Player1;
  const p2 = team === 1 ? match.team1Player2 : match.team2Player2;
  const name1 = p1.nickname ?? p1.name;
  const name2 = p2.nickname ?? p2.name;
  return `${name1} & ${name2}`;
}

export function ConfirmPredictionModal({ match, team, onConfirm, onCancel }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  };

  const colorClass = team === 1 ? "text-sky-400" : "text-amber-400";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={!submitting ? onCancel : undefined}
      />
      <div className="relative z-10 w-full max-w-sm bg-[#0E1523] border border-[#687FA3]/20 rounded-2xl shadow-2xl p-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <h2 className="text-sm font-black uppercase tracking-widest text-[#687FA3]">
            Confirm Prediction
          </h2>
          {!submitting && (
            <button
              type="button"
              onClick={onCancel}
              className="shrink-0 text-[#687FA3]/40 hover:text-slate-300 transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <p className="text-sm text-slate-300 leading-relaxed mb-1">
          You are picking{" "}
          <span className={`font-bold ${colorClass}`}>
            {teamLabel(match, team)}
          </span>{" "}
          to win.
        </p>
        <p className="text-xs text-[#687FA3] mb-5">
          Predictions are final and cannot be changed after submission.
        </p>

        {error && (
          <p className="text-xs text-rose-400 mb-4">{error}</p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-[#687FA3] bg-[#162032] border border-[#687FA3]/20 hover:border-[#687FA3]/40 transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={submitting}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-colors disabled:opacity-50 ${
              team === 1
                ? "bg-sky-600 hover:bg-sky-500"
                : "bg-amber-600 hover:bg-amber-500"
            }`}
          >
            {submitting ? "Saving…" : "Confirm Pick"}
          </button>
        </div>
      </div>
    </div>
  );
}
