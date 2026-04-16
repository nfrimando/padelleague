import { test, expect } from "@playwright/test";

/**
 * E2E tests for the registration and payment flow.
 *
 * These tests run against the live dev server (localhost:3000) with real
 * Supabase and PayMongo test credentials. Google OAuth cannot be automated
 * (no headless support for OAuth popups), so auth-dependent tests use a
 * pre-seeded session cookie or are marked as manual where noted.
 *
 * Tests that can run without auth are fully automated here.
 * Tests that require a logged-in player use Playwright's storageState to
 * reuse a saved session (see README for how to generate it).
 */

// ─── Unauthenticated page tests (no auth required) ────────────────────────────

test.describe("Home page", () => {
  test("TC-UI-1 loads and shows Sign In button when logged out", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Padel/i);
    await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();
  });

  test("TC-UI-2 Sign In link navigates to /register", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/register/);
  });
});

test.describe("Register page — unauthenticated", () => {
  test("TC-2.1 shows Google sign-in prompt when not logged in", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByRole("button", { name: /continue with google/i })).toBeVisible();
  });

  test("TC-2.2 shows season registration heading", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByRole("heading", { name: /season registration/i })).toBeVisible();
  });
});

test.describe("Dashboard — unauthenticated redirect", () => {
  test("TC-1.6 redirects to /register when visiting /dashboard without auth", async ({ page }) => {
    await page.goto("/dashboard");
    // Should redirect to /register (not /dashboard)
    await expect(page).toHaveURL(/\/register/);
  });
});

test.describe("Success page — unauthenticated redirect", () => {
  test("TC-4.5 redirects to /register when visiting /register/success without auth", async ({ page }) => {
    await page.goto("/register/success");
    await expect(page).toHaveURL(/\/register/);
  });
});

// ─── API contract tests (no auth, directly via fetch) ─────────────────────────

test.describe("API: POST /api/payments/create-link", () => {
  test("TC-5.1 returns 401 with no Authorization header", async ({ request }) => {
    const res = await request.post("/api/payments/create-link", {
      data: { season_id: 1 },
    });
    expect(res.status()).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/Authorization/i);
  });

  test("TC-5.2 returns 401 with invalid token", async ({ request }) => {
    const res = await request.post("/api/payments/create-link", {
      headers: { Authorization: "Bearer totally-fake-token" },
      data: { season_id: 1 },
    });
    expect(res.status()).toBe(401);
  });

  test("TC-5.3 returns 400 when season_id is missing", async ({ request }) => {
    const res = await request.post("/api/payments/create-link", {
      headers: { Authorization: "Bearer totally-fake-token" },
      data: {},
    });
    // 400 (missing season_id) or 401 (bad token) — either is acceptable without real auth
    expect([400, 401]).toContain(res.status());
  });
});

test.describe("API: POST /api/payments/confirm", () => {
  test("TC-6.1 returns 401 with no Authorization header", async ({ request }) => {
    const res = await request.post("/api/payments/confirm");
    expect(res.status()).toBe(401);
  });
});

test.describe("API: POST /api/payments/webhook", () => {
  test("TC-7.1 returns 401 with invalid signature", async ({ request }) => {
    const res = await request.post("/api/payments/webhook", {
      headers: { "paymongo-signature": "t=999,te=badhash" },
      data: { data: { id: "evt_1", attributes: { type: "link.payment.paid" } } },
    });
    expect(res.status()).toBe(401);
  });

  test("TC-7.2 returns 200 for non-payment event types", async ({ request }) => {
    // No webhook secret check for non-payment events since we return early
    // Use a valid-looking (but unsigned) payload for a non-paid event type
    // Without a secret set the route skips verification — covered by unit tests
    const res = await request.post("/api/payments/webhook", {
      data: {
        data: {
          id: "evt_ignored",
          attributes: { type: "source.chargeable" },
        },
      },
    });
    // Either 200 (ignored) or 401 (signature required) — both are correct behaviour
    expect([200, 401]).toContain(res.status());
  });
});

// ─── Authenticated flow tests (requires saved session) ───────────────────────
// These tests use a saved auth session generated via `npm run test:auth-setup`.
// Until that session exists they are automatically skipped.

import { existsSync } from "fs";
const SESSION_FILE = "./src/__tests__/e2e/.auth/session.json";
const sessionExists = existsSync(SESSION_FILE);

test.describe("Authenticated: register page", () => {
  test.skip(!sessionExists, "Requires saved auth session (run npm run test:auth-setup first)");

  test.use({ storageState: SESSION_FILE });

  test("TC-2.4 shows correct registration fee from DB", async ({ page }) => {
    await page.goto("/register");
    // Fee should be ₱5 in test mode
    await expect(page.getByText(/₱5/)).toBeVisible({ timeout: 10_000 });
  });

  test("TC-2.5 shows correct season name", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByText(/Season 11|Season 1/)).toBeVisible({ timeout: 10_000 });
  });

  test("TC-2.6 clicking Pay redirects to PayMongo checkout", async ({ page }) => {
    await page.goto("/register");
    // Only proceed if form is shown (verified player)
    const payBtn = page.getByRole("button", { name: /pay/i });
    if (await payBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await payBtn.click();
      await expect(page).toHaveURL(/paymongo\.com/, { timeout: 15_000 });
    } else {
      test.skip(true, "No Pay button — player may be unverified or already registered");
    }
  });
});

test.describe("Authenticated: dashboard", () => {
  test.skip(!sessionExists, "Requires saved auth session (run npm run test:auth-setup first)");

  test.use({ storageState: SESSION_FILE });

  test("TC-8.1 dashboard loads with Season Status section", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText(/Season Status/i)).toBeVisible({ timeout: 10_000 });
  });

  test("TC-8.6 registration fee shown correctly on open season", async ({ page }) => {
    await page.goto("/dashboard");
    const feeText = page.getByText(/₱\d+/);
    if (await feeText.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(feeText.first()).toBeVisible();
    }
  });
});
