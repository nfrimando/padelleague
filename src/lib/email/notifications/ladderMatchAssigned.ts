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

type LadderMatchAssignedData = {
  matchId: number;
  tierName: string;
  deadlineLocal: string;
  team1Players: [PlayerInfo, PlayerInfo];
  team2Players: [PlayerInfo, PlayerInfo];
};

type LadderMatchExpiredData = {
  matchId: number;
  tierName: string;
  team1Players: [PlayerInfo, PlayerInfo];
  team2Players: [PlayerInfo, PlayerInfo];
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
  team1Players,
  team2Players,
  tierName,
  deadlineLocal,
  dashboardUrl,
  unsubscribeLadderUrl,
  unsubscribeAllUrl,
}: {
  recipient: PlayerInfo;
  recipientTeam: 1 | 2;
  team1Players: [PlayerInfo, PlayerInfo];
  team2Players: [PlayerInfo, PlayerInfo];
  tierName: string;
  deadlineLocal: string;
  dashboardUrl: string;
  unsubscribeLadderUrl: string;
  unsubscribeAllUrl: string;
}): string {
  const t1Name = `${displayName(team1Players[0])} & ${displayName(team1Players[1])}`;
  const t2Name = `${displayName(team2Players[0])} & ${displayName(team2Players[1])}`;
  const recipientDisplayName = displayName(recipient);
  const opponentTeam = recipientTeam === 1 ? t2Name : t1Name;

  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <h2 style="margin-bottom: 4px;">Ladder Match Assigned</h2>
      <p style="color: #555; margin-top: 0;">Hi ${recipientDisplayName}, the ${tierName} tier roulette has assigned you a match.</p>

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
        </tr>
      </table>

      <div style="border: 1px solid #fbbf24; background: #fffbeb; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
        <p style="margin: 0 0 6px 0; color: #92400e; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">Schedule by</p>
        <p style="margin: 0; font-size: 16px; font-weight: 700; color: #92400e;">${deadlineLocal}</p>
        <p style="margin: 4px 0 0 0; font-size: 12px; color: #b45309;">Coordinate a time and court with your opponents: ${opponentTeam}. If it's not played by the deadline, this match is cancelled and no one loses stars.</p>
      </div>

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

function buildExpiredEmailHtml({
  recipient,
  team1Players,
  team2Players,
  tierName,
  dashboardUrl,
  unsubscribeLadderUrl,
  unsubscribeAllUrl,
}: {
  recipient: PlayerInfo;
  team1Players: [PlayerInfo, PlayerInfo];
  team2Players: [PlayerInfo, PlayerInfo];
  tierName: string;
  dashboardUrl: string;
  unsubscribeLadderUrl: string;
  unsubscribeAllUrl: string;
}): string {
  const t1Name = `${displayName(team1Players[0])} & ${displayName(team1Players[1])}`;
  const t2Name = `${displayName(team2Players[0])} & ${displayName(team2Players[1])}`;
  const recipientDisplayName = displayName(recipient);

  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <h2 style="margin-bottom: 4px;">Ladder Match Expired</h2>
      <p style="color: #555; margin-top: 0;">Hi ${recipientDisplayName}, your ${tierName} tier roulette match wasn't played before its deadline, so it's been cancelled.</p>

      <table style="width: 100%; border-collapse: collapse; margin: 24px 0;">
        <tr>
          <td style="padding: 8px 0; color: #555; width: 140px;">Team 1</td>
          <td style="padding: 8px 0; font-weight: 600;">${t1Name}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #555;">Team 2</td>
          <td style="padding: 8px 0; font-weight: 600;">${t2Name}</td>
        </tr>
      </table>

      <p style="color: #555;">No one's stars or rating changed because of this — it's treated as though it never happened. You'll be back in the pool for the next roulette round.</p>

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
  const dashboardUrl = `${SITE_URL}/ladder`;

  const t1n1 = displayName(team1Players[0]);
  const t1n2 = displayName(team1Players[1]);
  const t2n1 = displayName(team2Players[0]);
  const t2n2 = displayName(team2Players[1]);
  const subject = `Padel League PH Ladder Match Assigned - ${t1n1} & ${t1n2} vs ${t2n1} & ${t2n2} (schedule by ${data.deadlineLocal})`;

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
      team1Players: data.team1Players,
      team2Players: data.team2Players,
      tierName: data.tierName,
      deadlineLocal: data.deadlineLocal,
      dashboardUrl,
      unsubscribeLadderUrl,
      unsubscribeAllUrl,
    });

    const result = await sendEmail({ to: player.email, subject, html });
    if (!result.ok) {
      console.error(`[email] notifyLadderMatchAssigned failed for player_id=${player.player_id}:`, result.error);
    }
    notifyResult.sent.push({ player_id: player.player_id, displayName: dn });
  }

  return notifyResult;
}

export async function notifyLadderMatchExpired(data: LadderMatchExpiredData): Promise<NotifyResult> {
  const { team1Players, team2Players } = data;
  const dashboardUrl = `${SITE_URL}/ladder`;

  const t1n1 = displayName(team1Players[0]);
  const t1n2 = displayName(team1Players[1]);
  const t2n1 = displayName(team2Players[0]);
  const t2n2 = displayName(team2Players[1]);
  const subject = `Padel League PH Ladder Match Expired - ${t1n1} & ${t1n2} vs ${t2n1} & ${t2n2}`;

  const allPlayers: PlayerInfo[] = [team1Players[0], team1Players[1], team2Players[0], team2Players[1]];

  const playerIds = allPlayers.map((player) => player.player_id);
  const supabase = getServerServiceClient();
  const prefsMap = await fetchPlayerPrefsMap(supabase, playerIds);

  const notifyResult: NotifyResult = { sent: [], skipped: [] };

  for (const player of allPlayers) {
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

    const html = buildExpiredEmailHtml({
      recipient: player,
      team1Players: data.team1Players,
      team2Players: data.team2Players,
      tierName: data.tierName,
      dashboardUrl,
      unsubscribeLadderUrl,
      unsubscribeAllUrl,
    });

    const result = await sendEmail({ to: player.email, subject, html });
    if (!result.ok) {
      console.error(`[email] notifyLadderMatchExpired failed for player_id=${player.player_id}:`, result.error);
    }
    notifyResult.sent.push({ player_id: player.player_id, displayName: dn });
  }

  return notifyResult;
}
