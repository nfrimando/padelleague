"use client";

import { X } from "lucide-react";

type Props = {
  eventName: string;
  loading: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function EventSignupConfirmModal({
  eventName,
  loading,
  error,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-pointer"
        onClick={onCancel}
      />
      <div className="relative z-10 w-full max-w-sm bg-[#0E1523] border border-[#687FA3]/20 rounded-2xl shadow-2xl p-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <h2 className="text-sm font-black uppercase tracking-widest text-[#687FA3]">
            Confirm Sign Up
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 text-[#687FA3]/40 hover:text-slate-300 transition-colors cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>

        <p className="text-sm text-slate-300 leading-relaxed mb-1">
          You&apos;re signing up for{" "}
          <span className="font-bold text-white">{eventName}</span>.
        </p>
        <p className="text-xs text-[#687FA3] mb-5 leading-relaxed">
          Signing up doesn&apos;t guarantee a spot — acceptance depends on the
          event host.
        </p>

        {error && (
          <p className="text-red-400 text-xs bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2 mb-4">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-[#687FA3] bg-[#162032] border border-[#687FA3]/20 hover:border-[#687FA3]/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-900 bg-[#00C8DC] hover:bg-[#00b5c8] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {loading ? "Signing up…" : "Sign Up!"}
          </button>
        </div>
      </div>
    </div>
  );
}
