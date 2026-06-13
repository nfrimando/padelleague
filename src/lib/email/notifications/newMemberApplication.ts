import { sendEmail, NOTIFICATIONS_EMAIL } from "../send";
import { SITE_URL } from "@/lib/siteConfig";

type Applicant = {
  name: string | null;
  nickname: string | null;
  email: string | null;
  contact: string | null;
};

export async function notifyNewMemberApplication(applicant: Applicant): Promise<void> {
  const to = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!to) {
    console.warn("[email] ADMIN_NOTIFICATION_EMAIL is not set — skipping notification");
    return;
  }

  const displayName = applicant.name ?? applicant.email ?? "Unknown";
  const subject = `New Member Application: ${displayName}`;
  const adminUrl = `${SITE_URL}/admin?tab=MEMBERS`;

  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <h2 style="margin-bottom: 4px;">New Member Application</h2>
      <p style="color: #555; margin-top: 0;">Someone just applied to join Padel League PH.</p>

      <table style="width: 100%; border-collapse: collapse; margin: 24px 0;">
        <tr>
          <td style="padding: 8px 0; color: #555; width: 120px;">Name</td>
          <td style="padding: 8px 0; font-weight: 600;">${applicant.name ?? "—"}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #555;">Nickname</td>
          <td style="padding: 8px 0; font-weight: 600;">${applicant.nickname ?? "—"}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #555;">Email</td>
          <td style="padding: 8px 0; font-weight: 600;">${applicant.email ?? "—"}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #555;">Contact</td>
          <td style="padding: 8px 0; font-weight: 600;">${applicant.contact ?? "—"}</td>
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
    console.error("[email] notifyNewMemberApplication failed:", result.error);
  }
}
