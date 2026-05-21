import { sendEmail } from "../send";

type PredictionCorrectData = {
  recipientName: string;
  recipientEmail: string;
  team1Players: [string, string];
  team2Players: [string, string];
  dateLocal: string | null;
  timeLocal: string | null;
  sets: Array<{ team_1_games: number; team_2_games: number }>;
  pointsAwarded: number;
};

function buildScoreLabel(sets: Array<{ team_1_games: number; team_2_games: number }>): string {
  return sets.map((s) => `${s.team_1_games}–${s.team_2_games}`).join(", ");
}

function buildEmailHtml({
  recipientName,
  team1Players,
  team2Players,
  dateLocal,
  timeLocal,
  sets,
  pointsAwarded,
  predictionsUrl,
}: PredictionCorrectData & { predictionsUrl: string }): string {
  const t1Name = `${team1Players[0]} & ${team1Players[1]}`;
  const t2Name = `${team2Players[0]} & ${team2Players[1]}`;
  const scoreLabel = buildScoreLabel(sets);
  const pointsDisplay =
    pointsAwarded % 1 === 0 ? `+${pointsAwarded.toFixed(0)}` : `+${pointsAwarded.toFixed(2)}`;

  const metaRows: string[] = [];
  if (dateLocal) {
    const timeStr = timeLocal ? ` at ${timeLocal}` : "";
    metaRows.push(`
      <tr>
        <td style="padding: 8px 0; color: #555; width: 140px;">Date</td>
        <td style="padding: 8px 0; font-weight: 600;">${dateLocal}${timeStr}</td>
      </tr>`);
  }

  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <h2 style="margin-bottom: 4px;">Match Prediction Result</h2>
      <p style="color: #555; margin-top: 0;">Hi ${recipientName}, you called it right!</p>

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
        <p style="margin: 0 0 10px 0; color: #555; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">Your Reward</p>
        <span style="font-size: 36px; font-weight: 700; color: #16a34a;">${pointsDisplay} pts</span>
        <p style="margin: 8px 0 0 0; font-size: 14px; color: #374151;">Predicted Right!</p>
      </div>

      <a
        href="${predictionsUrl}"
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
        View predictions leaderboard
      </a>

      <p style="margin-top: 32px; color: #aaa; font-size: 12px;">
        Padel League PH &mdash; notifications@padelsense.app
      </p>
    </div>
  `;
}

export async function notifyPredictionCorrect(data: PredictionCorrectData): Promise<void> {
  const { recipientName, recipientEmail } = data;
  const t1Name = `${data.team1Players[0]} & ${data.team1Players[1]}`;
  const t2Name = `${data.team2Players[0]} & ${data.team2Players[1]}`;
  const predictionsUrl = "https://www.padelph.com/predictions";

  const subject = `${recipientName} — You predicted right! (${t1Name} vs ${t2Name})`;
  const html = buildEmailHtml({ ...data, predictionsUrl });

  const result = await sendEmail({ to: recipientEmail, subject, html });
  if (!result.ok) {
    console.error(`[email] notifyPredictionCorrect failed for ${recipientEmail}:`, result.error);
  }
}
