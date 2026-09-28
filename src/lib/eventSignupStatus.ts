import type { EventPairStatus } from "@/lib/types";

export type EventSignupStatus =
  | "applied"
  | "pending_payment"
  | "accepted"
  | "waitlisted"
  | "cancelled";

export function signupStatusLabel(status: EventSignupStatus): string {
  switch (status) {
    case "applied":
      return "Applied — Pending Approval";
    case "pending_payment":
      return "Payment Required";
    case "accepted":
      return "Accepted";
    case "waitlisted":
      return "Waitlisted";
    case "cancelled":
      return "Cancelled";
  }
}

export function signupStatusBadgeClass(status: EventSignupStatus): string {
  switch (status) {
    case "applied":
      return "bg-amber-500/10 border-amber-500/30 text-amber-300";
    case "pending_payment":
      return "bg-orange-500/10 border-orange-500/30 text-orange-300";
    case "accepted":
      return "bg-emerald-500/10 border-emerald-500/30 text-emerald-400";
    case "waitlisted":
      return "bg-amber-500/10 border-amber-500/30 text-amber-300";
    case "cancelled":
      return "bg-red-500/10 border-red-500/30 text-red-300";
  }
}

// ─── Paired signups ────────────────────────────────────────────────────────────


export function pairStateLabel(status: EventPairStatus): string {
  switch (status) {
    case "pending":
      return "Invite Pending";
    case "accepted":
      return "Paired";
    case "declined":
      return "Invite Declined";
    case "cancelled":
      return "Pair Cancelled";
  }
}

export function pairStateBadgeClass(status: EventPairStatus): string {
  switch (status) {
    case "pending":
      return "bg-amber-500/10 border-amber-500/30 text-amber-300";
    case "accepted":
      return "bg-[#00C8DC]/10 border-[#00C8DC]/40 text-[#00C8DC]";
    case "declined":
    case "cancelled":
      return "bg-slate-800 border-slate-700 text-slate-400";
  }
}

export const LOOKING_FOR_PARTNER_BADGE_CLASS =
  "bg-violet-500/10 border-violet-500/30 text-violet-300";

/**
 * Every distinct state the signup CTA can be in. The card, the mobile sticky bar,
 * the dashboard chips and the roster all read from `describeViewerSignupState` so
 * their wording can never drift apart.
 */
export type ViewerSignupStateKind =
  | "draft"
  | "not_signed_in"
  | "no_profile"
  | "pending_verification"
  | "closed"
  | "not_signed_up"
  | "applied"
  | "pending_payment"
  | "accepted"
  | "waitlisted"
  | "invite_received"
  | "invite_sent"
  | "solo_looking";

export type ViewerSignupStateInput = {
  signupMode: "individual" | "paired";
  isSignedIn: boolean;
  /** auth email maps to a row in `players` */
  isLinked: boolean;
  /** linked AND players.is_profile_complete */
  isVerified: boolean;
  isDraft: boolean;
  registrationOpen: boolean;
  signupDeadlinePassed: boolean;
  /** the viewer's own signup status, or null when they have none */
  signupStatus: EventSignupStatus | null;
  lookingForPartner: boolean;
  /** the viewer's live pair, from their own point of view */
  pair: {
    status: EventPairStatus;
    role: "initiator" | "invitee";
    partnerName: string | null;
  } | null;
  /** viewer has no signup yet but someone invited them to partner */
  incomingInviteFrom: string | null;
  /** formatted fee, e.g. "₱1,200" — null when the event needs no payment */
  feeLabel: string | null;
};

export type ViewerSignupState = {
  kind: ViewerSignupStateKind;
  pillLabel: string;
  pillClass: string;
  headline: string;
  sub: string | null;
  /** true once the viewer holds a live (non-cancelled) signup */
  isSignedUp: boolean;
  /** registration closed, deadline passed, or the event is still a draft */
  actionsSuppressed: boolean;
  canWithdraw: boolean;
};

const PILL_SLATE = "bg-slate-800 border-slate-700 text-slate-300";
const PILL_AMBER = "bg-amber-500/10 border-amber-500/30 text-amber-300";
const PILL_ORANGE = "bg-orange-500/10 border-orange-500/30 text-orange-300";
const PILL_EMERALD = "bg-emerald-500/10 border-emerald-500/40 text-emerald-400";
const PILL_CYAN = "bg-[#00C8DC]/10 border-[#00C8DC]/40 text-[#00C8DC]";
const PILL_VIOLET = LOOKING_FOR_PARTNER_BADGE_CLASS;

/** A signup that still holds a place (anything but cancelled). */
function isLiveSignup(status: EventSignupStatus | null): boolean {
  return status !== null && status !== "cancelled";
}

export function describeViewerSignupState(
  input: ViewerSignupStateInput,
): ViewerSignupState {
  const {
    signupMode,
    isSignedIn,
    isLinked,
    isVerified,
    isDraft,
    registrationOpen,
    signupDeadlinePassed,
    signupStatus,
    lookingForPartner,
    pair,
    incomingInviteFrom,
    feeLabel,
  } = input;

  const suppressed = !registrationOpen || signupDeadlinePassed;
  const partner = pair?.partnerName ?? "your partner";
  const feeSuffix = feeLabel ? ` You'll each pay your own ${feeLabel}.` : "";

  if (isDraft) {
    return {
      kind: "draft",
      pillLabel: "Draft",
      pillClass: PILL_AMBER,
      headline: "This event isn't published yet.",
      sub: "Signups open once an admin reviews it.",
      isSignedUp: false,
      actionsSuppressed: true,
      canWithdraw: false,
    };
  }

  // An unanswered partner invite outranks everything — it needs a reply.
  if (incomingInviteFrom && !isLiveSignup(signupStatus)) {
    return {
      kind: "invite_received",
      pillLabel: "Partner Invite",
      pillClass: PILL_CYAN,
      headline: `${incomingInviteFrom} wants you as their partner.`,
      sub: suppressed
        ? "Signups for this event are closed."
        : `Accepting signs you up for this event.${feeSuffix}`,
      isSignedUp: false,
      actionsSuppressed: suppressed,
      canWithdraw: false,
    };
  }

  if (isLiveSignup(signupStatus)) {
    switch (signupStatus) {
      case "pending_payment":
        return {
          kind: "pending_payment",
          pillLabel: "Signed Up · Payment Required",
          pillClass: PILL_ORANGE,
          headline: feeLabel
            ? `Your spot is held. Pay ${feeLabel} to confirm it.`
            : "Your spot is held. Complete payment to confirm it.",
          sub:
            signupMode === "paired" && pair?.status === "accepted"
              ? `Playing with ${partner} — your partner pays separately.`
              : null,
          isSignedUp: true,
          // Paying is always allowed, even after signups close.
          actionsSuppressed: false,
          canWithdraw: true,
        };
      case "accepted":
        return {
          kind: "accepted",
          pillLabel: "You're In",
          pillClass: PILL_EMERALD,
          headline: "You're confirmed for this event.",
          sub:
            signupMode === "paired" && pair?.status === "accepted"
              ? `Playing with ${partner}.`
              : signupMode === "paired"
                ? "You don't have a partner yet — the host will pair you up."
                : null,
          isSignedUp: true,
          actionsSuppressed: suppressed,
          canWithdraw: true,
        };
      case "waitlisted":
        return {
          kind: "waitlisted",
          pillLabel: "Waitlisted",
          pillClass: PILL_AMBER,
          headline: "You're on the waitlist.",
          sub: "The host will let you know if a spot opens up.",
          isSignedUp: true,
          actionsSuppressed: suppressed,
          canWithdraw: true,
        };
      default: {
        // applied — split three ways on pair state
        if (pair?.status === "pending" && pair.role === "initiator") {
          return {
            kind: "invite_sent",
            pillLabel: "Signed Up · Waiting On Partner",
            pillClass: PILL_AMBER,
            headline: `You're signed up. Waiting for ${partner} to accept.`,
            sub: "Your pair is confirmed once they accept. You can change partners or cancel the invite.",
            isSignedUp: true,
            actionsSuppressed: suppressed,
            canWithdraw: true,
          };
        }
        if (lookingForPartner) {
          return {
            kind: "solo_looking",
            pillLabel: "Signed Up · Looking For A Partner",
            pillClass: PILL_VIOLET,
            headline: "You're signed up solo.",
            sub: "The host can pair you up, or you can invite someone yourself.",
            isSignedUp: true,
            actionsSuppressed: suppressed,
            canWithdraw: true,
          };
        }
        return {
          kind: "applied",
          pillLabel: "Signed Up · Awaiting Host",
          pillClass: PILL_AMBER,
          headline: "You're signed up.",
          sub:
            signupMode === "paired" && pair?.status === "accepted"
              ? `Playing with ${partner}. The host hasn't confirmed your spot yet.`
              : "The host hasn't confirmed your spot yet.",
          isSignedUp: true,
          actionsSuppressed: suppressed,
          canWithdraw: true,
        };
      }
    }
  }

  // No live signup from here on.
  if (!isSignedIn) {
    return {
      kind: "not_signed_in",
      pillLabel: "Not Signed Up",
      pillClass: PILL_SLATE,
      headline: "You're not signed up for this event.",
      sub: suppressed
        ? "Signups for this event are closed."
        : "Sign in to sign up.",
      isSignedUp: false,
      actionsSuppressed: suppressed,
      canWithdraw: false,
    };
  }

  if (!isLinked) {
    return {
      kind: "no_profile",
      pillLabel: "Not Signed Up",
      pillClass: PILL_SLATE,
      headline: "You're not signed up for this event.",
      sub: "You need a verified member profile before you can sign up.",
      isSignedUp: false,
      actionsSuppressed: suppressed,
      canWithdraw: false,
    };
  }

  if (!isVerified) {
    return {
      kind: "pending_verification",
      pillLabel: "Not Signed Up",
      pillClass: PILL_SLATE,
      headline: "You're not signed up for this event.",
      sub: "Your profile is pending admin verification — you'll be able to sign up once it's approved.",
      isSignedUp: false,
      actionsSuppressed: true,
      canWithdraw: false,
    };
  }

  if (suppressed) {
    return {
      kind: "closed",
      pillLabel: "Signups Closed",
      pillClass: PILL_SLATE,
      headline: "You're not signed up, and signups are closed.",
      sub: "Message the host if you still want in.",
      isSignedUp: false,
      actionsSuppressed: true,
      canWithdraw: false,
    };
  }

  return {
    kind: "not_signed_up",
    pillLabel: "Not Signed Up",
    pillClass: PILL_SLATE,
    headline: "You're not signed up yet.",
    sub:
      signupMode === "paired"
        ? `This is a paired event — pick a partner, or sign up solo and get matched.${feeSuffix}`
        : feeLabel
          ? `Registration is ${feeLabel}.`
          : null,
    isSignedUp: false,
    actionsSuppressed: false,
    canWithdraw: false,
  };
}
