import { sendEmail, NOTIFICATIONS_EMAIL } from "../send";
import { buildUnsubscribeUrl } from "../unsubscribeToken";
import { fetchPlayerPrefsMap } from "@/lib/notificationPreferences";
import { getServerServiceClient } from "@/app/api/_lib/supabase";
import { SITE_URL } from "@/lib/siteConfig";
import { formatPlayBy } from "@/lib/ladder/ladderQueueShared";

// Emails gated on the `ladder_queue_updates` notification type: "your queue match was cancelled and
// you're back in the queue", and "your queue match expired (admin-triggered); rejoin when ready". Sent sequentially — sendEmail owns the
// rate-limit gap.

const NOTIF_TYPE = "ladder_queue_updates" as const;

type PlayerRow = {
  player_id: number;
  name: string | null;
  nickname: string | null;
  email: string | null;
  is_notifications_subscribed: boolean | null;
};

function displayName(p: Pick<PlayerRow, "name" | "nickname">): string {
  return p.nickname ?? p.name ?? "there";
}

async function loadRecipients(playerIds: number[]): Promise<PlayerRow[]> {
  if (playerIds.length === 0) return [];
  const supabase = getServerServiceClient();
  const { data } = await supabase
    .from("players")
    .select("player_id,name,nickname,email,is_notifications_subscribed")
    .in("player_id", playerIds);
  const rows = (data ?? []) as PlayerRow[];

  const prefs = await fetchPlayerPrefsMap(supabase, playerIds);
  return rows.filter(
    (p) =>
      !!p.email &&
      p.is_notifications_subscribed !== false &&
      prefs.get(p.player_id)?.[NOTIF_TYPE] !== false,
  );
}

function wrap(body: string, playerId: number, ladderPath = "/ladder"): string {
  const unsubscribeUrl = buildUnsubscribeUrl(playerId, NOTIF_TYPE);
  const unsubscribeAllUrl = buildUnsubscribeUrl(playerId, "all");
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      ${body}
      <a
        href="${SITE_URL}${ladderPath}"
        style="display: inline-block; background: #16a34a; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600;"
      >
        Go to the ladder
      </a>
      <p style="margin-top: 32px; color: #aaa; font-size: 12px;">
        Padel League PH &mdash; ${NOTIFICATIONS_EMAIL}
      </p>
      <p style="margin-top: 8px; color: #aaa; font-size: 11px;">
        You're receiving this because you're a Padel League PH member.
        <a href="${unsubscribeUrl}" style="color: #aaa;">Unsubscribe from ladder queue emails</a>
        &nbsp;&middot;&nbsp;
        <a href="${unsubscribeAllUrl}" style="color: #aaa;">Unsubscribe from all emails</a>
      </p>
    </div>
  `;
}

const REQUEUE_REASON_TEXT: Record<string, string> = {
  backout: "One of the players backed out",
  admin_cancelled: "An admin cancelled it",
};

const DUO_REQUEUE_REASON_TEXT: Record<string, string> = {
  backout: "The other duo backed out",
  admin_cancelled: "An admin cancelled it",
};

export async function notifyLadderQueueRequeued(data: {
  matchId: number;
  reason: string;
  playerIds: number[];
  // Duo Ladder: the recipients' duo was put back in the duo queue.
  mode?: "solo" | "duo";
}): Promise<void> {
  const isDuo = data.mode === "duo";
  const recipients = await loadRecipients(data.playerIds);
  const reasonText =
    (isDuo ? DUO_REQUEUE_REASON_TEXT : REQUEUE_REASON_TEXT)[data.reason] ?? "It was cancelled";

  for (const player of recipients) {
    const name = displayName(player);
    const html = wrap(
      isDuo
        ? `
      <h2 style="margin-bottom: 4px;">Back in the duo queue</h2>
      <p style="color: #555; margin-top: 0;">Hi ${name}, your Duo Ladder match (#${data.matchId}) was cancelled. ${reasonText}.</p>
      <p style="color: #555; font-size: 14px;">
        You don't need to do anything &mdash; your duo has been put back in the duo queue at its original
        spot. We'll email you as soon as another duo is ready.
      </p>
      `
        : `
      <h2 style="margin-bottom: 4px;">Back in the ladder queue</h2>
      <p style="color: #555; margin-top: 0;">Hi ${name}, your ladder queue match (#${data.matchId}) was cancelled. ${reasonText}.</p>
      <p style="color: #555; font-size: 14px;">
        You don't need to do anything &mdash; you've been put back in the queue at your original spot,
        so you're first in line. We'll email you as soon as four players are ready.
      </p>
      `,
      player.player_id,
      isDuo ? "/ladder?mode=duo" : "/ladder",
    );

    const result = await sendEmail({
      to: player.email as string,
      subject: isDuo
        ? `Duo ladder match #${data.matchId} cancelled - ${name}, your duo is back in the queue`
        : `Ladder match #${data.matchId} cancelled - ${name}, you're back in the queue`,
      html,
    });
    if (!result.ok) {
      console.error(`[email] notifyLadderQueueRequeued failed for player_id=${player.player_id}:`, result.error);
    }
  }
}

export async function notifyLadderQueueMatchExpired(data: {
  matchId: number;
  playByAt: string | null;
  playerIds: number[];
  mode?: "solo" | "duo";
}): Promise<void> {
  const isDuo = data.mode === "duo";
  const recipients = await loadRecipients(data.playerIds);
  const deadline = formatPlayBy(data.playByAt);

  for (const player of recipients) {
    const name = displayName(player);
    const html = wrap(
      `
      <h2 style="margin-bottom: 4px;">${isDuo ? "Duo ladder match expired" : "Ladder match expired"}</h2>
      <p style="color: #555; margin-top: 0;">Hi ${name}, your ${isDuo ? "Duo Ladder" : "ladder queue"} match (#${data.matchId}) wasn't played by its deadline${deadline ? ` (${deadline})` : ""}, so an admin has cancelled it.</p>
      <p style="color: #555; font-size: 14px;">
        ${isDuo ? "Your duo is" : "You're"} no longer in the queue. When you're ready to play, join the queue again from the ladder page.
      </p>
      `,
      player.player_id,
      isDuo ? "/ladder?mode=duo" : "/ladder",
    );

    const result = await sendEmail({
      to: player.email as string,
      subject: isDuo ? `Duo ladder match #${data.matchId} expired - ${name}` : `Ladder match #${data.matchId} expired - ${name}`,
      html,
    });
    if (!result.ok) {
      console.error(`[email] notifyLadderQueueMatchExpired failed for player_id=${player.player_id}:`, result.error);
    }
  }
}

// To the partner of a player who backed out of a duo queue match: the backout is a strike against
// the DUO, so the partner should hear about it from us rather than from the standings.
export async function notifyLadderDuoPartnerBackedOut(data: {
  matchId: number;
  partnerId: number;
  backerName: string;
}): Promise<void> {
  const recipients = await loadRecipients([data.partnerId]);

  for (const player of recipients) {
    const name = displayName(player);
    const html = wrap(
      `
      <h2 style="margin-bottom: 4px;">Your duo backed out of a match</h2>
      <p style="color: #555; margin-top: 0;">Hi ${name}, ${data.backerName} backed your duo out of Duo Ladder match #${data.matchId}.</p>
      <p style="color: #555; font-size: 14px;">
        Backouts count as a strike against the duo and may be penalized by an admin. Your duo is not
        back in the queue &mdash; either of you can rejoin from the ladder page when you're both ready.
      </p>
      `,
      player.player_id,
      "/ladder?mode=duo",
    );

    const result = await sendEmail({
      to: player.email as string,
      subject: `${data.backerName} backed your duo out of match #${data.matchId} - ${name}`,
      html,
    });
    if (!result.ok) {
      console.error(`[email] notifyLadderDuoPartnerBackedOut failed for player_id=${player.player_id}:`, result.error);
    }
  }
}
