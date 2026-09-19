// Passwordless auth for the capture pipeline, PKCE-aware.
//
//   npx tsx magic-login.ts request
//   npx tsx magic-login.ts complete "<emailed link, bounced URL, or bare code>"
//
// "request" asks the app's login page for a magic link and saves the pre-auth
// cookies (the PKCE code-verifier @supabase/ssr sets) — the exchange only
// works from this same cookie jar. "complete" accepts whatever you have:
//   - the emailed verify link (https://…supabase.co/auth/v1/verify?token=…)
//   - the URL it bounced to, even a dead localhost:3000 one with ?code=…
//   - the bare code itself
// It funnels the code through the LIVE site's /auth/callback, which sets the
// session; then it flips the app to dark mode and saves storageState for
// capture.ts. No password is used anywhere.

import { chromium } from "playwright";
import { config as dotenv } from "dotenv";
import path from "node:path";
import fs from "node:fs";

const ROOT = __dirname;
dotenv({ path: path.join(ROOT, ".env") });

const BASE = process.env.DEMO_BASE_URL ?? "https://socia-concierge.vercel.app";
const EMAIL = process.env.DEMO_EMAIL;
if (!EMAIL) throw new Error("DEMO_EMAIL missing from demo-video/.env");

const AUTH_DIR = path.join(ROOT, "captures", ".auth");
const PRELOGIN = path.join(AUTH_DIR, "prelogin.json");
const STATE = path.join(AUTH_DIR, "state.json");
const phase = process.argv[2];

async function run() {
  const browser = await chromium.launch({ headless: true, channel: "chrome" });

  if (phase === "request") {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500); // React hydration — typed input registers only after
    const email = page.locator('input[type="email"]');
    await email.click();
    await email.pressSequentially(EMAIL, { delay: 20 });
    await page.locator("button.linkbtn", { hasText: "magic link" }).click();
    await page.locator(".authmsg").waitFor({ timeout: 20000 });
    console.log("message:", (await page.locator(".authmsg").textContent())?.trim());
    fs.mkdirSync(AUTH_DIR, { recursive: true });
    await ctx.storageState({ path: PRELOGIN }); // holds the PKCE code-verifier cookie
    console.log("pre-auth cookies saved. Now: copy the link from the email (don't click it) and run the complete phase.");
  } else if (phase === "complete") {
    const arg = process.argv[3];
    if (!arg) throw new Error('usage: magic-login.ts complete "<link or code>"');
    if (!fs.existsSync(PRELOGIN)) throw new Error("no pre-auth cookies — run the request phase first (same run pair).");

    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: PRELOGIN });
    const page = await ctx.newPage();

    // Wherever the verify redirect tries to land (e.g. a dead localhost:3000
    // Site URL), serve a stub so the final URL — with ?code= or error params —
    // is still inspectable.
    await ctx.route("http://localhost:3000/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<title>bounce</title>ok" }),
    );

    let code: string | null = null;
    const fromUrl = (u: string) => {
      try {
        const parsed = new URL(u);
        return parsed.searchParams.get("code");
      } catch {
        return null;
      }
    };

    if (/^https?:\/\//.test(arg)) {
      code = fromUrl(arg);
      if (!code && /supabase\.co\/auth\/v1\/verify/.test(arg)) {
        await page.goto(arg, { waitUntil: "load" }).catch(() => undefined);
        await page.waitForTimeout(1000);
        const landed = page.url();
        code = fromUrl(landed);
        if (!code) {
          const err = new URL(landed).searchParams.get("error_description") ?? landed;
          throw new Error(`verify link did not yield a code: ${err}`);
        }
      }
      if (!code) throw new Error("no ?code= found in that URL — paste the emailed link or the bounced URL including its query string.");
    } else {
      code = arg.trim();
    }

    console.log("exchanging code via live /auth/callback …");
    await page.goto(`${BASE}/auth/callback?code=${encodeURIComponent(code)}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    if (/login\?error/.test(page.url())) throw new Error("code exchange failed (expired/used code, or cookies from a different request run). Re-run the request phase for a fresh link.");
    console.log("authenticated, landed on:", page.url());

    console.log("setting dark mode in Settings…");
    await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
    const dark = page.locator('[role="radiogroup"][aria-label="Appearance"] button', { hasText: "Dark" }).first();
    await dark.click({ timeout: 15000 });
    await page.waitForFunction(() => document.documentElement.classList.contains("dark"), undefined, { timeout: 10000 });
    await page.waitForTimeout(600);

    await ctx.storageState({ path: STATE });
    console.log("saved auth state → captures/.auth/state.json — ready for npm run capture");
  } else {
    throw new Error("phase must be request | complete <link-or-code>");
  }

  await browser.close();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
