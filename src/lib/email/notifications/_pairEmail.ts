import { sendEmail, NOTIFICATIONS_EMAIL } from "../send";
import { buildUnsubscribeUrl } from "../unsubscribeToken";
import { getServerServiceClient } from "@/app/api/_lib/supabase";
import { SITE_URL } from "@/lib/siteConfig";

/**
 * Shared plumbing for the four partner-invite emails. They differ only in heading,
 * body and subject, so the preference gate and the HTML shell live here rather than
 * being copied four times.
 *
 * All four are gated on the `partner_invite` notification type, so a player can mute
 * pairing mail without losing signup-status mail.
 */

const NOTIF_TYPE = "partner_invite" as const;

export function displayName(
  name: string | null,
  nickname: string | null,
  fallback = "there",
): string {
  return nickname ?? name ?? fallback;
}

function buildEmailHtml({
  heading,
  recipientName,
  bodyHtml,
  ctaLabel,
  eventUrl,
  unsubscribeUrl,
}: {
  heading: string;
  recipientName: string;
  bodyHtml: string;
  ctaLabel: string;
  eventUrl: string;
  unsubscribeUrl: string;
}): string {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <h2 style="margin-bottom: 4px;">${heading}</h2>
      <p style="color: #555; margin-top: 0;">Hi ${recipientName},</p>
      ${bodyHtml}

      <a
        href="${eventUrl}"
        style="
          display: inline-block;
          background: #16a34a;
          color: #fff;
          text-decoration: none;
          padding: 12px 24px;
          border-radius: 6px;
          font-weight: 600;
        "
      >
        ${ctaLabel}
      </a>

      <p style="margin-top: 32px; color: #aaa; font-size: 12px;">
        Padel League PH &mdash; ${NOTIFICATIONS_EMAIL}
      </p>
      <p style="margin-top: 4px; color: #aaa; font-size: 11px;">
        You're receiving this because you're a Padel League PH member.
        <a href="${unsubscribeUrl}" style="color: #aaa;">Unsubscribe</a>
      </p>
    </div>
  `;
}

/** Returns false when the recipient has opted out of partner-invite mail. */
async function isSubscribed(playerId: number): Promise<boolean> {
  const supabase = getServerServiceClient();

  const { data: player } = await supabase
    .from("players")
    .select("is_notifications_subscribed")
    .eq("player_id", playerId)
    .maybeSingle();

  if (player?.is_notifications_subscribed === false) return false;

  const { data: prefRow } = await supabase
    .from("player_notification_preferences")
    .select("subscribed")
    .eq("player_id", playerId)
    .eq("notif_type", NOTIF_TYPE)
    .maybeSingle();

  return prefRow?.subscribed !== false;
}

export async function sendPairEmail({
  notifierName,
  playerId,
  playerEmail,
  recipientName,
  subject,
  heading,
  bodyHtml,
  ctaLabel,
  eventId,
}: {
  notifierName: string;
  playerId: number;
  playerEmail: string;
  recipientName: string;
  subject: string;
  heading: string;
  bodyHtml: string;
  ctaLabel: string;
  eventId: number;
}): Promise<void> {
  if (!(await isSubscribed(playerId))) return;

  const html = buildEmailHtml({
    heading,
    recipientName,
    bodyHtml,
    ctaLabel,
    eventUrl: `${SITE_URL}/events/${eventId}`,
    unsubscribeUrl: buildUnsubscribeUrl(playerId, NOTIF_TYPE),
  });

  const result = await sendEmail({ to: playerEmail, subject, html });
  if (!result.ok) {
    console.error(`[email] ${notifierName} failed for player_id=${playerId}:`, result.error);
  }
}
