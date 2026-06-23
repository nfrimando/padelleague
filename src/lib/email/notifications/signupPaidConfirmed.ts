import { sendEmail, NOTIFICATIONS_EMAIL } from "../send";
import { buildUnsubscribeUrl } from "../unsubscribeToken";
import { getServerServiceClient } from "@/app/api/_lib/supabase";
import { SITE_URL } from "@/lib/siteConfig";

type SignupPaidConfirmedData = {
  playerId: number;
  playerEmail: string;
  playerName: string | null;
  playerNickname: string | null;
  eventId: number;
  eventName: string | null;
};

function displayName(name: string | null, nickname: string | null): string {
  return nickname ?? name ?? "there";
}

function buildEmailHtml({
  recipientName,
  eventName,
  eventUrl,
  unsubscribeUrl,
}: {
  recipientName: string;
  eventName: string;
  eventUrl: string;
  unsubscribeUrl: string;
}): string {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <h2 style="margin-bottom: 4px;">Payment Confirmed</h2>
      <p style="color: #555; margin-top: 0;">Hi ${recipientName},</p>
      <p style="color: #374151;">
        You have successfully paid and signed up for <strong>${eventName}</strong>.
      </p>

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
        View event
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

export async function notifySignupPaidConfirmed(data: SignupPaidConfirmedData): Promise<void> {
  const { playerId, playerEmail, playerName, playerNickname, eventId, eventName } = data;

  const supabase = getServerServiceClient();
  const { data: player } = await supabase
    .from("players")
    .select("is_notifications_subscribed")
    .eq("player_id", playerId)
    .maybeSingle();

  if (player?.is_notifications_subscribed === false) return;

  const { data: prefRow } = await supabase
    .from("player_notification_preferences")
    .select("subscribed")
    .eq("player_id", playerId)
    .eq("notif_type", "signup_status")
    .maybeSingle();

  if (prefRow?.subscribed === false) return;

  const recipientName = displayName(playerName, playerNickname);
  const resolvedEventName = eventName ?? "the event";
  const eventUrl = `${SITE_URL}/events/${eventId}`;
  const unsubscribeUrl = buildUnsubscribeUrl(playerId, "signup_status");

  const subject = `You're confirmed for ${resolvedEventName}`;
  const html = buildEmailHtml({
    recipientName,
    eventName: resolvedEventName,
    eventUrl,
    unsubscribeUrl,
  });

  const result = await sendEmail({ to: playerEmail, subject, html });
  if (!result.ok) {
    console.error(`[email] notifySignupPaidConfirmed failed for player_id=${playerId}:`, result.error);
  }
}
