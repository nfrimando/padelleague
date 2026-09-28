"use client";

import { UserPlus } from "lucide-react";

export type PartnerInvite = {
  pair_id: string;
  event_id: number;
  event_name: string | null;
  start_date: string | null;
  registration_fee: number | null;
  initiator: {
    player_id: number;
    name: string | null;
    nickname: string | null;
    image_link: string | null;
  } | null;
};

type Props = {
  invite: PartnerInvite;
  busy: boolean;
  onAccept: (invite: PartnerInvite) => void;
  onDecline: (invite: PartnerInvite) => void;
};

/**
 * Dashboard prompt for an unanswered partner invite. Rendered above the
 * pending-payment banner because it's the most time-sensitive thing on the page.
 */
export default function PartnerInvitePrompt({
  invite,
  busy,
  onAccept,
  onDecline,
}: Props) {
  const who =
    invite.initiator?.nickname ?? invite.initiator?.name ?? "Another member";
  const eventName = invite.event_name ?? `Event #${invite.event_id}`;
  const fee =
    invite.registration_fee != null && invite.registration_fee > 0
      ? `₱${Number(invite.registration_fee).toLocaleString()}`
      : null;

  return (
    <div className="bg-[#00C8DC]/10 border border-[#00C8DC]/25 sm:rounded-2xl px-4 sm:px-5 py-3 space-y-3">
      <div className="flex items-center gap-3 min-w-0">
        {invite.initiator?.image_link &&
        invite.initiator.image_link !== "null" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={invite.initiator.image_link}
            alt={who}
            className="w-8 h-8 rounded-full object-cover shrink-0"
          />
        ) : (
          <UserPlus size={16} className="text-[#00C8DC] shrink-0" />
        )}
        <div className="min-w-0">
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#00C8DC]">
            Partner Invite
          </p>
          <p className="text-sm text-slate-200 leading-snug">
            <span className="font-bold text-white">{who}</span> wants you as their
            partner for <span className="font-bold text-white">{eventName}</span>.
          </p>
          <p className="text-xs text-[#687FA3] mt-0.5">
            Accepting signs you up.
            {fee ? ` You'll each pay your own ${fee}.` : ""}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onAccept(invite)}
          className="w-full inline-flex items-center justify-center rounded-xl bg-[#00C8DC] px-4 py-2.5 text-sm font-bold text-slate-900 hover:bg-[#00b5c8] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          {busy ? "Working…" : "Accept & Sign Up"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onDecline(invite)}
          className="w-full inline-flex items-center justify-center rounded-xl border border-[#687FA3]/25 bg-[#162032] px-4 py-2.5 text-sm font-semibold text-[#687FA3] hover:border-[#687FA3]/50 hover:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          Decline
        </button>
      </div>
    </div>
  );
}
