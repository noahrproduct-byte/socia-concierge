// Populates the demo account with REAL data through the app's own UI — no
// database writes, nothing invented. YouTube competitors publish genuine
// public stats (subs, uploads, views), and "Refresh" runs SOCIA's real
// intel/discovery pipeline. Everything here is reversible from the Add
// Competitor drawer.
//
//   npx tsx seed.ts              (needs captures/.auth/state.json from a capture run)

import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";

const ROOT = __dirname;
const BASE = process.env.DEMO_BASE_URL ?? "https://socia-concierge.vercel.app";
const STATE = path.join(ROOT, "captures", ".auth", "state.json");
const CHANNELS = ["GugaFoods", "SamTheCookingGuy", "JoshuaWeissman"]; // real food/burger creators

async function main() {
  if (!fs.existsSync(STATE)) throw new Error("no auth state — run `npm run capture` once first");
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, storageState: STATE });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/competitors`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  // add YouTube competitors through the drawer
  await page.locator("button", { hasText: "Add Competitor" }).first().click();
  const drawer = page.locator('[role="group"][aria-label="Platform"]');
  await drawer.waitFor({ timeout: 15000 });
  await drawer.locator("button", { hasText: "YouTube" }).click();
  for (const ch of CHANNELS) {
    const input = page.locator('input[aria-label="Competitor handle"]');
    await input.fill("");
    await input.pressSequentially(`@${ch}`, { delay: 15 });
    await page.locator(".cx-add-form button[type=submit]").click();
    const ok = await page
      .locator(".cx-add li", { hasText: new RegExp(ch, "i") })
      .first()
      .waitFor({ timeout: 40000 })
      .then(() => true)
      .catch(() => false);
    const err = ok ? null : await page.locator(".cx-add .authmsg, .cx-add [class*=err]").first().textContent().catch(() => null);
    console.log(`@${ch}: ${ok ? "tracked" : `FAILED ${err ?? "(no error text)"}`}`);
  }
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);

  // run the real intel / discovery refresh
  const refresh = page.locator('button[aria-label="Refresh competitor and niche data"]').first();
  if (await refresh.count()) {
    console.log("running Refresh (intel + discovery)…");
    await refresh.click();
    await page.waitForFunction(
      () => !document.querySelector('button[aria-label="Refresh competitor and niche data"].busy'),
      undefined,
      { timeout: 240000 },
    ).catch(() => console.log("refresh still busy after 4min — continuing"));
  }
  await page.goto(`${BASE}/competitors`, { waitUntil: "networkidle" });
  await page.waitForTimeout(4000);
  const chips = await page.locator(".cx2-chip-card").count();
  console.log(`competitor chips on page: ${chips}`);
  fs.mkdirSync(path.join(ROOT, "captures"), { recursive: true });
  await page.screenshot({ path: path.join(ROOT, "captures", "_seed-competitors.png") });
  console.log("shot: captures/_seed-competitors.png");
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
