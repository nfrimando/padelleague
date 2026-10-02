"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import PlayerSlotPicker from "@/components/PlayerSlotPicker";
import { usePlayers } from "@/lib/usePlayers";
import { usePlayerSearch } from "@/lib/usePlayerSearch";
import { usePlayerMatchCounts } from "@/lib/usePlayerMatchCounts";
import type { EventRestrictions, Player } from "@/lib/types";

type Props = {
  eventName: string;
  registrationFee?: number | null;
  requiresPayment?: boolean;
  restrictions?: EventRestrictions | null;
  /** the viewer's own rating, for the advisory pair-average note */
  viewerRating?: number | null;
  /** hidden from the picker: the viewer, plus anyone already paired or signed up */
  excludePlayerIds: number[];
  /** true when the viewer already has a signup and is only adding a partner */
  alreadySignedUp: boolean;
  loading: boolean;
  error: string | null;
  onConfirmPartner: (partnerPlayerId: number) => void;
  onConfirmSolo: () => void;
  onCancel: () => void;
};

type Tab = "partner" | "solo";

export default function EventPairSignupModal({
  eventName,
  registrationFee,
  requiresPayment = true,
  restrictions,
  viewerRating,
  excludePlayerIds,
  alreadySignedUp,
  loading,
  error,
  onConfirmPartner,
  onConfirmSolo,
  onCancel,
}: Props) {
  const [tab, setTab] = useState<Tab>("partner");
  const [search, setSearch] = useState("");
  const [partner, setPartner] = useState<Player | null>(null);

  const { players } = usePlayers({
    orderByName: true,
    select: "player_id, name, nickname, image_link",
  });

  // Filter before searching so excluded players never surface as suggestions.
  const excluded = useMemo(
    () => new Set(excludePlayerIds.map((id) => String(id))),
    [excludePlayerIds],
  );
  const selectable = useMemo(
    () => players.filter((p) => !excluded.has(String(p.player_id))),
    [players, excluded],
  );
  const suggestions = usePlayerSearch(selectable, search);

  // `players` has no rating column — the partner's current rating comes from the ledger.
  const partnerIds = useMemo(() => (partner ? [partner.player_id] : []), [partner]);
  const { latestRatings } = usePlayerMatchCounts(partnerIds);
  const partnerRating = partner ? (latestRatings[String(partner.player_id)] ?? null) : null;

  const feeLabel =
    requiresPayment && registrationFee != null && registrationFee > 0
      ? `₱${Number(registrationFee).toLocaleString()}`
      : null;

  // Advisory only — rating restrictions never block a signup anywhere in the app.
  const ratingNote = useMemo(() => {
    if (viewerRating == null || partnerRating == null) return null;
    const min = restrictions?.min_rating;
    const max = restrictions?.max_rating;
    if (min == null && max == null) return null;
    const avg = (Number(viewerRating) + Number(partnerRating)) / 2;
    if (min != null && avg < min) {
      return `Your pair averages ${avg.toFixed(2)}, below this event's suggested ${min}. You can still sign up — the host decides.`;
    }
    if (max != null && avg > max) {
      return `Your pair averages ${avg.toFixed(2)}, above this event's suggested ${max}. You can still sign up — the host decides.`;
    }
    return null;
  }, [partnerRating, viewerRating, restrictions]);

  const tabCls = (active: boolean) =>
    `flex-1 rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wide transition-colors cursor-pointer ${
      active
        ? "bg-[#162032] text-slate-100 border border-[#687FA3]/30"
        : "text-[#687FA3] border border-transparent hover:text-slate-300"
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-pointer"
        onClick={onCancel}
      />
      <div className="relative z-10 w-full max-w-md bg-[#0E1523] border border-[#687FA3]/20 rounded-2xl shadow-2xl p-5 sm:p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 mb-4">
          <h2 className="text-sm font-black uppercase tracking-widest text-[#687FA3]">
            {alreadySignedUp ? "Invite a Partner" : "Sign Up as a Pair"}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 text-[#687FA3]/40 hover:text-slate-300 transition-colors cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>

        <p className="text-sm text-slate-300 leading-relaxed mb-4">
          <span className="font-bold text-white">{eventName}</span> is a paired event.
        </p>

        {!alreadySignedUp && (
          <div className="flex gap-2 mb-4">
            <button type="button" className={tabCls(tab === "partner")} onClick={() => setTab("partner")}>
              With a partner
            </button>
            <button type="button" className={tabCls(tab === "solo")} onClick={() => setTab("solo")}>
              Solo
            </button>
          </div>
        )}

        {tab === "partner" || alreadySignedUp ? (
          <div className="space-y-3">
            <PlayerSlotPicker
              label="Your Partner"
              suggestions={suggestions}
              selectedPlayer={partner}
              search={search}
              onSearchChange={setSearch}
              onSelect={setPartner}
              onClear={() => {
                setPartner(null);
                setSearch("");
              }}
              placeholder="Search members by name or nickname..."
            />

            <p className="text-xs text-[#687FA3] leading-relaxed">
              Your partner gets an email and must accept before your pair is confirmed.
              {feeLabel ? ` You'll each pay your own ${feeLabel}.` : ""}
            </p>
            <p className="text-xs text-slate-500 leading-relaxed">
              Members only — if your partner isn&apos;t a member yet, sign up solo and the
              host can pair you up.
            </p>

            {ratingNote && (
              <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                {ratingNote}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-slate-300 leading-relaxed">
              You&apos;ll be signed up on your own and marked as looking for a partner.
            </p>
            <p className="text-xs text-[#687FA3] leading-relaxed">
              The host can pair you with another solo player, or you can invite someone
              later from this page.
            </p>
          </div>
        )}

        {error && (
          <p className="mt-4 text-red-400 text-xs bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-[#687FA3] bg-[#162032] border border-[#687FA3]/20 hover:border-[#687FA3]/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            Cancel
          </button>
          {tab === "partner" || alreadySignedUp ? (
            <button
              type="button"
              onClick={() => partner && onConfirmPartner(Number(partner.player_id))}
              disabled={loading || !partner}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-900 bg-[#00C8DC] hover:bg-[#00b5c8] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              {loading
                ? "Sending…"
                : alreadySignedUp
                  ? "Send Invite"
                  : "Send Invite & Sign Up"}
            </button>
          ) : (
            <button
              type="button"
              onClick={onConfirmSolo}
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-900 bg-[#00C8DC] hover:bg-[#00b5c8] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              {loading ? "Signing up…" : "Sign Up Solo"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
