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
 *
 * The duo ladder's invite/accept/decline/dissolve mail reuses the same shell with
 * `notifType: "ladder_duo_updates"` and a `ctaUrl` pointing at /ladder.
 */

type PairNotifType = "partner_invite" | "ladder_duo_updates";
const DEFAULT_NOTIF_TYPE: PairNotifType = "partner_invite";

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
  ctaUrl,
  unsubscribeUrl,
}: {
  heading: string;
  recipientName: string;
  bodyHtml: string;
  ctaLabel: string;
  ctaUrl: string;
  unsubscribeUrl: string;
}): string {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <h2 style="margin-bottom: 4px;">${heading}</h2>
      <p style="color: #555; margin-top: 0;">Hi ${recipientName},</p>
      ${bodyHtml}

      <a
        href="${ctaUrl}"
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

/** Returns false when the recipient has opted out of this category of pairing mail. */
async function isSubscribed(playerId: number, notifType: PairNotifType): Promise<boolean> {
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
    .eq("notif_type", notifType)
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
  ctaUrl,
  notifType = DEFAULT_NOTIF_TYPE,
}: {
  notifierName: string;
  playerId: number;
  playerEmail: string;
  recipientName: string;
  subject: string;
  heading: string;
  bodyHtml: string;
  ctaLabel: string;
  /** Event the CTA links to. Ignored when `ctaUrl` is given. */
  eventId?: number;
  /** Absolute CTA link; defaults to the event page. */
  ctaUrl?: string;
  notifType?: PairNotifType;
}): Promise<void> {
  if (!(await isSubscribed(playerId, notifType))) return;

  const html = buildEmailHtml({
    heading,
    recipientName,
    bodyHtml,
    ctaLabel,
    ctaUrl: ctaUrl ?? (eventId != null ? `${SITE_URL}/events/${eventId}` : SITE_URL),
    unsubscribeUrl: buildUnsubscribeUrl(playerId, notifType),
  });

  const result = await sendEmail({ to: playerEmail, subject, html });
  if (!result.ok) {
    console.error(`[email] ${notifierName} failed for player_id=${playerId}:`, result.error);
  }
}
