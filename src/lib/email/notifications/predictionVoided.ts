import { sendEmail, NOTIFICATIONS_EMAIL } from "../send";
import { buildUnsubscribeUrl } from "../unsubscribeToken";
import { fetchPlayerPrefsMap } from "@/lib/notificationPreferences";
import { getServerServiceClient } from "@/app/api/_lib/supabase";
import { SITE_URL } from "@/lib/siteConfig";
import type { VoidedPredictor } from "@/lib/predictions/voidMatchPredictions";

type MatchContext = {
  matchId: number;
  dateLocal: string | null;
  team1Label: string;
  team2Label: string;
};

function displayName(p: VoidedPredictor): string {
  return p.nickname ?? p.name ?? "Player";
}

function buildEmailHtml({
  recipientName,
  team1Label,
  team2Label,
  dateLocal,
  predictUrl,
  unsubscribePredictionsUrl,
  unsubscribeAllUrl,
}: {
  recipientName: string;
  team1Label: string;
  team2Label: string;
  dateLocal: string | null;
  predictUrl: string;
  unsubscribePredictionsUrl: string;
  unsubscribeAllUrl: string;
}): string {
  const datePart = dateLocal ? ` on ${dateLocal}` : "";
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <h2 style="margin-bottom: 4px;">Your Prediction Was Voided</h2>
      <p style="color: #555; margin-top: 0;">Hi ${recipientName}, the roster for a match you predicted on has changed, so your pick has been cancelled.</p>

      <table style="width: 100%; border-collapse: collapse; margin: 24px 0;">
        <tr>
          <td style="padding: 8px 0; color: #555; width: 140px;">Match</td>
          <td style="padding: 8px 0; font-weight: 600;">${team1Label} vs ${team2Label}${datePart}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #555;">Reason</td>
          <td style="padding: 8px 0;">Roster change — one or more players were updated</td>
        </tr>
      </table>

      <p style="color: #555;">You can head back to the predict page to make a fresh pick with the updated lineup.</p>

      <a
        href="${predictUrl}"
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
        Pick again
      </a>

      <p style="margin-top: 32px; color: #aaa; font-size: 12px;">
        Padel League PH &mdash; ${NOTIFICATIONS_EMAIL}
      </p>
      <p style="margin-top: 8px; color: #aaa; font-size: 11px;">
        You're receiving this because you're a Padel League PH member.
        <a href="${unsubscribePredictionsUrl}" style="color: #aaa;">Unsubscribe from prediction emails</a>
        &nbsp;&middot;&nbsp;
        <a href="${unsubscribeAllUrl}" style="color: #aaa;">Unsubscribe from all emails</a>
      </p>
    </div>
  `;
}

export async function notifyPredictionsVoided(
  predictors: VoidedPredictor[],
  match: MatchContext,
): Promise<void> {
  if (predictors.length === 0) return;

  const playerIds = predictors
    .map((p) => p.playerId)
    .filter((id): id is number => id !== null);

  const supabase = getServerServiceClient();
  const prefsMap = await fetchPlayerPrefsMap(supabase, playerIds);

  // Fetch master subscription status for all predictors
  const subMap = new Map<string, boolean>();
  if (playerIds.length > 0) {
    const { data: playerRows } = await supabase
      .from("players")
      .select("player_id,is_notifications_subscribed")
      .in("player_id", playerIds);
    for (const row of playerRows ?? []) {
      subMap.set(String(row.player_id), row.is_notifications_subscribed !== false);
    }
  }

  const predictUrl = `${SITE_URL}/predict`;
  const datePart = match.dateLocal ? ` on ${match.dateLocal}` : "";
  const matchLabel = `${match.team1Label} vs ${match.team2Label}${datePart}`;

  for (const predictor of predictors) {
    const dn = displayName(predictor);

    if (!predictor.email) continue;

    const masterSubscribed = predictor.playerId !== null
      ? subMap.get(String(predictor.playerId)) !== false
      : true;
    if (!masterSubscribed) continue;

    if (predictor.playerId !== null) {
      const prefs = prefsMap.get(predictor.playerId);
      if (prefs?.predictions === false) continue;
    }

    const subject = `Your pick on ${matchLabel} was voided — ${dn}`;

    const html = buildEmailHtml({
      recipientName: dn,
      team1Label: match.team1Label,
      team2Label: match.team2Label,
      dateLocal: match.dateLocal,
      predictUrl,
      unsubscribePredictionsUrl: predictor.playerId !== null
        ? buildUnsubscribeUrl(predictor.playerId, "predictions")
        : predictUrl,
      unsubscribeAllUrl: predictor.playerId !== null
        ? buildUnsubscribeUrl(predictor.playerId, "all")
        : predictUrl,
    });

    const result = await sendEmail({ to: predictor.email, subject, html });
    if (!result.ok) {
      console.error(`[email] notifyPredictionsVoided failed for email=${predictor.email}:`, result.error);
    }
  }
}
