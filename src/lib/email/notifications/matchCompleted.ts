import { sendEmail } from "../send";

type PlayerInfo = {
  player_id: number;
  name: string | null;
  nickname: string | null;
  email: string | null;
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

function buildEmailHtml({
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
        <p style="margin: 0 0 8px 0; color: #555; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">Your Result</p>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 20px; font-weight: 700; color: ${resultColor};">${resultLabel}</span>
          <span style="font-size: 15px; color: #374151;">${ratingLine}</span>
        </div>
        <p style="margin: 6px 0 0 0; font-size: 12px; color: #9ca3af;">Team ${recipientTeam}</p>
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
        Padel League PH &mdash; notifications@padelsense.app
      </p>
    </div>
  `;
}

export async function notifyMatchCompleted(data: MatchCompletedData): Promise<void> {
  const { team1Players, team2Players } = data;
  const dashboardUrl = "https://www.padelph.com/dashboard";

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

  for (const { player, team } of allPlayers) {
    if (!player.email) continue;

    const rating = data.ratings.find((r) => r.player_id === player.player_id);
    if (!rating) {
      console.warn(`[email] notifyMatchCompleted: no rating found for player_id=${player.player_id}, skipping`);
      continue;
    }

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
    });

    const result = await sendEmail({ to: player.email, subject, html });
    if (!result.ok) {
      console.error(`[email] notifyMatchCompleted failed for player_id=${player.player_id}:`, result.error);
    }
  }
}
