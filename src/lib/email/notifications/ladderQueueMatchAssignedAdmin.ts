import { sendEmail, NOTIFICATIONS_EMAIL } from "../send";
import { SITE_URL } from "@/lib/siteConfig";
import { formatPlayBy } from "@/lib/ladder/ladderQueueShared";

type Data = {
  mode: "solo" | "duo";
  matchId: number;
  tierName: string;
  // "A & B" per team; for duo matches, the duo name.
  team1Label: string;
  team2Label: string;
  playByAt: string | null;
};

// Tells the admin a queue (solo or duo) just formed a match. Admin-only, so no preferences or
// unsubscribe footer — same as the other admin notifications.
export async function notifyAdminLadderQueueMatchAssigned(data: Data): Promise<void> {
  const to = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!to) {
    console.warn("[email] ADMIN_NOTIFICATION_EMAIL is not set — skipping notification");
    return;
  }

  const isDuo = data.mode === "duo";
  const subject = `${isDuo ? "Duo" : "Ladder"} Queue Match #${data.matchId}: ${data.team1Label} vs ${data.team2Label}`;
  const adminUrl = `${SITE_URL}/admin?tab=${isDuo ? "LADDER_DUOS" : "LADDER_QUEUE"}`;
  const playBy = formatPlayBy(data.playByAt);

  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <h2 style="margin-bottom: 4px;">${isDuo ? "Duo" : "Ladder"} Queue Match Assigned</h2>
      <p style="color: #555; margin-top: 0;">The ${isDuo ? "duo " : ""}queue just formed a match.</p>

      <table style="width: 100%; border-collapse: collapse; margin: 24px 0;">
        <tr>
          <td style="padding: 8px 0; color: #555; width: 140px;">Match</td>
          <td style="padding: 8px 0; font-weight: 600;">#${data.matchId}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #555;">Tier</td>
          <td style="padding: 8px 0; font-weight: 600;">${data.tierName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #555;">Team 1</td>
          <td style="padding: 8px 0; font-weight: 600;">${data.team1Label}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #555;">Team 2</td>
          <td style="padding: 8px 0; font-weight: 600;">${data.team2Label}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #555;">Play by</td>
          <td style="padding: 8px 0; font-weight: 600;">${playBy || "—"}</td>
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
        View in Admin Panel
      </a>

      <p style="margin-top: 32px; color: #aaa; font-size: 12px;">
        Padel League PH &mdash; ${NOTIFICATIONS_EMAIL}
      </p>
    </div>
  `;

  const result = await sendEmail({ to, subject, html });
  if (!result.ok) {
    console.error("[email] notifyAdminLadderQueueMatchAssigned failed:", result.error);
  }
}
