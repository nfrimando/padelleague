import { getServerServiceClient } from "@/app/api/_lib/supabase";
import { SITE_URL } from "@/lib/siteConfig";
import { displayName, sendPairEmail } from "./_pairEmail";

// Duo ladder formation mail: invite, accepted, declined, dissolved. All gated on the
// `ladder_duo_updates` preference and built on the shared pair-email shell. Every subject carries the
// other player's name so separate duos never collapse into one Gmail thread.

const DUO_LADDER_URL = `${SITE_URL}/ladder?mode=duo`;

type PlayerRow = {
  player_id: number;
  name: string | null;
  nickname: string | null;
  email: string | null;
};

async function loadPlayer(playerId: number): Promise<PlayerRow | null> {
  const { data } = await getServerServiceClient()
    .from("players")
    .select("player_id, name, nickname, email")
    .eq("player_id", playerId)
    .maybeSingle();
  return (data as PlayerRow | null) ?? null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function sendToPlayer(
  notifierName: string,
  recipientId: number,
  build: (recipient: PlayerRow) => {
    subject: string;
    heading: string;
    bodyHtml: string;
    ctaLabel: string;
  },
): Promise<void> {
  const recipient = await loadPlayer(recipientId);
  if (!recipient?.email) return;
  const content = build(recipient);
  await sendPairEmail({
    notifierName,
    playerId: recipient.player_id,
    playerEmail: recipient.email,
    recipientName: displayName(recipient.name, recipient.nickname),
    ctaUrl: DUO_LADDER_URL,
    notifType: "ladder_duo_updates",
    ...content,
  });
}

/** To the invitee when someone asks them to form a duo. */
export async function notifyDuoInvite(data: {
  inviterId: number;
  inviteeId: number;
  duoName: string | null;
}): Promise<void> {
  const inviter = await loadPlayer(data.inviterId);
  const inviterRaw = displayName(inviter?.name ?? null, inviter?.nickname ?? null, "A member");
  const inviterName = escapeHtml(inviterRaw);
  const nameLine = data.duoName
    ? `<p style="color: #374151;">They've suggested the duo name <strong>${escapeHtml(data.duoName)}</strong>.</p>`
    : "";

  await sendToPlayer("notifyDuoInvite", data.inviteeId, () => ({
    subject: `${inviterRaw} wants to form a ladder duo with you`,
    heading: "You've got a duo invite",
    bodyHtml: `
      <p style="color: #374151;">
        <strong>${inviterName}</strong> wants to team up with you on the <strong>Duo Ladder</strong> —
        a separate ladder where you two queue together and climb as a pair.
      </p>
      ${nameLine}
      <p style="color: #374151;">
        Duo matches only move your duo's tier and stars, not your solo ladder standing.
      </p>
    `,
    ctaLabel: "Accept or decline",
  }));
}

/** To the inviter when the invitee accepts. */
export async function notifyDuoAccepted(data: {
  inviterId: number;
  inviteeId: number;
  tierName: string | null;
}): Promise<void> {
  const invitee = await loadPlayer(data.inviteeId);
  const inviteeRaw = displayName(invitee?.name ?? null, invitee?.nickname ?? null, "Your partner");
  const inviteeName = escapeHtml(inviteeRaw);
  const tierLine = data.tierName
    ? `<p style="color: #374151;">Your duo starts this cycle in <strong>${escapeHtml(data.tierName)}</strong>.</p>`
    : "";

  await sendToPlayer("notifyDuoAccepted", data.inviterId, () => ({
    subject: `${inviteeRaw} accepted your ladder duo invite`,
    heading: "Your duo is set",
    bodyHtml: `
      <p style="color: #374151;">
        <strong>${inviteeName}</strong> accepted your duo invite. Either of you can now queue the duo
        for a Duo Ladder match.
      </p>
      ${tierLine}
    `,
    ctaLabel: "Queue up",
  }));
}

/** To the inviter when the invitee declines. */
export async function notifyDuoDeclined(data: { inviterId: number; inviteeId: number }): Promise<void> {
  const invitee = await loadPlayer(data.inviteeId);
  const inviteeRaw = displayName(invitee?.name ?? null, invitee?.nickname ?? null, "A member");
  const inviteeName = escapeHtml(inviteeRaw);

  await sendToPlayer("notifyDuoDeclined", data.inviterId, () => ({
    subject: `${inviteeRaw} declined your ladder duo invite`,
    heading: "Duo invite declined",
    bodyHtml: `
      <p style="color: #374151;">
        <strong>${inviteeName}</strong> declined your duo invite. You can invite someone else from the
        Duo Ladder page.
      </p>
    `,
    ctaLabel: "Find a partner",
  }));
}

/** To the other member when a duo is dissolved (by their partner or an admin). */
export async function notifyDuoDissolved(data: {
  recipientId: number;
  actorId: number | null;
  duoLabel: string;
}): Promise<void> {
  const actor = data.actorId ? await loadPlayer(data.actorId) : null;
  const actorRaw = actor ? displayName(actor.name, actor.nickname, "Your partner") : "An admin";
  const actorName = escapeHtml(actorRaw);
  const duoLabel = escapeHtml(data.duoLabel);

  await sendToPlayer("notifyDuoDissolved", data.recipientId, () => ({
    subject: `${actorRaw} dissolved your duo ${data.duoLabel}`,
    heading: "Your duo was dissolved",
    bodyHtml: `
      <p style="color: #374151;">
        <strong>${actorName}</strong> dissolved the duo <strong>${duoLabel}</strong>. Its results so
        far are kept. If you two team up again later, the duo picks up where it left off this cycle.
      </p>
    `,
    ctaLabel: "View the Duo Ladder",
  }));
}

/** To each player when an admin forms their duo directly (no invite). */
export async function notifyDuoCreatedByAdmin(data: {
  recipientId: number;
  partnerId: number;
  duoName: string | null;
  tierName: string | null;
}): Promise<void> {
  const partner = await loadPlayer(data.partnerId);
  const partnerRaw = displayName(partner?.name ?? null, partner?.nickname ?? null, "a partner");
  const partnerName = escapeHtml(partnerRaw);
  const nameLine = data.duoName
    ? ` as <strong>${escapeHtml(data.duoName)}</strong>`
    : "";
  const tierLine = data.tierName
    ? `<p style="color: #374151;">Your duo starts this cycle in <strong>${escapeHtml(data.tierName)}</strong>.</p>`
    : "";

  await sendToPlayer("notifyDuoCreatedByAdmin", data.recipientId, () => ({
    subject: `You've been paired with ${partnerRaw} on the Duo Ladder`,
    heading: "You're in a duo",
    bodyHtml: `
      <p style="color: #374151;">
        An admin has paired you with <strong>${partnerName}</strong>${nameLine} on the
        <strong>Duo Ladder</strong>. Either of you can now queue the duo for a match.
      </p>
      ${tierLine}
      <p style="color: #374151;">
        Duo matches only move your duo's tier and stars, not your solo ladder standing.
      </p>
    `,
    ctaLabel: "View the Duo Ladder",
  }));
}
