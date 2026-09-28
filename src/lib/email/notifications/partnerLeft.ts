import { displayName, sendPairEmail } from "./_pairEmail";

type PartnerLeftData = {
  playerId: number;
  playerEmail: string;
  playerName: string | null;
  playerNickname: string | null;
  partnerName: string | null;
  partnerNickname: string | null;
  eventId: number;
  eventName: string | null;
  /** true when the partner withdrew entirely, false when they only unpaired */
  withdrew: boolean;
};

/** Sent to the remaining half when a confirmed pair ends. */
export async function notifyPartnerLeft(data: PartnerLeftData): Promise<void> {
  const partner = displayName(data.partnerName, data.partnerNickname, "Your partner");
  const eventName = data.eventName ?? "an event";
  const what = data.withdrew ? "withdrew from" : "ended your pair for";

  await sendPairEmail({
    notifierName: "notifyPartnerLeft",
    playerId: data.playerId,
    playerEmail: data.playerEmail,
    recipientName: displayName(data.playerName, data.playerNickname),
    subject: `${partner} ${what} ${eventName} — you need a new partner`,
    heading: "You need a new partner",
    bodyHtml: `
      <p style="color: #374151;">
        <strong>${partner}</strong> ${what} <strong>${eventName}</strong>.
      </p>
      <p style="color: #374151;">
        Your own spot is unchanged &mdash; you're now marked as looking for a partner, so the host can pair you up, or you can invite someone yourself.
      </p>
    `,
    ctaLabel: "Find a partner",
    eventId: data.eventId,
  });
}
