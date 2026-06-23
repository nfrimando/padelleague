import { sendEmail, NOTIFICATIONS_EMAIL } from "../send";
import { SITE_URL } from "@/lib/siteConfig";

type ProposedEvent = {
  name: string;
  startDate: string;
  proposerName: string | null;
  proposerNickname: string | null;
};

export async function notifyNewEventProposed(event: ProposedEvent): Promise<void> {
  const to = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!to) {
    console.warn("[email] ADMIN_NOTIFICATION_EMAIL is not set — skipping notification");
    return;
  }

  const proposerDisplay = event.proposerName ?? "Unknown";
  const subject = `New Event Proposed: ${event.name} by ${proposerDisplay}`;
  const adminUrl = `${SITE_URL}/admin?tab=EVENTS`;

  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <h2 style="margin-bottom: 4px;">New Event Proposed</h2>
      <p style="color: #555; margin-top: 0;">A member just proposed a new event for Padel League PH.</p>

      <table style="width: 100%; border-collapse: collapse; margin: 24px 0;">
        <tr>
          <td style="padding: 8px 0; color: #555; width: 120px;">Event Name</td>
          <td style="padding: 8px 0; font-weight: 600;">${event.name}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #555;">Start Date</td>
          <td style="padding: 8px 0; font-weight: 600;">${event.startDate}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #555;">Proposed By</td>
          <td style="padding: 8px 0; font-weight: 600;">${event.proposerName ?? "—"}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #555;">Nickname</td>
          <td style="padding: 8px 0; font-weight: 600;">${event.proposerNickname ?? "—"}</td>
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
    console.error("[email] notifyNewEventProposed failed:", result.error);
  }
}
