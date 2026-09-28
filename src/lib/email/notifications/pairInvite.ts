import { displayName, sendPairEmail } from "./_pairEmail";

type PairInviteData = {
  inviteePlayerId: number;
  inviteeEmail: string;
  inviteeName: string | null;
  inviteeNickname: string | null;
  initiatorName: string | null;
  initiatorNickname: string | null;
  eventId: number;
  eventName: string | null;
  registrationFee: number | null;
};

/** Sent to the invitee when someone picks them as their partner. */
export async function notifyPairInvite(data: PairInviteData): Promise<void> {
  const initiator = displayName(data.initiatorName, data.initiatorNickname, "A member");
  const eventName = data.eventName ?? "an event";
  const feeLine =
    data.registrationFee != null
      ? `<p style="color: #374151;">You'll each pay your own registration fee of <strong>PHP ${Number(data.registrationFee).toLocaleString()}</strong>.</p>`
      : "";

  await sendPairEmail({
    notifierName: "notifyPairInvite",
    playerId: data.inviteePlayerId,
    playerEmail: data.inviteeEmail,
    recipientName: displayName(data.inviteeName, data.inviteeNickname),
    // The initiator's name and the event name keep separate invites out of one thread.
    subject: `${initiator} wants you as their partner for ${eventName}`,
    heading: "You've got a partner invite",
    bodyHtml: `
      <p style="color: #374151;">
        <strong>${initiator}</strong> signed up for <strong>${eventName}</strong> and picked you as their partner.
      </p>
      <p style="color: #374151;">
        Accepting signs you up for the event too. Your pair isn't confirmed until you accept.
      </p>
      ${feeLine}
    `,
    ctaLabel: "Accept or decline",
    eventId: data.eventId,
  });
}
