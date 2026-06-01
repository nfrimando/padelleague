import { sendEmail } from "../send";

type PaymentCompletedData = {
  playerName: string | null;
  playerEmail: string | null;
  eventName: string | null;
  amount: number;
  method: string;
  referenceNumber?: string | null;
  source: "webhook" | "admin";
};

export async function notifyPaymentCompleted(data: PaymentCompletedData): Promise<void> {
  const to = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!to) {
    console.warn("[email] ADMIN_NOTIFICATION_EMAIL is not set — skipping notification");
    return;
  }

  const displayName = data.playerName ?? data.playerEmail ?? "Unknown";
  const sourceLabel =
    data.source === "webhook" ? "via PayMongo (webhook)" : "via Admin";
  const subject = `Payment Completed: ${displayName}`;
  const adminUrl = "https://www.padelph.com/admin?tab=MEMBERS";

  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <h2 style="margin-bottom: 4px;">Payment Completed</h2>
      <p style="color: #555; margin-top: 0;">${sourceLabel} &middot; ${displayName}</p>

      <table style="width: 100%; border-collapse: collapse; margin: 24px 0;">
        <tr>
          <td style="padding: 8px 0; color: #555; width: 140px;">Player</td>
          <td style="padding: 8px 0; font-weight: 600;">${data.playerName ?? "—"}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #555;">Email</td>
          <td style="padding: 8px 0; font-weight: 600;">${data.playerEmail ?? "—"}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #555;">Event</td>
          <td style="padding: 8px 0; font-weight: 600;">${data.eventName ?? "—"}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #555;">Amount</td>
          <td style="padding: 8px 0; font-weight: 600;">PHP ${data.amount.toLocaleString()}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #555;">Method</td>
          <td style="padding: 8px 0; font-weight: 600;">${data.method}</td>
        </tr>
        ${
          data.referenceNumber
            ? `<tr>
          <td style="padding: 8px 0; color: #555;">Reference #</td>
          <td style="padding: 8px 0; font-weight: 600;">${data.referenceNumber}</td>
        </tr>`
            : ""
        }
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
        Padel League PH &mdash; hello@padelph.com
      </p>
    </div>
  `;

  const result = await sendEmail({ to, subject, html });
  if (!result.ok) {
    console.error("[email] notifyPaymentCompleted failed:", result.error);
  }
}
