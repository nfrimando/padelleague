import { sendEmail, NOTIFICATIONS_EMAIL } from "../send";
import { SITE_URL } from "@/lib/siteConfig";

type RecalibrationRequested = {
  requestId: number;
  playerName: string | null;
  playerNickname: string | null;
  currentRating: number;
};

export async function notifyRecalibrationRequested(data: RecalibrationRequested): Promise<void> {
  const to = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!to) {
    console.warn("[email] ADMIN_NOTIFICATION_EMAIL is not set — skipping notification");
    return;
  }

  const displayName = data.playerNickname ?? data.playerName ?? "Unknown player";
  const subject = `Recalibration Request: ${displayName} (#${data.requestId})`;
  const reviewUrl = `${SITE_URL}/recalibrate/${data.requestId}`;

  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <h2 style="margin-bottom: 4px;">New Recalibration Request</h2>
      <p style="color: #555; margin-top: 0;">A player has requested a rating recalibration on Padel League PH.</p>

      <table style="width: 100%; border-collapse: collapse; margin: 24px 0;">
        <tr>
          <td style="padding: 8px 0; color: #555; width: 140px;">Player</td>
          <td style="padding: 8px 0; font-weight: 600;">${data.playerName ?? "—"}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #555;">Nickname</td>
          <td style="padding: 8px 0; font-weight: 600;">${data.playerNickname ?? "—"}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #555;">Current Rating</td>
          <td style="padding: 8px 0; font-weight: 600;">${data.currentRating.toFixed(2)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #555;">Request ID</td>
          <td style="padding: 8px 0; font-weight: 600;">#${data.requestId}</td>
        </tr>
      </table>

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
        Review Request
      </a>

      <p style="margin-top: 32px; color: #aaa; font-size: 12px;">
        Padel League PH &mdash; ${NOTIFICATIONS_EMAIL}
      </p>
    </div>
  `;

  const result = await sendEmail({ to, subject, html });
  if (!result.ok) {
    console.error("[email] notifyRecalibrationRequested failed:", result.error);
  }
}
