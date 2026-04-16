/**
 * Auth Setup — run this ONCE to save a logged-in session for the E2E tests.
 *
 * Usage:
 *   npx playwright test src/__tests__/e2e/auth-setup.spec.ts --headed
 *
 * This will open a browser, navigate to /register, and pause so you can
 * sign in with Google manually. Once you're logged in, press Enter in the
 * terminal to save the session to .auth/session.json.
 * The authenticated E2E tests will then use this saved session automatically.
 *
 * The session file is gitignored — each developer runs this once locally.
 */

import { test as setup } from "@playwright/test";
import { existsSync, mkdirSync } from "fs";
import path from "path";

const SESSION_FILE = path.join(__dirname, ".auth", "session.json");

setup("Save authenticated session", async ({ page }) => {
  // Ensure .auth dir exists
  mkdirSync(path.dirname(SESSION_FILE), { recursive: true });

  if (existsSync(SESSION_FILE)) {
    console.log("✅ Session file already exists — delete it to re-authenticate.");
    return;
  }

  await page.goto("/register");

  console.log("\n─────────────────────────────────────────────────────────");
  console.log("🔑  Please sign in with Google in the browser window.");
  console.log("    Once you are redirected back to the app, press Enter.");
  console.log("─────────────────────────────────────────────────────────\n");

  // Pause execution and wait for the user to sign in manually
  await page.pause();

  // Wait for the dashboard or register page to confirm login
  await page.waitForURL(/\/(dashboard|register)/, { timeout: 120_000 });

  // Save browser storage (cookies + localStorage) so tests can reuse the session
  await page.context().storageState({ path: SESSION_FILE });

  console.log(`\n✅  Session saved to ${SESSION_FILE}`);
  console.log("    Authenticated E2E tests will now run automatically.\n");
});
