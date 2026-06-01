import { resend } from "./client";

export const NOTIFICATIONS_EMAIL = "notifications@padelsense.app";
const DEFAULT_FROM = `Padel League PH <${NOTIFICATIONS_EMAIL}>`;
// Resend rate limit is 2 req/s; enforce 1.5s minimum gap between sends globally.
const MIN_SEND_INTERVAL_MS = 1500;
let lastSendTime = 0;

type SendEmailOptions = {
  to: string;
  subject: string;
  html: string;
  from?: string;
};

type SendEmailResult = {
  ok: boolean;
  error?: string;
};

export async function sendEmail({
  to,
  subject,
  html,
  from = DEFAULT_FROM,
}: SendEmailOptions): Promise<SendEmailResult> {
  const wait = MIN_SEND_INTERVAL_MS - (Date.now() - lastSendTime);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastSendTime = Date.now();

  const { error } = await resend.emails.send({ from, to, subject, html });
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
