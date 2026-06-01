import { sendEmail, NOTIFICATIONS_EMAIL } from "../send";
import { buildUnsubscribeUrl } from "../unsubscribeToken";
import { getServerServiceClient } from "@/app/api/_lib/supabase";

type ClaimApprovedData = {
  playerId: number;
  playerName: string | null;
  playerNickname: string | null;
  claimedByEmail: string;
  claimedByName: string | null;
};

function displayName(name: string | null, nickname: string | null): string {
  return nickname ?? name ?? "Player";
}

function buildEmailHtml({
  recipientName,
  profileDisplayName,
  profileUrl,
  unsubscribeAllUrl,
}: {
  recipientName: string;
  profileDisplayName: string;
  profileUrl: string;
  unsubscribeAllUrl: string;
}): string {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <h2 style="margin-bottom: 4px;">Profile Approved</h2>
      <p style="color: #555; margin-top: 0;">Hi ${recipientName}, your profile claim has been reviewed and approved.</p>

      <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 24px 0;">
        <p style="margin: 0 0 6px 0; color: #555; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">Profile Linked</p>
        <p style="margin: 0; font-size: 20px; font-weight: 700; color: #1a1a1a;">${profileDisplayName}</p>
      </div>

      <p style="color: #374151;">You can now log in and view your match history, ratings, and stats on your profile.</p>

      <a
        href="${profileUrl}"
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
        View your profile
      </a>

      <p style="margin-top: 32px; color: #aaa; font-size: 12px;">
        Padel League PH &mdash; ${NOTIFICATIONS_EMAIL}
      </p>
      <p style="margin-top: 4px; color: #aaa; font-size: 11px;">
        You're receiving this because you're a Padel League PH member.
        <a href="${unsubscribeAllUrl}" style="color: #aaa;">Unsubscribe</a>
      </p>
    </div>
  `;
}

export async function notifyClaimApproved(data: ClaimApprovedData): Promise<void> {
  const { playerId, playerName, playerNickname, claimedByEmail, claimedByName } = data;

  const supabase = getServerServiceClient();
  const { data: player } = await supabase
    .from("players")
    .select("is_notifications_subscribed")
    .eq("player_id", playerId)
    .maybeSingle();

  if (player?.is_notifications_subscribed === false) return;

  const profileDisplayName = displayName(playerName, playerNickname);
  const recipientName = claimedByName ?? profileDisplayName;
  const profileUrl = `https://www.padelph.com/players/${playerId}`;
  const unsubscribeAllUrl = buildUnsubscribeUrl(playerId, "all");

  const subject = `Your Padel League PH profile has been approved, ${recipientName}!`;
  const html = buildEmailHtml({ recipientName, profileDisplayName, profileUrl, unsubscribeAllUrl });

  const result = await sendEmail({ to: claimedByEmail, subject, html });
  if (!result.ok) {
    console.error(`[email] notifyClaimApproved failed for player_id=${playerId}:`, result.error);
  }
}
