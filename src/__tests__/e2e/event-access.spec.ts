import { test, expect } from "@playwright/test";

// UI fixtures cover the lock/unlock presentation independently of production
// credentials. The companion database suite executes the real access policies.
const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const player = { player_id: 146, name: "Pancho de Miguel Jessel", nickname: "Pancho", image_link: null, email: "pancho@example.test", is_profile_complete: true };
const event = { event_id: 17, name: "Padel League Duo Cup", event_type: "open_event", visibility: "published", registration_status: "open", status: "upcoming", signup_mode: "paired", requires_payment: true, payment_lock_enabled: true, registration_fee: 1000, description: "General round-robin rules remain available before payment.", signup_list_visible: true, player_limit: 70 };

test("registered players see rules and participants, then matchups after confirmed payment", async ({ page }, testInfo) => {
  let paid = false;
  const user = { id: userId, email: player.email, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  const token = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: userId, email: player.email, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test-signature`;
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem("sb-hmztjweohbfnbpuidrtl-auth-token", JSON.stringify({ access_token: token, refresh_token: "test-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: "bearer", user }));
  }, { token, user });
  await page.route("**/auth/v1/**", route => route.fulfill({ json: user }));
  await page.route("**/rest/v1/**", route => {
    const url = new URL(route.request().url());
    return route.fulfill({ json: url.pathname.endsWith("/players") ? player : url.pathname.endsWith("/admin_users") ? null : [] });
  });
  await page.route("**/api/events/17", route => route.fulfill({ json: { event } }));
  await page.route("**/api/events/17/signups", route => route.fulfill({ json: { signupMode: "paired", signupListVisible: true, canManage: false, viewerSignup: { id: "signup", status: paid ? "accepted" : "pending_payment", looking_for_partner: false, pair: null }, roster: [player, { ...player, player_id: 38, name: "Derrick Santos", nickname: "Derrick" }] } }));
  const teams = Array.from({ length: 35 }, (_, i) => ({ id: `team-${i}`, division: Math.floor(i / 5) + 1, team_number: i + 1, player_1: { ...player, player_id: i === 0 ? 146 : 1000 + i * 2, nickname: `Player ${i * 2 + 1}` }, player_2: { ...player, player_id: i === 0 ? 38 : 1001 + i * 2, nickname: `Player ${i * 2 + 2}` } }));
  await page.route("**/api/events/17/inside", route => route.fulfill({ json: {
    access: { found: true, registered: true, paid, canManage: false, signupId: "signup", signupStatus: paid ? "accepted" : "pending_payment", paymentRequired: !paid, canViewInside: paid },
    ...(paid ? { details: { information: "Private court instructions", event_url: "https://example.test/inside" }, teams, matches: [] } : {}),
  } }));
  await page.goto("/events/17?payment=success");
  const panel = page.getByRole("region", { name: "Matchups and event information" });
  await expect(panel.getByText("Registered · Locked")).toBeVisible();
  await expect(page.getByText(event.description)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Participants (2)" })).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Division 1", exact: true })).toHaveCount(0);
  await expect(panel.getByText("Private court instructions")).toHaveCount(0);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("unpaid-mobile.png") });
  paid = true;
  await panel.getByRole("button", { name: "Check access again" }).click();
  await expect(panel.getByText("Paid · Unlocked")).toBeVisible();
  await expect(panel.getByText("Private court instructions")).toBeVisible();
  await expect.poll(async () => new Set(await panel.locator('a[href^="/players/"]').evaluateAll(links => links.map(a => a.getAttribute("href")))).size).toBe(70);
  await expect(page.getByRole("button", { name: "Pay Now", exact: true })).toHaveCount(0);
  await expect(panel.getByRole("heading", { name: "Division 7", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("paid-mobile.png") });
  await page.setViewportSize({ width: 1280, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
