import { resend } from "./client";

const DEFAULT_FROM = "Padel League PH <notifications@padelsense.app>";

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
  const { error } = await resend.emails.send({ from, to, subject, html });
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
