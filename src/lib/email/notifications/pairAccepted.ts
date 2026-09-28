import { displayName, sendPairEmail } from "./_pairEmail";

type PairAcceptedData = {
  initiatorPlayerId: number;
  initiatorEmail: string;
  initiatorName: string | null;
  initiatorNickname: string | null;
  partnerName: string | null;
  partnerNickname: string | null;
  eventId: number;
  eventName: string | null;
};

/** Sent to the initiator when their invitee accepts. */
export async function notifyPairAccepted(data: PairAcceptedData): Promise<void> {
  const partner = displayName(data.partnerName, data.partnerNickname, "Your partner");
  const eventName = data.eventName ?? "an event";

  await sendPairEmail({
    notifierName: "notifyPairAccepted",
    playerId: data.initiatorPlayerId,
    playerEmail: data.initiatorEmail,
    recipientName: displayName(data.initiatorName, data.initiatorNickname),
    subject: `${partner} accepted — you're paired for ${eventName}`,
    heading: "You're paired up",
    bodyHtml: `
      <p style="color: #374151;">
        <strong>${partner}</strong> accepted your partner invite for <strong>${eventName}</strong>.
      </p>
      <p style="color: #374151;">
        You're both signed up. The host still needs to confirm your spots, and you each pay your own registration fee.
      </p>
    `,
    ctaLabel: "View event",
    eventId: data.eventId,
  });
}
