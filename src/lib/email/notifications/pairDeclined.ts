import { displayName, sendPairEmail } from "./_pairEmail";

type PairDeclinedData = {
  initiatorPlayerId: number;
  initiatorEmail: string;
  initiatorName: string | null;
  initiatorNickname: string | null;
  partnerName: string | null;
  partnerNickname: string | null;
  eventId: number;
  eventName: string | null;
};

/** Sent to the initiator when their invitee declines. */
export async function notifyPairDeclined(data: PairDeclinedData): Promise<void> {
  const partner = displayName(data.partnerName, data.partnerNickname, "Your invitee");
  const eventName = data.eventName ?? "an event";

  await sendPairEmail({
    notifierName: "notifyPairDeclined",
    playerId: data.initiatorPlayerId,
    playerEmail: data.initiatorEmail,
    recipientName: displayName(data.initiatorName, data.initiatorNickname),
    subject: `${partner} can't partner for ${eventName}`,
    heading: "Your partner invite was declined",
    bodyHtml: `
      <p style="color: #374151;">
        <strong>${partner}</strong> declined your partner invite for <strong>${eventName}</strong>.
      </p>
      <p style="color: #374151;">
        You're still signed up &mdash; you're now marked as looking for a partner, so the host can pair you up, or you can invite someone else.
      </p>
    `,
    ctaLabel: "Invite someone else",
    eventId: data.eventId,
  });
}
