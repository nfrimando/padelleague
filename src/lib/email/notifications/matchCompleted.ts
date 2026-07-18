import { sendEmail, NOTIFICATIONS_EMAIL } from "../send";
import { buildUnsubscribeUrl } from "../unsubscribeToken";
import { fetchPlayerPrefsMap } from "@/lib/notificationPreferences";
import { getServerServiceClient } from "@/app/api/_lib/supabase";
import { SITE_URL } from "@/lib/siteConfig";

type PlayerInfo = {
  player_id: number;
  name: string | null;
  nickname: string | null;
  email: string | null;
  is_notifications_subscribed?: boolean | null;
};

type LadderProgressionEvent = {
  playerId: number;
  eventType: "match_win" | "match_loss" | "promotion" | "demotion";
  tierBeforeId: number | null;
  tierAfterId: number;
  starsBefore: number | null;
  starsAfter: number;
};

type MatchCompletedData = {
  matchId: number;
  dateLocal: string | null;
  timeLocal: string | null;
  venue: string | null;
  team1Players: [PlayerInfo, PlayerInfo];
  team2Players: [PlayerInfo, PlayerInfo];
  sets: Array<{ team_1_games: number; team_2_games: number }>;
  ratings: Array<{
    player_id: number;
    rating_pre: number;
    rating_post: number;
    result: "win" | "loss";
  }>;
  winnerTeam: 1 | 2;
  ladder?: {
    tiers: Array<{ id: number; name: string }>;
    events: LadderProgressionEvent[];
  };
};

function displayName(p: PlayerInfo): string {
  return p.nickname ?? p.name ?? "Unknown";
}

function formatRating(n: number): string {
  return n.toFixed(2);
}

function formatDelta(delta: number): string {
  return (delta >= 0 ? "+" : "") + delta.toFixed(2);
}

function buildScoreLabel(sets: Array<{ team_1_games: number; team_2_games: number }>): string {
  return sets.map((s) => `${s.team_1_games}–${s.team_2_games}`).join(", ");
}

// Mirrors LadderView.tsx's MAX_STARS — duplicated because that component is "use client"
// and can't be imported into this server-only email module.
const LADDER_MAX_STARS = 2;

function renderStars(count: number): string {
  const filled = Math.max(0, Math.min(LADDER_MAX_STARS, count));
  return "★".repeat(filled) + "☆".repeat(LADDER_MAX_STARS - filled);
}

function tierIconUrl(tierName: string): string {
  return `${SITE_URL}/ladder/${tierName.trim().toLowerCase()}.png`;
}

function tierNameById(id: number | null, tiers: Array<{ id: number; name: string }>): string {
  if (id == null) return "—";
  return tiers.find((t) => t.id === id)?.name ?? "—";
}

// Small local phrase-builder, not a reuse of src/lib/ladderEventDisplay.ts's describeLadderEvent:
// that helper pulls in a client-oriented relative-date formatter this email doesn't want, and has
// no "demotion" case.
function describeLadderProgress(
  event: LadderProgressionEvent,
  tiers: Array<{ id: number; name: string }>,
): string {
  switch (event.eventType) {
    case "promotion":
      return `Promoted to ${tierNameById(event.tierAfterId, tiers)}!`;
    case "demotion":
      return `Demoted to ${tierNameById(event.tierAfterId, tiers)}.`;
    case "match_win":
      return `${renderStars(event.starsBefore ?? 0)} → ${renderStars(event.starsAfter)} in ${tierNameById(event.tierAfterId, tiers)}`;
    case "match_loss":
      return `${renderStars(event.starsBefore ?? 0)} → ${renderStars(event.starsAfter)} in ${tierNameById(event.tierAfterId, tiers)}`;
  }
}

export function buildEmailHtml({
  recipient,
  recipientTeam,
  team1Players,
  team2Players,
  sets,
  rating,
  dateLocal,
  timeLocal,
  venue,
  dashboardUrl,
  unsubscribeMatchUrl,
  unsubscribeAllUrl,
  ladderProgress,
}: {
  recipient: PlayerInfo;
  recipientTeam: 1 | 2;
  team1Players: [PlayerInfo, PlayerInfo];
  team2Players: [PlayerInfo, PlayerInfo];
  sets: Array<{ team_1_games: number; team_2_games: number }>;
  rating: { rating_pre: number; rating_post: number; result: "win" | "loss" };
  dateLocal: string | null;
  timeLocal: string | null;
  venue: string | null;
  dashboardUrl: string;
  unsubscribeMatchUrl: string;
  unsubscribeAllUrl: string;
  ladderProgress?: {
    event: LadderProgressionEvent;
    tiers: Array<{ id: number; name: string }>;
  };
}): string {
  const isWin = rating.result === "win";
  const resultLabel = isWin ? "Win" : "Loss";
  const resultColor = isWin ? "#16a34a" : "#dc2626";

  const delta = rating.rating_post - rating.rating_pre;
  const ratingLine = `${formatRating(rating.rating_pre)} → ${formatRating(rating.rating_post)} (${formatDelta(delta)})`;

  const scoreLabel = buildScoreLabel(sets);
  const t1Name = `${displayName(team1Players[0])} & ${displayName(team1Players[1])}`;
  const t2Name = `${displayName(team2Players[0])} & ${displayName(team2Players[1])}`;
  const recipientDisplayName = displayName(recipient);

  const metaRows: string[] = [];
  if (dateLocal) {
    const timeStr = timeLocal ? ` at ${timeLocal}` : "";
    metaRows.push(`
      <tr>
        <td style="padding: 8px 0; color: #555; width: 140px;">Date</td>
        <td style="padding: 8px 0; font-weight: 600;">${dateLocal}${timeStr}</td>
      </tr>`);
  }
  if (venue) {
    metaRows.push(`
      <tr>
        <td style="padding: 8px 0; color: #555;">Venue</td>
        <td style="padding: 8px 0; font-weight: 600;">${venue}</td>
      </tr>`);
  }

  let ladderSectionHtml = "";
  if (ladderProgress) {
    const { event, tiers } = ladderProgress;
    const tierChanged = event.tierBeforeId !== event.tierAfterId;
    const afterTierName = tierNameById(event.tierAfterId, tiers);
    const description = describeLadderProgress(event, tiers);

    const iconsCell = tierChanged
      ? `
        <img src="${tierIconUrl(tierNameById(event.tierBeforeId, tiers))}" width="32" height="32" alt="${tierNameById(event.tierBeforeId, tiers)}" style="vertical-align: middle;" />
        <span style="margin: 0 6px; color: #9ca3af; font-size: 16px;">&rarr;</span>
        <img src="${tierIconUrl(afterTierName)}" width="32" height="32" alt="${afterTierName}" style="vertical-align: middle;" />`
      : `<img src="${tierIconUrl(afterTierName)}" width="40" height="40" alt="${afterTierName}" style="vertical-align: middle;" />`;

    ladderSectionHtml = `
      <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
        <p style="margin: 0 0 10px 0; color: #555; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">Ladder Progress</p>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="width: 90px; vertical-align: middle;">${iconsCell}</td>
            <td style="vertical-align: middle; padding-left: 12px;">
              <p style="margin: 0; font-weight: 700; font-size: 15px;">${afterTierName}</p>
              <p style="margin: 4px 0 0 0; font-size: 13px; color: #374151;">${description}</p>
            </td>
          </tr>
        </table>
      </div>`;
  }

  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <h2 style="margin-bottom: 4px;">Match Results</h2>
      <p style="color: #555; margin-top: 0;">Hi ${recipientDisplayName}, your match has been recorded.</p>

      <table style="width: 100%; border-collapse: collapse; margin: 24px 0;">
        <tr>
          <td style="padding: 8px 0; color: #555; width: 140px;">Team 1</td>
          <td style="padding: 8px 0; font-weight: 600;">${t1Name}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #555;">Team 2</td>
          <td style="padding: 8px 0; font-weight: 600;">${t2Name}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #555;">Score</td>
          <td style="padding: 8px 0; font-weight: 600;">${scoreLabel} <span style="color: #888; font-weight: 400; font-size: 13px;">(Team 1 / Team 2)</span></td>
        </tr>
        ${metaRows.join("")}
      </table>

      <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
        <p style="margin: 0 0 10px 0; color: #555; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">Your Result</p>
        <span style="font-size: 28px; font-weight: 700; color: ${resultColor};">${resultLabel}</span>
        <p style="margin: 8px 0 0 0; font-size: 14px; color: #374151;">${ratingLine}</p>
        <p style="margin: 4px 0 0 0; font-size: 12px; color: #9ca3af;">Team ${recipientTeam}</p>
      </div>
      ${ladderSectionHtml}
      <a
        href="${dashboardUrl}"
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
        Go to your dashboard
      </a>

      <p style="margin-top: 32px; color: #aaa; font-size: 12px;">
        Padel League PH &mdash; ${NOTIFICATIONS_EMAIL}
      </p>
      <p style="margin-top: 8px; color: #aaa; font-size: 11px;">
        <a href="${unsubscribeMatchUrl}" style="color: #aaa;">Unsubscribe from match result emails</a>
        &nbsp;&middot;&nbsp;
        <a href="${unsubscribeAllUrl}" style="color: #aaa;">Unsubscribe from all emails</a>
      </p>
    </div>
  `;
}

export type NotifyResult = {
  sent: Array<{ player_id: number; displayName: string; email: string }>;
  skipped: Array<{ player_id: number; displayName: string; email: string | null; reason: "no_email" | "unsubscribed" | "opted_out" }>;
};

export async function notifyMatchCompleted(data: MatchCompletedData): Promise<NotifyResult> {
  const { team1Players, team2Players } = data;
  const dashboardUrl = `${SITE_URL}/dashboard`;

  const t1n1 = displayName(team1Players[0]);
  const t1n2 = displayName(team1Players[1]);
  const t2n1 = displayName(team2Players[0]);
  const t2n2 = displayName(team2Players[1]);
  const subject = `Padel League PH Match Results - ${t1n1} & ${t1n2} vs ${t2n1} & ${t2n2}`;

  const allPlayers: Array<{ player: PlayerInfo; team: 1 | 2 }> = [
    { player: team1Players[0], team: 1 },
    { player: team1Players[1], team: 1 },
    { player: team2Players[0], team: 2 },
    { player: team2Players[1], team: 2 },
  ];

  const playerIds = allPlayers.map(({ player }) => player.player_id);
  const supabase = getServerServiceClient();
  const prefsMap = await fetchPlayerPrefsMap(supabase, playerIds);

  const notifyResult: NotifyResult = { sent: [], skipped: [] };

  for (const { player, team } of allPlayers) {
    const dn = displayName(player);
    if (!player.email) {
      notifyResult.skipped.push({ player_id: player.player_id, displayName: dn, email: null, reason: "no_email" });
      continue;
    }
    if (player.is_notifications_subscribed === false) {
      notifyResult.skipped.push({ player_id: player.player_id, displayName: dn, email: player.email, reason: "unsubscribed" });
      continue;
    }
    if (prefsMap.get(player.player_id)?.match_results === false) {
      notifyResult.skipped.push({ player_id: player.player_id, displayName: dn, email: player.email, reason: "opted_out" });
      continue;
    }

    const rating = data.ratings.find((r) => r.player_id === player.player_id);
    if (!rating) {
      console.warn(`[email] notifyMatchCompleted: no rating found for player_id=${player.player_id}, skipping`);
      notifyResult.skipped.push({ player_id: player.player_id, displayName: dn, email: player.email, reason: "opted_out" });
      continue;
    }

    const unsubscribeMatchUrl = buildUnsubscribeUrl(player.player_id, "match_results");
    const unsubscribeAllUrl = buildUnsubscribeUrl(player.player_id, "all");

    const ladderEvent = data.ladder?.events.find((e) => e.playerId === player.player_id);

    const html = buildEmailHtml({
      recipient: player,
      recipientTeam: team,
      team1Players: data.team1Players,
      team2Players: data.team2Players,
      sets: data.sets,
      rating,
      dateLocal: data.dateLocal,
      timeLocal: data.timeLocal,
      venue: data.venue,
      dashboardUrl,
      unsubscribeMatchUrl,
      unsubscribeAllUrl,
      ladderProgress:
        ladderEvent && data.ladder ? { event: ladderEvent, tiers: data.ladder.tiers } : undefined,
    });

    const result = await sendEmail({ to: player.email, subject, html });
    if (!result.ok) {
      console.error(`[email] notifyMatchCompleted failed for player_id=${player.player_id}:`, result.error);
    }
    notifyResult.sent.push({ player_id: player.player_id, displayName: dn, email: player.email });
  }

  return notifyResult;
}
