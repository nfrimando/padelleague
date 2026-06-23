"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Props = {
  signupId: string;
  eventLabel: string;
  registrationFee?: number | null;
  paymentInstructions?: string | null;
  onClose?: () => void;
};

export default function PendingPaymentPanel({
  signupId,
  eventLabel,
  registrationFee,
  paymentInstructions,
  onClose,
}: Props) {
  const [payOnlineLoading, setPayOnlineLoading] = useState(false);
  const [payOnlineError, setPayOnlineError] = useState<string | null>(null);
  const [showGCashModal, setShowGCashModal] = useState(false);

  async function handlePayOnline() {
    setPayOnlineLoading(true);
    setPayOnlineError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setPayOnlineError("Session expired. Please refresh and try again.");
        return;
      }

      const res = await fetch("/api/payments/create-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          signup_id: signupId,
          return_to: window.location.pathname,
        }),
      });

      const json = (await res.json()) as { link_url?: string; error?: string };

      if (!res.ok || !json.link_url) {
        setPayOnlineError(json.error ?? "Failed to create payment link.");
        return;
      }

      window.location.href = json.link_url;
    } catch {
      setPayOnlineError("Network error. Please try again.");
    } finally {
      setPayOnlineLoading(false);
    }
  }

  return (
    <div className="rounded-2xl bg-orange-500/5 border border-orange-500/20 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-orange-300 mb-1">
            Payment Required
          </p>
          <p className="font-bold text-white text-sm">{eventLabel}</p>
          {registrationFee != null && (
            <p className="text-orange-200/80 text-xs mt-0.5">
              Fee: ₱{registrationFee.toLocaleString()}
            </p>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-white/40 hover:text-white transition-colors shrink-0"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => void handlePayOnline()}
          disabled={payOnlineLoading}
          className="bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white font-black py-2.5 px-4 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
        >
          {payOnlineLoading ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Redirecting…
            </>
          ) : (
            "Pay Online"
          )}
        </button>
        <button
          type="button"
          onClick={() => setShowGCashModal(true)}
          className="bg-[#1a2540] hover:bg-[#1e2d50] border border-orange-500/20 text-orange-200 font-black py-2.5 px-4 rounded-xl text-sm transition-colors"
        >
          Cash / GCash
        </button>
      </div>

      {payOnlineError && (
        <p className="text-red-400 text-xs bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
          {payOnlineError}
        </p>
      )}

      {paymentInstructions && (
        <div className="border-t border-orange-500/15 pt-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-[#687FA3] mb-2">
            Manual Payment
          </p>
          <pre className="text-xs text-white/70 whitespace-pre-wrap font-sans leading-relaxed">
            {paymentInstructions}
          </pre>
        </div>
      )}

      {showGCashModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60 cursor-pointer"
            onClick={() => setShowGCashModal(false)}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-sm bg-[#162032] border border-[#687FA3]/20 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-orange-400 mb-1">
                  Cash / GCash Payment
                </p>
                <p className="text-sm font-bold text-white">
                  Send payment to Robin
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowGCashModal(false)}
                className="text-white/40 hover:text-white transition-colors shrink-0"
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </div>
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl px-4 py-3 text-center">
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-orange-400 mb-1">
                GCash Number
              </p>
              {/* TODO: make configurable per-event */}
              <p className="text-xl font-black text-white tracking-widest">
                +63 917 848 2217
              </p>
            </div>
            <p className="text-xs text-[#687FA3] leading-relaxed">
              Send the exact registration fee and include your name in the GCash
              message. Contact Robin directly to confirm once sent.
            </p>
            <button
              type="button"
              onClick={() => setShowGCashModal(false)}
              className="w-full bg-[#1a2540] hover:bg-[#1e2d50] border border-[#687FA3]/20 text-white/70 font-black py-2.5 px-4 rounded-xl text-sm transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
