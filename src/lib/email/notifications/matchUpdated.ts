import { sendEmail } from "../send";
import { buildUnsubscribeUrl } from "../unsubscribeToken";
import { fetchPlayerPrefsMap } from "@/lib/notificationPreferences";
import { getServerServiceClient } from "@/app/api/_lib/supabase";

type PlayerInfo = {
  player_id: number;
  name: string | null;
  nickname: string | null;
  email: string | null;
  is_notifications_subscribed?: boolean | null;
};

type MatchUpdatedData = {
  matchId: number;
  dateLocal: string | null;
  timeLocal: string | null;
  venue: string | null;
  matchType: string | null;
  eventName: string | null;
  team1Players: [PlayerInfo, PlayerInfo];
  team2Players: [PlayerInfo, PlayerInfo];
};

export type NotifyResult = {
  sent: Array<{ player_id: number; displayName: string; email: string }>;
  skipped: Array<{ player_id: number; displayName: string; email: string | null; reason: "no_email" | "unsubscribed" | "opted_out" }>;
};

function displayName(p: PlayerInfo): string {
  return p.nickname ?? p.name ?? "Unknown";
}

function buildEmailHtml({
  recipient,
  recipientTeam,
  team1Players,
  team2Players,
  dateLocal,
  timeLocal,
  venue,
  matchType,
  eventName,
  dashboardUrl,
  unsubscribeScheduleUrl,
  unsubscribeAllUrl,
}: {
  recipient: PlayerInfo;
  recipientTeam: 1 | 2;
  team1Players: [PlayerInfo, PlayerInfo];
  team2Players: [PlayerInfo, PlayerInfo];
  dateLocal: string | null;
  timeLocal: string | null;
  venue: string | null;
  matchType: string | null;
  eventName: string | null;
  dashboardUrl: string;
  unsubscribeScheduleUrl: string;
  unsubscribeAllUrl: string;
}): string {
  const t1Name = `${displayName(team1Players[0])} & ${displayName(team1Players[1])}`;
  const t2Name = `${displayName(team2Players[0])} & ${displayName(team2Players[1])}`;
  const recipientDisplayName = displayName(recipient);
  const opponentTeam = recipientTeam === 1 ? t2Name : t1Name;

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
  if (eventName) {
    metaRows.push(`
      <tr>
        <td style="padding: 8px 0; color: #555;">Event</td>
        <td style="padding: 8px 0; font-weight: 600;">${eventName}</td>
      </tr>`);
  }
  if (matchType) {
    metaRows.push(`
      <tr>
        <td style="padding: 8px 0; color: #555;">Format</td>
        <td style="padding: 8px 0; font-weight: 600; text-transform: capitalize;">${matchType}</td>
      </tr>`);
  }

  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <h2 style="margin-bottom: 4px;">Match Updated</h2>
      <p style="color: #555; margin-top: 0;">Hi ${recipientDisplayName}, the details for your match have been updated.</p>

      <table style="width: 100%; border-collapse: collapse; margin: 24px 0;">
        <tr>
          <td style="padding: 8px 0; color: #555; width: 140px;">Team 1</td>
          <td style="padding: 8px 0; font-weight: 600;">${t1Name}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #555;">Team 2</td>
          <td style="padding: 8px 0; font-weight: 600;">${t2Name}</td>
        </tr>
        ${metaRows.join("")}
      </table>

      <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
        <p style="margin: 0 0 6px 0; color: #555; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">Your Opponents</p>
        <p style="margin: 0; font-size: 16px; font-weight: 700; color: #1a1a1a;">${opponentTeam}</p>
        <p style="margin: 4px 0 0 0; font-size: 12px; color: #9ca3af;">Team ${recipientTeam === 1 ? 2 : 1}</p>
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
        Padel League PH &mdash; hello@padelph.com
      </p>
      <p style="margin-top: 8px; color: #aaa; font-size: 11px;">
        You're receiving this because you're a Padel League PH member.
        <a href="${unsubscribeScheduleUrl}" style="color: #aaa;">Unsubscribe from match schedule/update emails</a>
        &nbsp;&middot;&nbsp;
        <a href="${unsubscribeAllUrl}" style="color: #aaa;">Unsubscribe from all emails</a>
      </p>
    </div>
  `;
}

export async function notifyMatchUpdated(data: MatchUpdatedData): Promise<NotifyResult> {
  const { team1Players, team2Players } = data;
  const dashboardUrl = "https://www.padelph.com/dashboard";

  const t1n1 = displayName(team1Players[0]);
  const t1n2 = displayName(team1Players[1]);
  const t2n1 = displayName(team2Players[0]);
  const t2n2 = displayName(team2Players[1]);
  const datePart = data.dateLocal ? ` on ${data.dateLocal}` : "";
  const subject = `Padel League PH Match Updated${datePart} - ${t1n1} & ${t1n2} vs ${t2n1} & ${t2n2}`;

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
    if (prefsMap.get(player.player_id)?.match_scheduled === false) {
      notifyResult.skipped.push({ player_id: player.player_id, displayName: dn, email: player.email, reason: "opted_out" });
      continue;
    }

    const unsubscribeScheduleUrl = buildUnsubscribeUrl(player.player_id, "match_scheduled");
    const unsubscribeAllUrl = buildUnsubscribeUrl(player.player_id, "all");

    const html = buildEmailHtml({
      recipient: player,
      recipientTeam: team,
      team1Players: data.team1Players,
      team2Players: data.team2Players,
      dateLocal: data.dateLocal,
      timeLocal: data.timeLocal,
      venue: data.venue,
      matchType: data.matchType,
      eventName: data.eventName,
      dashboardUrl,
      unsubscribeScheduleUrl,
      unsubscribeAllUrl,
    });

    const result = await sendEmail({ to: player.email, subject, html });
    if (!result.ok) {
      console.error(`[email] notifyMatchUpdated failed for player_id=${player.player_id}:`, result.error);
    }
    notifyResult.sent.push({ player_id: player.player_id, displayName: dn, email: player.email });
  }

  return notifyResult;
}
