"use client";

import { AlertCircle } from "lucide-react";

type PendingPaymentBanner = {
  type: "pending_payment";
  signupId: string;
  eventName: string;
  onPayNow: (signupId: string) => void;
};

type BannerProps = PendingPaymentBanner;

export default function DashboardBanner({ type, signupId, eventName, onPayNow }: BannerProps) {
  if (type === "pending_payment") {
    return (
      <div className="bg-orange-500/10 border border-orange-500/20 sm:rounded-2xl px-5 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <AlertCircle size={14} className="text-orange-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-orange-400">
              Payment Required
            </p>
            <p className="text-sm font-bold truncate">{eventName}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onPayNow(signupId)}
          className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-400 text-white font-black text-[9px] uppercase tracking-widest px-3 py-1.5 rounded-full transition-all shrink-0"
        >
          Pay Now
        </button>
      </div>
    );
  }

  return null;
}
