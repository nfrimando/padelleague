import { NextRequest, NextResponse } from "next/server";
import { getServerServiceClient } from "@/app/api/_lib/supabase";
import { verifyUnsubscribeToken } from "@/lib/email/unsubscribeToken";
import { setPlayerPref } from "@/lib/notificationPreferences";
import { SITE_URL } from "@/lib/siteConfig";

const VALID_TYPES = ["all", "match_results", "match_scheduled", "recruit_invitation", "signup_status"] as const;
type UnsubscribeType = (typeof VALID_TYPES)[number];

const TYPE_LABELS: Record<UnsubscribeType, string> = {
  all: "all emails",
  match_results: "match result emails",
  match_scheduled: "match scheduling emails",
  recruit_invitation: "recruit assessment invitation emails",
  signup_status: "event signup status emails",
};

const DASHBOARD_URL = `${SITE_URL}/dashboard`;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const pidStr = searchParams.get("pid");
  const type = searchParams.get("type");
  const sig = searchParams.get("sig");

  if (!pidStr || !type || !sig) {
    return new NextResponse(errorHtml("Missing required parameters."), {
      status: 400,
      headers: { "Content-Type": "text/html" },
    });
  }

  if (!VALID_TYPES.includes(type as UnsubscribeType)) {
    return new NextResponse(errorHtml("Invalid notification type."), {
      status: 400,
      headers: { "Content-Type": "text/html" },
    });
  }

  const playerId = parseInt(pidStr, 10);
  if (isNaN(playerId)) {
    return new NextResponse(errorHtml("Invalid player ID."), {
      status: 400,
      headers: { "Content-Type": "text/html" },
    });
  }

  try {
    verifyUnsubscribeToken(sig, playerId, type);
  } catch {
    return new NextResponse(errorHtml("Invalid or expired unsubscribe link."), {
      status: 400,
      headers: { "Content-Type": "text/html" },
    });
  }

  try {
    const supabase = getServerServiceClient();
    await setPlayerPref(supabase, playerId, type as UnsubscribeType, false);
  } catch (err) {
    console.error("[unsubscribe] failed to update pref:", err);
    return new NextResponse(errorHtml("Something went wrong. Please try again."), {
      status: 500,
      headers: { "Content-Type": "text/html" },
    });
  }

  const label = TYPE_LABELS[type as UnsubscribeType];
  return new NextResponse(successHtml(label), {
    status: 200,
    headers: { "Content-Type": "text/html" },
  });
}

function successHtml(label: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Unsubscribed — Padel League PH</title>
  <style>
    body { font-family: sans-serif; background: #0e1523; color: #e2e8f0; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { max-width: 400px; text-align: center; padding: 2rem; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    p { color: #94a3b8; line-height: 1.6; }
    a { color: #00C8DC; text-decoration: none; font-weight: 600; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <h1>You've been unsubscribed</h1>
    <p>You will no longer receive ${label} from Padel League PH.</p>
    <p style="margin-top: 1.5rem;">
      Want to change your preferences?<br />
      <a href="${DASHBOARD_URL}">Visit your dashboard</a>
    </p>
  </div>
</body>
</html>`;
}

function errorHtml(message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Error — Padel League PH</title>
  <style>
    body { font-family: sans-serif; background: #0e1523; color: #e2e8f0; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { max-width: 400px; text-align: center; padding: 2rem; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; color: #f87171; }
    p { color: #94a3b8; line-height: 1.6; }
    a { color: #00C8DC; text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Something went wrong</h1>
    <p>${message}</p>
    <p style="margin-top: 1.5rem;"><a href="${DASHBOARD_URL}">Go to dashboard</a></p>
  </div>
</body>
</html>`;
}
