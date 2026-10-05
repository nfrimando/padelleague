import { sendEmail, NOTIFICATIONS_EMAIL } from "../send";
import { buildUnsubscribeUrl } from "../unsubscribeToken";
import { fetchPlayerPrefsMap } from "@/lib/notificationPreferences";
import { getServerServiceClient } from "@/app/api/_lib/supabase";
import { SITE_URL } from "@/lib/siteConfig";
import { formatPlayBy } from "@/lib/ladder/ladderQueueShared";

type PlayerInfo = {
  player_id: number;
  name: string | null;
  nickname: string | null;
  email: string | null;
  is_notifications_subscribed?: boolean | null;
};

type PlayerStanding = {
  stars: number;
  cushionAvailable: boolean;
};

type LadderMatchAssignedData = {
  matchId: number;
  tierName: string;
  nextTierName: string | null;
  prevTierName: string | null;
  standings: Record<string, PlayerStanding>;
  team1Players: [PlayerInfo, PlayerInfo];
  team2Players: [PlayerInfo, PlayerInfo];
  // "queue" = the player's tier queue filled up; "roulette" = admin-run draw. Defaults to roulette.
  source?: "roulette" | "queue";
  // Queue matches only: cancelled automatically if not played by then.
  playByAt?: string | null;
  // "duo" = a Duo Ladder match: standings are each player's DUO standing, and teams are labelled by
  // duo name. Defaults to solo.
  mode?: "solo" | "duo";
  duoNames?: [string, string];
};

export type NotifyResult = {
  sent: Array<{ player_id: number; displayName: string }>;
  skipped: Array<{ player_id: number; displayName: string; reason: "no_email" | "unsubscribed" | "opted_out" }>;
};

function displayName(p: PlayerInfo): string {
  return p.nickname ?? p.name ?? "Unknown";
}

function buildAssignedEmailHtml({
  recipient,
  recipientTeam,
  recipientStanding,
  team1Players,
  team2Players,
  tierName,
  nextTierName,
  prevTierName,
  dashboardUrl,
  unsubscribeLadderUrl,
  unsubscribeAllUrl,
  source,
  playByAt,
  mode,
  duoNames,
}: {
  recipient: PlayerInfo;
  recipientTeam: 1 | 2;
  recipientStanding: PlayerStanding | undefined;
  team1Players: [PlayerInfo, PlayerInfo];
  team2Players: [PlayerInfo, PlayerInfo];
  tierName: string;
  nextTierName: string | null;
  prevTierName: string | null;
  dashboardUrl: string;
  unsubscribeLadderUrl: string;
  unsubscribeAllUrl: string;
  source: "roulette" | "queue";
  playByAt: string | null;
  mode: "solo" | "duo";
  duoNames: [string, string] | null;
}): string {
  const isDuo = mode === "duo";
  const t1Pair = `${displayName(team1Players[0])} & ${displayName(team1Players[1])}`;
  const t2Pair = `${displayName(team2Players[0])} & ${displayName(team2Players[1])}`;
  const t1Name = isDuo && duoNames && duoNames[0] !== t1Pair ? `${duoNames[0]} (${t1Pair})` : t1Pair;
  const t2Name = isDuo && duoNames && duoNames[1] !== t2Pair ? `${duoNames[1]} (${t2Pair})` : t2Pair;
  const youAre = isDuo ? "Your duo is" : "You're";
  const recipientDisplayName = displayName(recipient);
  const opponentTeam = recipientTeam === 1 ? t2Name : t1Name;

  const isPromotionMatch = recipientStanding?.stars === 2 && !!nextTierName;
  const isDemotionMatch =
    recipientStanding?.stars === 0 && recipientStanding.cushionAvailable === false && !!prevTierName;

  const promotionHtml = isPromotionMatch
    ? `
      <div style="border: 1px solid #16a34a; background: #f0fdf4; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
        <p style="margin: 0 0 6px 0; color: #15803d; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">Promotion match</p>
        <p style="margin: 0; font-size: 14px; color: #166534;">${youAre} at 2&#9733; in ${tierName} &mdash; win this match and ${isDuo ? "your duo is" : "you're"} promoted straight to <strong>${nextTierName}</strong>.</p>
      </div>
    `
    : "";

  const demotionHtml = isDemotionMatch
    ? `
      <div style="border: 1px solid #dc2626; background: #fef2f2; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
        <p style="margin: 0 0 6px 0; color: #b91c1c; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">Demotion risk</p>
        <p style="margin: 0; font-size: 14px; color: #991b1b;">${youAre} at 0&#9733; in ${tierName} with no cushion left &mdash; lose this match and ${isDuo ? "your duo will" : "you'll"} drop to <strong>${prevTierName}</strong>.</p>
      </div>
    `
    : "";

  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <h2 style="margin-bottom: 4px;">${isDuo ? "Duo Ladder Match Assigned" : "Ladder Match Assigned"}</h2>
      <p style="color: #555; margin-top: 0;">Hi ${recipientDisplayName}, ${
        isDuo
          ? source === "queue"
            ? `two duos are in the ${tierName} duo queue &mdash; your duo has been matched.`
            : `your duo has been set a ${tierName} Duo Ladder match.`
          : source === "queue"
            ? `four players are in the ${tierName} queue &mdash; you've been matched.`
            : `the ${tierName} tier roulette has assigned you a match.`
      }</p>

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
          <td style="padding: 8px 0; color: #555;">Tier</td>
          <td style="padding: 8px 0; font-weight: 600;">${tierName}</td>
        </tr>${
          playByAt
            ? `
        <tr>
          <td style="padding: 8px 0; color: #555;">Play by</td>
          <td style="padding: 8px 0; font-weight: 600;">${formatPlayBy(playByAt)}</td>
        </tr>`
            : ""
        }
      </table>

      <div style="border: 1px solid #fbbf24; background: #fffbeb; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
        <p style="margin: 0 0 6px 0; color: #92400e; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">Next step</p>
        <p style="margin: 0; font-size: 14px; color: #92400e;">Coordinate a time and court with your opponents: ${opponentTeam}.${
          playByAt
            ? ` If it isn't played by ${formatPlayBy(playByAt)} it may be cancelled by an admin. Can't make it? You can back out from the ladder page &mdash; note that backing out is subject to penalties.`
            : ""
        }</p>
      </div>

      ${promotionHtml}
      ${demotionHtml}

      <p style="color: #555; font-size: 14px;">
        Message ${opponentTeam} to agree on a time and book a court, then post the scheduled time in the <strong>Padel League PH WhatsApp group</strong> so everyone knows it's happening.
      </p>

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
        You're receiving this because you're a Padel League PH member.
        <a href="${unsubscribeLadderUrl}" style="color: #aaa;">Unsubscribe from ladder match emails</a>
        &nbsp;&middot;&nbsp;
        <a href="${unsubscribeAllUrl}" style="color: #aaa;">Unsubscribe from all emails</a>
      </p>
    </div>
  `;
}

export async function notifyLadderMatchAssigned(data: LadderMatchAssignedData): Promise<NotifyResult> {
  const { team1Players, team2Players } = data;
  const isDuo = data.mode === "duo";
  const dashboardUrl = isDuo ? `${SITE_URL}/ladder?mode=duo` : `${SITE_URL}/ladder`;

  const t1n1 = displayName(team1Players[0]);
  const t1n2 = displayName(team1Players[1]);
  const t2n1 = displayName(team2Players[0]);
  const t2n2 = displayName(team2Players[1]);
  const subject = isDuo
    ? `Padel League PH Duo Ladder Match Assigned - ${data.duoNames?.[0] ?? `${t1n1} & ${t1n2}`} vs ${data.duoNames?.[1] ?? `${t2n1} & ${t2n2}`} (#${data.matchId})`
    : `Padel League PH Ladder Match Assigned - ${t1n1} & ${t1n2} vs ${t2n1} & ${t2n2} (#${data.matchId})`;

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
      notifyResult.skipped.push({ player_id: player.player_id, displayName: dn, reason: "no_email" });
      continue;
    }
    if (player.is_notifications_subscribed === false) {
      notifyResult.skipped.push({ player_id: player.player_id, displayName: dn, reason: "unsubscribed" });
      continue;
    }
    if (prefsMap.get(player.player_id)?.ladder_match_assigned === false) {
      notifyResult.skipped.push({ player_id: player.player_id, displayName: dn, reason: "opted_out" });
      continue;
    }

    const unsubscribeLadderUrl = buildUnsubscribeUrl(player.player_id, "ladder_match_assigned");
    const unsubscribeAllUrl = buildUnsubscribeUrl(player.player_id, "all");

    const html = buildAssignedEmailHtml({
      recipient: player,
      recipientTeam: team,
      recipientStanding: data.standings[String(player.player_id)],
      team1Players: data.team1Players,
      team2Players: data.team2Players,
      tierName: data.tierName,
      nextTierName: data.nextTierName,
      prevTierName: data.prevTierName,
      dashboardUrl,
      unsubscribeLadderUrl,
      unsubscribeAllUrl,
      source: data.source ?? "roulette",
      playByAt: data.playByAt ?? null,
      mode: data.mode ?? "solo",
      duoNames: data.duoNames ?? null,
    });

    const result = await sendEmail({ to: player.email, subject, html });
    if (!result.ok) {
      console.error(`[email] notifyLadderMatchAssigned failed for player_id=${player.player_id}:`, result.error);
    }
    notifyResult.sent.push({ player_id: player.player_id, displayName: dn });
  }

  return notifyResult;
}
