import { sendEmail, NOTIFICATIONS_EMAIL } from "../send";
import { buildUnsubscribeUrl } from "../unsubscribeToken";
import { getServerServiceClient } from "@/app/api/_lib/supabase";
import { SITE_URL } from "@/lib/siteConfig";

type RecalibrationCalibratorAdded = {
  calibratorPlayerId: number;
  requestId: number;
  requestorName: string | null;
  requestorNickname: string | null;
  ratingAtRequest: number;
};

function buildEmailHtml({
  calibratorName,
  requestorDisplayName,
  ratingAtRequest,
  reviewUrl,
  unsubscribeAllUrl,
}: {
  calibratorName: string;
  requestorDisplayName: string;
  ratingAtRequest: number;
  reviewUrl: string;
  unsubscribeAllUrl: string;
}): string {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <h2 style="margin-bottom: 4px;">You've Been Added as a Calibrator</h2>
      <p style="color: #555; margin-top: 0;">Hi ${calibratorName}, you've been asked to help recalibrate a member's rating on Padel League PH.</p>

      <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 24px 0;">
        <p style="margin: 0 0 6px 0; color: #555; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">Player</p>
        <p style="margin: 0; font-size: 20px; font-weight: 700; color: #1a1a1a;">${requestorDisplayName}</p>
        <p style="margin: 6px 0 0 0; color: #555; font-size: 13px;">Current rating: ${ratingAtRequest.toFixed(2)}</p>
      </div>

      <p style="color: #374151;">
        Click below to view their profile and submit your independent rating assessment. Only your
        rating is required &mdash; notes are optional.
      </p>

      <a
        href="${reviewUrl}"
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
        Submit Your Assessment
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

export async function notifyRecalibrationCalibratorAdded(
  data: RecalibrationCalibratorAdded,
): Promise<void> {
  const { calibratorPlayerId, requestId, requestorName, requestorNickname, ratingAtRequest } = data;

  const supabase = getServerServiceClient();
  const { data: player } = await supabase
    .from("players")
    .select("name, nickname, email, is_notifications_subscribed")
    .eq("player_id", calibratorPlayerId)
    .maybeSingle();

  if (!player?.email) return;
  if (player.is_notifications_subscribed === false) return;

  const calibratorName = (player.nickname as string | null) ?? (player.name as string | null) ?? "Member";
  const requestorDisplayName = requestorNickname ?? requestorName ?? "Unknown player";
  const reviewUrl = `${SITE_URL}/recalibrate/${requestId}`;
  const unsubscribeAllUrl = buildUnsubscribeUrl(calibratorPlayerId, "all");

  const subject = `Help Recalibrate ${requestorDisplayName}'s Rating (#${requestId})`;
  const html = buildEmailHtml({
    calibratorName,
    requestorDisplayName,
    ratingAtRequest,
    reviewUrl,
    unsubscribeAllUrl,
  });

  const result = await sendEmail({ to: player.email as string, subject, html });
  if (!result.ok) {
    console.error(
      `[email] notifyRecalibrationCalibratorAdded failed for player_id=${calibratorPlayerId}:`,
      result.error,
    );
  }
}
