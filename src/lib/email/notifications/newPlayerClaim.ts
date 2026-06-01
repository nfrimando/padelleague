import { sendEmail, NOTIFICATIONS_EMAIL } from "../send";

type Claim = {
  claimantName: string | null;
  claimantEmail: string;
  playerName: string | null;
  playerNickname: string | null;
};

export async function notifyNewPlayerClaim(claim: Claim): Promise<void> {
  const to = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!to) {
    console.warn("[email] ADMIN_NOTIFICATION_EMAIL is not set — skipping notification");
    return;
  }

  const displayName = claim.claimantName ?? claim.claimantEmail ?? "Unknown";
  const subject = `New Player Claim: ${displayName}`;
  const adminUrl = "https://www.padelph.com/admin?tab=MEMBERS";

  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <h2 style="margin-bottom: 4px;">New Player Claim</h2>
      <p style="color: #555; margin-top: 0;">Someone just submitted a profile claim on Padel League PH.</p>

      <table style="width: 100%; border-collapse: collapse; margin: 24px 0;">
        <tr>
          <td style="padding: 8px 0; color: #555; width: 140px;">Claimant Name</td>
          <td style="padding: 8px 0; font-weight: 600;">${claim.claimantName ?? "—"}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #555;">Claimant Email</td>
          <td style="padding: 8px 0; font-weight: 600;">${claim.claimantEmail}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #555;">Player Name</td>
          <td style="padding: 8px 0; font-weight: 600;">${claim.playerName ?? "—"}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #555;">Nickname</td>
          <td style="padding: 8px 0; font-weight: 600;">${claim.playerNickname ?? "—"}</td>
        </tr>
      </table>

      <a
        href="${adminUrl}"
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
        Review in Admin Panel
      </a>

      <p style="margin-top: 32px; color: #aaa; font-size: 12px;">
        Padel League PH &mdash; ${NOTIFICATIONS_EMAIL}
      </p>
    </div>
  `;

  const result = await sendEmail({ to, subject, html });
  if (!result.ok) {
    console.error("[email] notifyNewPlayerClaim failed:", result.error);
  }
}
