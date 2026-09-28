"use client";

import Link from "next/link";
import PlayerCard from "@/components/PlayerCard";
import PendingPaymentPanel from "@/components/PendingPaymentPanel";
import {
  describeViewerSignupState,
  type ViewerSignupState,
} from "@/lib/eventSignupStatus";
import type { Event, PairPartnerView } from "@/lib/types";
import type { EventSignupStatus } from "@/lib/eventSignupStatus";

export type ViewerSignupInfo = {
  id: string | null;
  status: EventSignupStatus;
  looking_for_partner: boolean;
  pair: PairPartnerView | null;
};

type Props = {
  event: Event;
  signupMode: "individual" | "paired";
  viewerSignup: ViewerSignupInfo | null;
  viewerIncomingInvite: PairPartnerView | null;
  /** the partner's own signup state, when the viewer is in a confirmed pair */
  partnerStatus?: { status: EventSignupStatus; paid: boolean } | null;
  isSignedIn: boolean;
  isLinked: boolean;
  isVerified: boolean;
  isManager: boolean;
  loading: boolean;
  busy: boolean;
  error: string | null;
  onSignupSolo: () => void;
  onOpenPartnerPicker: () => void;
  onAcceptInvite: (pairId: string) => void;
  onDeclineInvite: (pairId: string) => void;
  onCancelPair: (pairId: string) => void;
  onWithdraw: () => void;
};

const PRIMARY_BTN =
  "w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-base font-black text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer";
const PRIMARY_CYAN_BTN =
  "w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-base font-black text-slate-900 bg-[#00C8DC] hover:bg-[#00b5c8] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer";
const GHOST_BTN =
  "w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-300 bg-slate-800/60 border border-slate-700 hover:border-slate-500 hover:text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer";

/** Per-state border so the card reads at a glance before any text is parsed. */
function cardBorderClass(state: ViewerSignupState): string {
  switch (state.kind) {
    case "accepted":
      return "border-emerald-500/40";
    case "pending_payment":
      return "border-orange-500/40";
    case "invite_received":
      return "border-[#00C8DC]/40";
    case "solo_looking":
      return "border-violet-500/30";
    case "applied":
    case "invite_sent":
    case "waitlisted":
    case "draft":
      return "border-amber-500/30";
    default:
      return "border-[#687FA3]/20";
  }
}

function formatFee(fee: number | null | undefined): string | null {
  if (fee == null || fee <= 0) return null;
  return `₱${Number(fee).toLocaleString()}`;
}

function partnerLabel(pair: PairPartnerView | null): string | null {
  if (!pair?.partner) return null;
  return pair.partner.nickname ?? pair.partner.name ?? null;
}

function partnerChip(status: EventSignupStatus, paid: boolean): {
  label: string;
  cls: string;
} {
  if (status === "accepted" && paid) {
    return { label: "Paid", cls: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" };
  }
  if (status === "accepted") {
    return { label: "Confirmed", cls: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" };
  }
  if (status === "pending_payment") {
    return { label: "Unpaid", cls: "bg-orange-500/10 border-orange-500/30 text-orange-300" };
  }
  if (status === "cancelled") {
    return { label: "Withdrawn", cls: "bg-red-500/10 border-red-500/30 text-red-300" };
  }
  return { label: "Awaiting host", cls: "bg-amber-500/10 border-amber-500/30 text-amber-300" };
}

/** Computes the shared state both this card and the mobile sticky bar render from. */
export function resolveSignupState(props: {
  event: Event;
  signupMode: "individual" | "paired";
  viewerSignup: ViewerSignupInfo | null;
  viewerIncomingInvite: PairPartnerView | null;
  isSignedIn: boolean;
  isLinked: boolean;
  isVerified: boolean;
}): ViewerSignupState {
  const { event, signupMode, viewerSignup, viewerIncomingInvite } = props;
  const deadline = event.signup_deadline;
  // Compare date-only strings so a deadline isn't "passed" earlier in the day.
  const deadlinePassed = deadline
    ? deadline < new Date().toISOString().slice(0, 10)
    : false;

  return describeViewerSignupState({
    signupMode,
    isSignedIn: props.isSignedIn,
    isLinked: props.isLinked,
    isVerified: props.isVerified,
    isDraft: event.visibility === "draft",
    registrationOpen: event.registration_status === "open",
    signupDeadlinePassed: deadlinePassed,
    signupStatus: viewerSignup?.status ?? null,
    lookingForPartner: viewerSignup?.looking_for_partner ?? false,
    pair: viewerSignup?.pair
      ? {
          status: viewerSignup.pair.status,
          role: viewerSignup.pair.role,
          partnerName: partnerLabel(viewerSignup.pair),
        }
      : null,
    incomingInviteFrom: partnerLabel(viewerIncomingInvite),
    feeLabel: event.requires_payment === false
      ? null
      : formatFee(event.registration_fee),
  });
}

export default function EventSignupCta({
  event,
  signupMode,
  viewerSignup,
  viewerIncomingInvite,
  partnerStatus,
  isSignedIn,
  isLinked,
  isVerified,
  isManager,
  loading,
  busy,
  error,
  onSignupSolo,
  onOpenPartnerPicker,
  onAcceptInvite,
  onDeclineInvite,
  onCancelPair,
  onWithdraw,
}: Props) {
  const state = resolveSignupState({
    event,
    signupMode,
    viewerSignup,
    viewerIncomingInvite,
    isSignedIn,
    isLinked,
    isVerified,
  });

  const isPaired = signupMode === "paired";
  const pair = viewerSignup?.pair ?? null;
  const confirmedPartner = pair?.status === "accepted" ? pair : null;
  const feeLabel =
    event.requires_payment === false ? null : formatFee(event.registration_fee);

  // The shell stays mounted while loading so the page never jumps.
  if (loading) {
    return (
      <div className="rounded-2xl border border-[#687FA3]/20 bg-[#0E1523] px-4 py-4 sm:px-5 space-y-3">
        <div className="h-6 w-40 rounded-full bg-slate-800 animate-pulse" />
        <div className="h-4 w-56 rounded bg-slate-800/70 animate-pulse" />
        <div className="h-12 w-full sm:w-44 rounded-xl bg-slate-800/70 animate-pulse" />
      </div>
    );
  }

  const deadlineNote =
    event.signup_deadline && !state.isSignedUp && !state.actionsSuppressed
      ? `Signups close ${new Date(event.signup_deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
      : null;

  return (
    <div
      className={`rounded-2xl border bg-[#0E1523] px-4 py-4 sm:px-5 space-y-3 ${cardBorderClass(state)}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-black uppercase tracking-wide ${state.pillClass}`}
        >
          {state.pillLabel}
        </span>
        {isPaired && (
          <span className="inline-flex items-center rounded-full border border-[#00C8DC]/30 bg-[#00C8DC]/5 px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#00C8DC]">
            Paired Event
          </span>
        )}
        {isManager && (
          <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-400">
            You host this event
          </span>
        )}
      </div>

      <div className="space-y-1">
        <p className="text-base sm:text-lg font-bold text-slate-100 leading-snug">
          {state.headline}
        </p>
        {state.sub && (
          <p className="text-sm text-[#687FA3] leading-relaxed">{state.sub}</p>
        )}
        {deadlineNote && (
          <p className="text-xs text-slate-500">
            {[feeLabel, deadlineNote].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>

      {/* Who invited the viewer, so they know who they're answering. */}
      {state.kind === "invite_received" && viewerIncomingInvite?.partner && (
        <div className="rounded-xl border border-[#00C8DC]/25 bg-[#00C8DC]/5 p-2">
          <PlayerCard
            player={{
              player_id: viewerIncomingInvite.partner.player_id,
              name: viewerIncomingInvite.partner.name ?? "Unknown",
              nickname: viewerIncomingInvite.partner.nickname ?? "",
              image_link: viewerIncomingInvite.partner.image_link,
              latest_rating: viewerIncomingInvite.partner.latest_rating ?? null,
            }}
            size="sm"
            showLatestRating
          />
        </div>
      )}

      {/* The confirmed partner, with their own progress through the event. */}
      {confirmedPartner?.partner && (
        <div className="rounded-xl border border-[#00C8DC]/25 bg-[#00C8DC]/5 p-2 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-[#00C8DC]">
              Your Partner
            </span>
            {partnerStatus && (
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${partnerChip(partnerStatus.status, partnerStatus.paid).cls}`}
              >
                {partnerChip(partnerStatus.status, partnerStatus.paid).label}
              </span>
            )}
          </div>
          <PlayerCard
            player={{
              player_id: confirmedPartner.partner.player_id,
              name: confirmedPartner.partner.name ?? "Unknown",
              nickname: confirmedPartner.partner.nickname ?? "",
              image_link: confirmedPartner.partner.image_link,
              latest_rating: confirmedPartner.partner.latest_rating ?? null,
            }}
            size="sm"
            showLatestRating
          />
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-400">
          {error}
        </p>
      )}

      {/* Payment sits inside the card so there's one place to act. */}
      {state.kind === "pending_payment" && viewerSignup?.id && (
        <PendingPaymentPanel
          signupId={viewerSignup.id}
          eventLabel={event.name ?? `Event #${event.event_id}`}
          registrationFee={event.registration_fee}
          paymentInstructions={event.payment_instructions}
        />
      )}

      {/* Actions */}
      {state.kind === "invite_received" && viewerIncomingInvite && !state.actionsSuppressed && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onAcceptInvite(viewerIncomingInvite.pair_id)}
            className={PRIMARY_CYAN_BTN}
          >
            {busy ? "Working…" : "Accept & Sign Up"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onDeclineInvite(viewerIncomingInvite.pair_id)}
            className={GHOST_BTN}
          >
            Decline
          </button>
        </div>
      )}

      {state.kind === "not_signed_up" && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          {isPaired ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={onOpenPartnerPicker}
                className={PRIMARY_BTN}
              >
                Sign Up With a Partner
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onSignupSolo}
                className={GHOST_BTN}
              >
                {busy ? "Working…" : "Sign up solo (find me a partner)"}
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={onSignupSolo}
              className={PRIMARY_BTN}
            >
              {busy ? "Signing up…" : "Sign Me Up"}
            </button>
          )}
        </div>
      )}

      {state.kind === "not_signed_in" && !state.actionsSuppressed && (
        <Link
          href={`/register?eventId=${event.event_id}`}
          className={PRIMARY_BTN}
        >
          Sign in to sign up
        </Link>
      )}

      {state.kind === "no_profile" && (
        <Link href="/join" className={PRIMARY_BTN}>
          Get verified
        </Link>
      )}

      {state.kind === "solo_looking" && !state.actionsSuppressed && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onOpenPartnerPicker}
            className={PRIMARY_BTN}
          >
            Invite a Partner
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onWithdraw}
            className={GHOST_BTN}
          >
            Withdraw
          </button>
        </div>
      )}

      {state.kind === "invite_sent" && pair && (
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onCancelPair(pair.pair_id)}
            className={GHOST_BTN}
          >
            Cancel invite
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onWithdraw}
            className={GHOST_BTN}
          >
            Withdraw from event
          </button>
        </div>
      )}

      {(state.kind === "applied" ||
        state.kind === "accepted" ||
        state.kind === "waitlisted" ||
        state.kind === "pending_payment") && (
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
          {isPaired && confirmedPartner && !state.actionsSuppressed && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onCancelPair(confirmedPartner.pair_id)}
              className={GHOST_BTN}
            >
              Unpair
            </button>
          )}
          {isPaired &&
            !confirmedPartner &&
            !state.actionsSuppressed &&
            state.kind !== "pending_payment" && (
              <button
                type="button"
                disabled={busy}
                onClick={onOpenPartnerPicker}
                className={GHOST_BTN}
              >
                Invite a Partner
              </button>
            )}
          {state.canWithdraw && !state.actionsSuppressed && (
            <button
              type="button"
              disabled={busy}
              onClick={onWithdraw}
              className={GHOST_BTN}
            >
              Withdraw
            </button>
          )}
        </div>
      )}
    </div>
  );
}

type StickyBarProps = {
  state: ViewerSignupState;
  signupMode: "individual" | "paired";
  incomingInvitePairId: string | null;
  busy: boolean;
  onSignupSolo: () => void;
  onOpenPartnerPicker: () => void;
  onAcceptInvite: (pairId: string) => void;
  onScrollToCard: () => void;
};

/**
 * Mobile-only bar pinned to the bottom so the signup state and its main action stay
 * reachable however far down the page the viewer has scrolled.
 */
export function EventSignupStickyBar({
  state,
  signupMode,
  incomingInvitePairId,
  busy,
  onSignupSolo,
  onOpenPartnerPicker,
  onAcceptInvite,
  onScrollToCard,
}: StickyBarProps) {
  let action: { label: string; run: () => void; cyan?: boolean } | null = null;

  if (state.kind === "invite_received" && incomingInvitePairId && !state.actionsSuppressed) {
    action = {
      label: "Accept & Sign Up",
      run: () => onAcceptInvite(incomingInvitePairId),
      cyan: true,
    };
  } else if (state.kind === "not_signed_up") {
    action =
      signupMode === "paired"
        ? { label: "Sign Up With a Partner", run: onOpenPartnerPicker }
        : { label: "Sign Me Up", run: onSignupSolo };
  } else if (state.kind === "pending_payment") {
    action = { label: "Pay Now", run: onScrollToCard };
  } else if (state.kind === "solo_looking" && !state.actionsSuppressed) {
    action = { label: "Invite a Partner", run: onOpenPartnerPicker };
  }

  if (!action) return null;

  return (
    <div className="sm:hidden fixed bottom-0 inset-x-0 z-40 border-t border-[#687FA3]/20 bg-[#0E1523]/95 backdrop-blur px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-3">
        <span
          className={`shrink-0 inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${state.pillClass}`}
        >
          {state.pillLabel}
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={action.run}
          className={`flex-1 min-w-0 truncate rounded-xl px-4 py-3 text-sm font-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${
            action.cyan
              ? "bg-[#00C8DC] text-slate-900 hover:bg-[#00b5c8]"
              : "bg-emerald-600 text-white hover:bg-emerald-700"
          }`}
        >
          {busy ? "Working…" : action.label}
        </button>
      </div>
    </div>
  );
}
