"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Event, Player } from "@/lib/types";
import type { DashboardStats } from "@/lib/useDashboardStats";

type EventSignupRow = {
  id: string;
  event_id: number;
  status: string;
  event: {
    event_id: number;
    name?: string | null;
    start_date?: string | null;
    registration_status: "open" | "closed";
    status: "upcoming" | "ongoing" | "completed";
    registration_fee?: number | null;
    payment_instructions?: string | null;
  } | null;
};

type Props = {
  player: Player;
  avatarUrl?: string;
  currentRating: number | null;
  stats: Pick<DashboardStats, "totalMatches" | "wins" | "losses" | "winRate">;
  signups: EventSignupRow[];
  openEvents: Event[];
  eventMap: Record<number, string>;
  matchEventIds: number[];
  onRegister: (eventId: number) => void;
  registering: boolean;
  loading: boolean;
  isViewingAs?: boolean;
};

function eventDisplayName(
  eventId: number,
  eventMap: Record<number, string>,
  fallbackEvent: { name?: string | null; start_date?: string | null } | null,
): string {
  if (eventMap[eventId]) return eventMap[eventId];
  if (fallbackEvent?.name) return fallbackEvent.name;
  if (fallbackEvent?.start_date)
    return `Event ${eventId} · ${new Date(fallbackEvent.start_date).getFullYear()}`;
  return `Event ${eventId}`;
}

const STATUS_STYLES: Record<
  string,
  { label: string; cls: string; dot: string }
> = {
  applied: {
    label: "Applied",
    cls: "bg-amber-500/10 border-amber-500/30 text-amber-300",
    dot: "bg-amber-300",
  },
  pending_payment: {
    label: "Payment Required",
    cls: "bg-orange-500/10 border-orange-500/30 text-orange-300",
    dot: "bg-orange-300",
  },
  accepted: {
    label: "Accepted",
    cls: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
    dot: "bg-emerald-400",
  },
  waitlisted: {
    label: "Waitlisted",
    cls: "bg-[#687FA3]/10 border-[#687FA3]/30 text-[#687FA3]",
    dot: "bg-[#687FA3]",
  },
  cancelled: {
    label: "Cancelled",
    cls: "bg-red-500/10 border-red-500/30 text-red-400",
    dot: "bg-red-400",
  },
  played: {
    label: "Played",
    cls: "bg-[#00C8DC]/10 border-[#00C8DC]/20 text-[#00C8DC]",
    dot: "bg-[#00C8DC]",
  },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? {
    label: status,
    cls: "bg-white/5 border-white/10 text-white/50",
    dot: "bg-white/30",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${s.cls}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
      {s.label}
    </span>
  );
}

function StatPill({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 py-4 px-2">
      <span
        className={`text-3xl font-black tracking-tighter ${highlight ? "text-[#00C8DC]" : "text-white"}`}
      >
        {value}
      </span>
      <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[#687FA3]">
        {label}
      </span>
    </div>
  );
}

export default function HeroSection({
  player,
  avatarUrl,
  currentRating,
  stats,
  signups,
  openEvents,
  eventMap,
  matchEventIds,
  onRegister,
  registering,
  loading,
  isViewingAs = false,
}: Props) {
  const [payingSignupId, setPayingSignupId] = useState<string | null>(null);
  const [payOnlineLoading, setPayOnlineLoading] = useState(false);
  const [payOnlineError, setPayOnlineError] = useState<string | null>(null);

  const signedUpEventIds = new Set(signups.map((s) => s.event_id));
  const playedOnlyEventIds = matchEventIds.filter(
    (id) => !signedUpEventIds.has(id),
  );

  const displayRating =
    currentRating !== null
      ? currentRating.toFixed(2)
      : player.latest_rating != null
        ? Number(player.latest_rating).toFixed(2)
        : null;

  const imgSrc = avatarUrl ?? player.image_link ?? null;
  const initials = player.name
    ? player.name
        .split(" ")
        .slice(0, 2)
        .map((w) => w[0])
        .join("")
        .toUpperCase()
    : "?";

  const hasEvents =
    signups.length > 0 ||
    playedOnlyEventIds.length > 0 ||
    openEvents.length > 0;

  const payingSignup = payingSignupId
    ? signups.find((s) => s.id === payingSignupId) ?? null
    : null;

  async function handlePayOnline() {
    if (!payingSignupId) return;
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
        body: JSON.stringify({ signup_id: payingSignupId }),
      });

      const json = (await res.json()) as { link_url?: string; error?: string };

      if (!res.ok || !json.link_url) {
        setPayOnlineError(json.error ?? "Failed to create payment link.");
        return;
      }

      window.open(json.link_url, "_blank", "noopener,noreferrer");
    } catch {
      setPayOnlineError("Network error. Please try again.");
    } finally {
      setPayOnlineLoading(false);
    }
  }

  return (
    <div className="bg-[#162032] border border-[#687FA3]/10 sm:rounded-3xl overflow-hidden">
      {/* ── Player identity row ── */}
      <div className="px-6 pt-6 pb-5 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
        <div className="shrink-0">
          {imgSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imgSrc}
              alt={player.name}
              className="w-16 h-16 rounded-full border-2 border-[#00C8DC]/30 shadow-lg object-cover"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-[#1a2540] border border-[#687FA3]/20 flex items-center justify-center">
              <span className="text-xl font-black text-[#687FA3]">
                {initials}
              </span>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[#687FA3] text-[10px] font-black uppercase tracking-[0.3em] mb-1">
            Player Dashboard
          </p>
          <h1 className="text-2xl sm:text-3xl font-black italic uppercase tracking-tighter leading-none truncate">
            {player.name}
          </h1>
          {player.nickname && (
            <p className="text-[#687FA3] text-sm mt-1">&ldquo;{player.nickname}&rdquo;</p>
          )}
        </div>

        {displayRating && (
          <div className="shrink-0 text-right sm:text-center">
            <p className="text-[#00C8DC] text-3xl font-black tracking-tighter leading-none">
              {displayRating}
            </p>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#687FA3] mt-1">
              Current Rating
            </p>
          </div>
        )}
      </div>

      {/* ── Pending verification banner ── */}
      {!player.is_profile_complete && !isViewingAs && (
        <div className="mx-6 mb-4 bg-amber-500/5 border border-amber-500/20 rounded-xl px-4 py-3 flex gap-3">
          <span className="text-lg">⏳</span>
          <div>
            <p className="font-bold text-amber-300 text-sm">
              Pending Verification
            </p>
            <p className="text-amber-200/60 text-xs leading-relaxed mt-0.5">
              Your account is awaiting admin approval. No action needed on your
              end.
            </p>
          </div>
        </div>
      )}

      {/* ── Stat row ── */}
      <div className="border-t border-[#687FA3]/10 grid grid-cols-4 divide-x divide-[#687FA3]/10">
        <StatPill
          label="Matches"
          value={loading ? "…" : String(stats.totalMatches)}
        />
        <StatPill
          label="Wins"
          value={loading ? "…" : String(stats.wins)}
        />
        <StatPill
          label="Losses"
          value={loading ? "…" : String(stats.losses)}
        />
        <StatPill
          label="Win Rate"
          value={loading ? "…" : `${stats.winRate}%`}
          highlight
        />
      </div>

      {/* ── Events ── */}
      {(hasEvents || loading) && (
        <div className="border-t border-[#687FA3]/10 px-6 py-4 space-y-3">
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#687FA3]">
            Events
          </p>

          {loading ? (
            <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-8 w-36 rounded-full bg-[#1a2540] animate-pulse shrink-0"
                />
              ))}
            </div>
          ) : (
            <>
              <div
                className="flex gap-2 overflow-x-auto"
                style={{ scrollbarWidth: "none" }}
              >
                {/* Signup events */}
                {signups.map((s) => {
                  const label = eventDisplayName(s.event_id, eventMap, s.event);
                  const isPendingPayment = s.status === "pending_payment";
                  const isExpanded = payingSignupId === s.id;

                  return (
                    <div
                      key={s.id}
                      className={`shrink-0 flex items-center gap-2 border rounded-full pl-3 pr-2 py-1.5 transition-colors ${
                        isExpanded
                          ? "bg-orange-500/10 border-orange-500/30"
                          : "bg-[#1a2540] border-[#687FA3]/10"
                      }`}
                    >
                      <span className="text-xs font-bold text-white/80 whitespace-nowrap">
                        {label}
                      </span>
                      {isPendingPayment ? (
                        <button
                          type="button"
                          onClick={() => {
                            setPayingSignupId(isExpanded ? null : s.id);
                            setPayOnlineError(null);
                          }}
                          className="flex items-center gap-0.5 bg-orange-500 hover:bg-orange-400 text-white font-black text-[9px] uppercase tracking-widest px-2.5 py-1 rounded-full transition-all shrink-0"
                        >
                          {isExpanded ? "Close" : "Pay Now"}
                        </button>
                      ) : (
                        <StatusBadge status={s.status} />
                      )}
                    </div>
                  );
                })}

                {/* Match-only events (no signup) */}
                {playedOnlyEventIds.map((id) => (
                  <div
                    key={id}
                    className="shrink-0 flex items-center gap-2 bg-[#1a2540] border border-[#687FA3]/10 rounded-full pl-3 pr-2 py-1.5"
                  >
                    <span className="text-xs font-bold text-white/80 whitespace-nowrap">
                      {eventMap[id] ?? `Event ${id}`}
                    </span>
                    <StatusBadge status="played" />
                  </div>
                ))}

                {/* Open events (not yet signed up) */}
                {openEvents.map((event) => (
                  <div
                    key={event.event_id}
                    className="shrink-0 flex items-center gap-2 bg-[#00C8DC]/5 border border-[#00C8DC]/20 rounded-full pl-3 pr-2 py-1.5"
                  >
                    <span className="text-xs font-bold text-white/80 whitespace-nowrap">
                      {eventMap[event.event_id] ?? event.name ?? `Event ${event.event_id}`}
                    </span>
                    {!player.is_profile_complete ? (
                      <span className="text-amber-400/70 text-[9px] font-black uppercase whitespace-nowrap">
                        Verify first
                      </span>
                    ) : (
                      <button
                        onClick={() => void onRegister(event.event_id)}
                        disabled={registering}
                        className="flex items-center gap-0.5 bg-[#00C8DC] hover:bg-white disabled:opacity-50 text-[#0E1523] font-black text-[9px] uppercase tracking-widest px-2.5 py-1 rounded-full transition-all shrink-0"
                      >
                        Join <ChevronRight size={10} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Payment panel — shown below chips when pending_payment is expanded */}
              {payingSignup && (
                <div className="rounded-2xl bg-orange-500/5 border border-orange-500/20 p-4 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-orange-300 mb-1">
                        Payment Required
                      </p>
                      <p className="font-bold text-white text-sm">
                        {eventDisplayName(payingSignup.event_id, eventMap, payingSignup.event)}
                      </p>
                      {payingSignup.event?.registration_fee != null && (
                        <p className="text-orange-200/80 text-xs mt-0.5">
                          Fee: ₱{payingSignup.event.registration_fee.toLocaleString()}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setPayingSignupId(null);
                        setPayOnlineError(null);
                      }}
                      className="text-white/40 hover:text-white transition-colors shrink-0"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handlePayOnline()}
                    disabled={payOnlineLoading}
                    className="w-full bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white font-black py-2.5 px-4 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
                  >
                    {payOnlineLoading ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Generating link…
                      </>
                    ) : (
                      "Pay Online"
                    )}
                  </button>

                  {payOnlineError && (
                    <p className="text-red-400 text-xs bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                      {payOnlineError}
                    </p>
                  )}

                  {payingSignup.event?.payment_instructions && (
                    <div className="border-t border-orange-500/15 pt-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-[#687FA3] mb-2">
                        Manual Payment
                      </p>
                      <pre className="text-xs text-white/70 whitespace-pre-wrap font-sans leading-relaxed">
                        {payingSignup.event.payment_instructions}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Profile link ── */}
      <div className="border-t border-[#687FA3]/10 px-6 py-3 flex justify-end">
        <Link
          href={`/players/${encodeURIComponent(String(player.player_id))}`}
          className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-widest text-[#687FA3] hover:text-[#00C8DC] transition-colors"
        >
          Full profile <ChevronRight size={12} />
        </Link>
      </div>
    </div>
  );
}
