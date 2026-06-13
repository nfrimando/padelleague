import { sendEmail, NOTIFICATIONS_EMAIL } from "../send";
import { buildUnsubscribeUrl } from "../unsubscribeToken";
import { getServerServiceClient } from "@/app/api/_lib/supabase";

type RecruitInvitationData = {
  referrerPlayerId: number;
  referrerEmail: string;
  referrerName: string | null;
  applicantName: string;
  signupId: string;
};

function buildEmailHtml({
  referrerName,
  applicantName,
  recruitUrl,
  unsubscribeAllUrl,
}: {
  referrerName: string;
  applicantName: string;
  recruitUrl: string;
  unsubscribeAllUrl: string;
}): string {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <h2 style="margin-bottom: 4px;">You've been named as a reference</h2>
      <p style="color: #555; margin-top: 0;">Hi ${referrerName},</p>
      <p style="color: #374151;">
        <strong>${applicantName}</strong> has applied to join Padel League PH and listed you as
        someone they've played with. We'd like you to assess their skill level so we can
        assign them an appropriate initial rating.
      </p>

      <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 24px 0;">
        <p style="margin: 0 0 6px 0; color: #555; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">New Recruit</p>
        <p style="margin: 0; font-size: 20px; font-weight: 700; color: #1a1a1a;">${applicantName}</p>
      </div>

      <p style="color: #374151;">
        Click below to view their profile and submit your assessment. Only your rating is required —
        notes are optional.
      </p>

      <a
        href="${recruitUrl}"
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
        Assess ${applicantName}
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

export async function notifyRecruitInvitation(data: RecruitInvitationData): Promise<void> {
  const { referrerPlayerId, referrerEmail, referrerName, applicantName, signupId } = data;

  const supabase = getServerServiceClient();
  const { data: player } = await supabase
    .from("players")
    .select("is_notifications_subscribed")
    .eq("player_id", referrerPlayerId)
    .maybeSingle();

  if (player?.is_notifications_subscribed === false) return;

  const displayName = referrerName ?? "Member";
  const recruitUrl = `https://www.padelph.com/recruit/${signupId}`;
  const unsubscribeAllUrl = buildUnsubscribeUrl(referrerPlayerId, "all");

  const subject = `Padel League PH – Assess New Recruit: ${applicantName}`;
  const html = buildEmailHtml({
    referrerName: displayName,
    applicantName,
    recruitUrl,
    unsubscribeAllUrl,
  });

  const result = await sendEmail({ to: referrerEmail, subject, html });
  if (!result.ok) {
    console.error(
      `[email] notifyRecruitInvitation failed for referrer_id=${referrerPlayerId}:`,
      result.error,
    );
  }
}
