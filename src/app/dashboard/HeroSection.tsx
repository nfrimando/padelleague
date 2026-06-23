"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Calendar, ChevronRight, Pencil } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { countryToFlag } from "@/lib/utils";
import { COUNTRY_LIST } from "@/lib/countries";
import EditProfileModal from "@/components/EditProfileModal";
import EditScheduleModal from "@/app/dashboard/EditScheduleModal";
import RecalibrationRequestModal from "@/app/dashboard/RecalibrationRequestModal";
import PendingPaymentPanel from "@/components/PendingPaymentPanel";
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
  payingSignupId: string | null;
  onPayingSignupIdChange: (id: string | null) => void;
  onRefreshSignups: () => void;
  showEditProfile?: boolean;
  adminTargetPlayerId?: number;
  onPlayerSaved?: (player: Player) => void;
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
  tooltip,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  tooltip?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 py-4 px-2">
      <span
        className={`text-3xl font-black tracking-tighter ${highlight ? "text-[#00C8DC]" : "text-white"}`}
      >
        {value}
      </span>
      <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.2em] text-[#687FA3]">
        {label}
        {tooltip && (
          <span className="relative group/tip cursor-help">
            <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-[#687FA3]/50 fill-current"><circle cx="6" cy="6" r="5.5" stroke="currentColor" strokeWidth="1" fill="none"/><text x="6" y="9" textAnchor="middle" fontSize="7" fontWeight="bold" fill="currentColor">i</text></svg>
            <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 rounded-lg bg-slate-800 border border-slate-700 px-2.5 py-2 text-[9px] font-normal normal-case tracking-normal text-slate-300 leading-relaxed opacity-0 group-hover/tip:opacity-100 transition-opacity z-20 text-center whitespace-normal">
              {tooltip}
            </span>
          </span>
        )}
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
  payingSignupId,
  onPayingSignupIdChange,
  onRefreshSignups,
  showEditProfile = false,
  adminTargetPlayerId,
  onPlayerSaved,
}: Props) {
  const [uploading, setUploading] = useState(false);
  const [localImgSrc, setLocalImgSrc] = useState<string | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [recalModalOpen, setRecalModalOpen] = useState(false);
  const [hasSchedule, setHasSchedule] = useState<boolean | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const paymentPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showEditProfile) return;
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const schedUrl = adminTargetPlayerId
        ? `/api/players/schedule-preferences?player_id=${adminTargetPlayerId}`
        : "/api/players/schedule-preferences";
      const res = await fetch(schedUrl, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return;
      const json = (await res.json()) as { schedule?: { day_of_week: number; start_hour: number }[] };
      setHasSchedule((json.schedule ?? []).length > 0);
    })();
  }, [showEditProfile, player.player_id, adminTargetPlayerId]);

  async function handleAvatarUpload(file: File) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/players/avatar", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: form,
      });
      const json = await res.json();
      if (json.imageUrl) setLocalImgSrc(json.imageUrl);
    } catch (err) {
      console.error("[avatar] upload failed", err);
    } finally {
      setUploading(false);
    }
  }

  const signedUpEventIds = new Set(signups.map((s) => s.event_id));
  const hasPendingPayment = signups.some((s) => s.status === "pending_payment");
  // Hide played chips when any signup is pending payment — pay now takes priority
  const playedOnlyEventIds = hasPendingPayment
    ? []
    : matchEventIds.filter((id) => !signedUpEventIds.has(id));

  const displayRating =
    currentRating !== null
      ? currentRating.toFixed(2)
      : player.latest_rating != null
        ? Number(player.latest_rating).toFixed(2)
        : null;

  const imgSrc = localImgSrc ?? player.image_link ?? avatarUrl ?? null;
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
    ? (signups.find((s) => s.id === payingSignupId) ?? null)
    : null;

  useEffect(() => {
    if (payingSignup && paymentPanelRef.current) {
      paymentPanelRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [payingSignup]);

  function handleCheckPaymentStatus() {
    onRefreshSignups();
  }

  return (
    <div className="bg-[#162032] border border-[#687FA3]/10 sm:rounded-3xl overflow-hidden">
      {/* ── Player identity row ── */}
      <div className="px-6 pt-6 pb-5 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
        <div className="shrink-0">
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleAvatarUpload(file);
                e.target.value = "";
              }}
            />
            <div
              className="relative group cursor-pointer w-16 h-16"
              onClick={() => fileInputRef.current?.click()}
            >
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
              <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                {uploading ? (
                  <svg
                    className="w-6 h-6 text-white animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"
                    />
                  </svg>
                ) : (
                  <svg
                    className="w-6 h-6 text-white"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                )}
              </div>
            </div>
          </>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[#687FA3] text-[10px] font-black uppercase tracking-[0.3em] mb-1">
            Player Dashboard
          </p>
          <h1 className="text-2xl sm:text-3xl font-black italic uppercase tracking-tighter leading-none truncate">
            {player.name}
          </h1>
          <p className="text-[#687FA3] text-sm mt-1 flex items-center gap-1.5 flex-wrap">
            {player.nickname && (
              <span>&ldquo;{player.nickname}&rdquo;</span>
            )}
            {player.nickname && (
              <span className="text-[#687FA3]/40">·</span>
            )}
            {player.preferred_side ? (
              <span>
                {player.preferred_side.charAt(0).toUpperCase() +
                  player.preferred_side.slice(1)}{" "}
                {player.preferred_side === "both" ? "sides" : "side"}
              </span>
            ) : (
              <span className="text-xs">
                Preferred Side:{" "}
                <span className="text-red-400">Not set</span>
              </span>
            )}
          </p>
          {(player.country || (player.phone_country_code && player.phone_number)) && (
            <p className="text-[#687FA3] text-xs mt-1.5 flex items-center gap-1.5 flex-wrap">
              {player.country && (
                <span>
                  {countryToFlag(player.country)}{" "}
                  {COUNTRY_LIST.find((c) => c.code === player.country)?.name ??
                    player.country}
                </span>
              )}
              {player.country &&
                player.phone_country_code &&
                player.phone_number && (
                  <span className="text-[#687FA3]/40">·</span>
                )}
              {player.phone_country_code && player.phone_number && (
                <span>
                  {player.phone_country_code} {player.phone_number}
                </span>
              )}
            </p>
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
            {showEditProfile && !adminTargetPlayerId && (
              <button
                type="button"
                onClick={() => setRecalModalOpen(true)}
                className="mt-1.5 text-[10px] font-bold text-[#687FA3] hover:text-[#00C8DC] underline-offset-2 hover:underline transition-colors cursor-pointer"
              >
                Request Reassessment
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Pending verification banner ── */}
      {!player.is_profile_complete && (
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
          tooltip="Only completed matches are counted. Forfeited and cancelled matches are excluded."
        />
        <StatPill label="Wins" value={loading ? "…" : String(stats.wins)} />
        <StatPill label="Losses" value={loading ? "…" : String(stats.losses)} />
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
            <div
              className="flex gap-2 overflow-x-auto"
              style={{ scrollbarWidth: "none" }}
            >
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
                          onClick={() =>
                            onPayingSignupIdChange(isExpanded ? null : s.id)
                          }
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
                      {eventMap[event.event_id] ??
                        event.name ??
                        `Event ${event.event_id}`}
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
                <div ref={paymentPanelRef}>
                  <PendingPaymentPanel
                    key={payingSignup.id}
                    signupId={payingSignup.id}
                    eventLabel={eventDisplayName(
                      payingSignup.event_id,
                      eventMap,
                      payingSignup.event,
                    )}
                    registrationFee={payingSignup.event?.registration_fee}
                    paymentInstructions={payingSignup.event?.payment_instructions}
                    onClose={() => onPayingSignupIdChange(null)}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Profile link + edit ── */}
      <div className="border-t border-[#687FA3]/10 px-6 py-3 flex items-center justify-between">
        {showEditProfile ? (
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setEditModalOpen(true)}
              className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-[#687FA3] hover:text-[#00C8DC] transition-colors cursor-pointer"
            >
              <Pencil size={11} />
              Edit Profile
            </button>
            <button
              type="button"
              onClick={() => setScheduleModalOpen(true)}
              className={`inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest transition-colors cursor-pointer ${
                hasSchedule === false
                  ? "text-red-400 hover:text-red-300"
                  : "text-[#687FA3] hover:text-[#00C8DC]"
              }`}
            >
              <Calendar size={11} />
              Preferred Schedule
            </button>
          </div>
        ) : (
          <span />
        )}
        <Link
          href={`/players/${encodeURIComponent(String(player.player_id))}`}
          className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-widest text-[#687FA3] hover:text-[#00C8DC] transition-colors"
        >
          Public profile <ChevronRight size={12} />
        </Link>
      </div>

      {/* ── Edit profile modal ── */}
      {showEditProfile && (
        <EditProfileModal
          player={player}
          adminTargetPlayerId={adminTargetPlayerId}
          isOpen={editModalOpen}
          onClose={() => setEditModalOpen(false)}
          onSaved={(updated) => {
            setEditModalOpen(false);
            onPlayerSaved?.(updated);
          }}
        />
      )}

      {/* ── Edit schedule modal ── */}
      {showEditProfile && (
        <EditScheduleModal
          playerId={Number(player.player_id)}
          adminTargetPlayerId={adminTargetPlayerId}
          isOpen={scheduleModalOpen}
          onClose={() => setScheduleModalOpen(false)}
          onSaved={() => { setScheduleModalOpen(false); setHasSchedule(true); }}
        />
      )}

      {/* ── Recalibration request modal ── */}
      {showEditProfile && !adminTargetPlayerId && (
        <RecalibrationRequestModal
          isOpen={recalModalOpen}
          onClose={() => setRecalModalOpen(false)}
        />
      )}

    </div>
  );
}
