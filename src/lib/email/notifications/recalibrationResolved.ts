import { sendEmail, NOTIFICATIONS_EMAIL } from "../send";
import { buildUnsubscribeUrl } from "../unsubscribeToken";
import { getServerServiceClient } from "@/app/api/_lib/supabase";
import { SITE_URL } from "@/lib/siteConfig";

type RecalibrationResolved = {
  playerId: number;
  playerName: string | null;
  playerNickname: string | null;
  outcome: "retained" | "updated" | "cancelled";
  oldRating: number;
  newRating: number | null; // present only when outcome === "updated"
};

function displayName(name: string | null, nickname: string | null): string {
  return nickname ?? name ?? "Player";
}

function buildEmailHtml({
  recipientName,
  outcome,
  oldRating,
  newRating,
  profileUrl,
  unsubscribeAllUrl,
}: {
  recipientName: string;
  outcome: "retained" | "updated" | "cancelled";
  oldRating: number;
  newRating: number | null;
  profileUrl: string;
  unsubscribeAllUrl: string;
}): string {
  const bodyByOutcome: Record<typeof outcome, string> = {
    retained: `
      <p style="color: #374151;">The committee reviewed your respondents' assessments and decided to
      <strong>retain your current rating of ${oldRating.toFixed(2)}</strong>.</p>
    `,
    updated: `
      <p style="color: #374151;">The committee reviewed your respondents' assessments and has
      <strong>updated your rating from ${oldRating.toFixed(2)} to ${(newRating ?? oldRating).toFixed(2)}</strong>.</p>
    `,
    cancelled: `
      <p style="color: #374151;">Your recalibration request has been <strong>cancelled</strong> by the league
      committee. Your rating remains unchanged at ${oldRating.toFixed(2)}.</p>
    `,
  };

  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <h2 style="margin-bottom: 4px;">Your Recalibration Result</h2>
      <p style="color: #555; margin-top: 0;">Hi ${recipientName}, here's the outcome of your recalibration request.</p>

      ${bodyByOutcome[outcome]}

      <a
        href="${profileUrl}"
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
        View your profile
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

export async function notifyRecalibrationResolved(data: RecalibrationResolved): Promise<void> {
  const { playerId, playerName, playerNickname, outcome, oldRating, newRating } = data;

  const supabase = getServerServiceClient();
  const { data: player } = await supabase
    .from("players")
    .select("email, is_notifications_subscribed")
    .eq("player_id", playerId)
    .maybeSingle();

  if (!player?.email) return;
  if (player.is_notifications_subscribed === false) return;

  const recipientName = displayName(playerName, playerNickname);
  const profileUrl = `${SITE_URL}/players/${playerId}`;
  const unsubscribeAllUrl = buildUnsubscribeUrl(playerId, "all");
  const today = new Date().toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const subjectByOutcome: Record<typeof outcome, string> = {
    retained: `Your Rating Recalibration Result, ${recipientName} — ${today}`,
    updated: `Your Rating Has Been Updated, ${recipientName} — ${today}`,
    cancelled: `Your Recalibration Request Was Cancelled, ${recipientName} — ${today}`,
  };

  const html = buildEmailHtml({
    recipientName,
    outcome,
    oldRating,
    newRating,
    profileUrl,
    unsubscribeAllUrl,
  });

  const result = await sendEmail({ to: player.email as string, subject: subjectByOutcome[outcome], html });
  if (!result.ok) {
    console.error(`[email] notifyRecalibrationResolved failed for player_id=${playerId}:`, result.error);
  }
}
