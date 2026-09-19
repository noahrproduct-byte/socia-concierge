// SOCIA demo captures. Records the LIVE app (no mocked UI) via CDP screencast
// at device-pixel resolution, then encodes each clip to a 60fps webm with
// Remotion's bundled ffmpeg. Every clip also drops an approval still into
// captures/stills/ and a meta.json with event markers the Remotion comp uses
// for speed-ramps.
//
// Usage:
//   npm run capture                 # everything
//   npm run capture -- --only=scorer,chat
//   npm run stills                  # re-derive stills from existing frames
//
// Requires DEMO_EMAIL / DEMO_PASSWORD in demo-video/.env (or repo .env.local).

import { chromium, type Browser, type BrowserContext, type Page, type CDPSession } from "playwright";
import { config as dotenv } from "dotenv";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = __dirname;
dotenv({ path: path.join(ROOT, ".env") });
dotenv({ path: path.join(ROOT, "..", ".env.local") });
dotenv({ path: path.join(ROOT, "..", ".env") });

const BASE = process.env.DEMO_BASE_URL ?? "https://socia-concierge.vercel.app";
const EMAIL = process.env.DEMO_EMAIL;
const PASSWORD = process.env.DEMO_PASSWORD;

const CAPTURES = path.join(ROOT, "captures");
const FRAMES = path.join(CAPTURES, "_frames");
const STILLS = path.join(CAPTURES, "stills");
const STATE = path.join(CAPTURES, ".auth", "state.json");
const SAMPLE = path.join(ROOT, "assets", "sample.mp4");

// CDP screencast delivers frames at CSS-pixel size regardless of deviceScaleFactor
// (verified empirically), so the viewport IS the capture resolution. DPR 2 still
// sharpens page.screenshot() output (url-bar.png).
const VIEWPORT = { width: 1920, height: 1080 };
const DPR = 2;

type Marker = { name: string; t: number };
type Meta = { name: string; durationMs: number; frames: number; markers: Marker[]; width: number; height: number };

const argOnly = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",");
const stillsOnly = process.argv.includes("--stills-only");
const smoke = process.argv.includes("--smoke"); // no-auth pipeline test on the public landing page

function log(msg: string) {
  console.log(`[capture] ${msg}`);
}

/* ---------------- screencast recorder ---------------- */

class Recorder {
  private frames: { file: string; t: number }[] = [];
  private t0 = 0;
  private cdp!: CDPSession;
  private dir: string;
  markers: Marker[] = [];
  private size = { w: VIEWPORT.width, h: VIEWPORT.height };

  constructor(private page: Page, private name: string) {
    this.dir = path.join(FRAMES, name);
    fs.rmSync(this.dir, { recursive: true, force: true });
    fs.mkdirSync(this.dir, { recursive: true });
  }

  async start() {
    this.cdp = await this.page.context().newCDPSession(this.page);
    this.t0 = Date.now();
    let i = 0;
    this.cdp.on("Page.screencastFrame", async (ev: { data: string; sessionId: number; metadata: { deviceWidth?: number; deviceHeight?: number } }) => {
      const t = Date.now() - this.t0;
      const file = path.join(this.dir, `f_${String(i++).padStart(6, "0")}.jpg`);
      fs.writeFileSync(file, Buffer.from(ev.data, "base64"));
      this.frames.push({ file, t });
      if (ev.metadata.deviceWidth) this.size = { w: ev.metadata.deviceWidth, h: ev.metadata.deviceHeight ?? this.size.h };
      try {
        await this.cdp.send("Page.screencastFrameAck", { sessionId: ev.sessionId });
      } catch {
        /* stopped */
      }
    });
    await this.cdp.send("Page.startScreencast", {
      format: "jpeg",
      quality: 80,
      maxWidth: VIEWPORT.width,
      maxHeight: VIEWPORT.height,
      everyNthFrame: 1,
    });
  }

  mark(name: string) {
    this.markers.push({ name, t: Date.now() - this.t0 });
    log(`  · marker ${name} @ ${((Date.now() - this.t0) / 1000).toFixed(1)}s`);
  }

  async stop(): Promise<Meta> {
    try {
      await this.cdp.send("Page.stopScreencast");
    } catch {
      /* page may be gone */
    }
    await new Promise((r) => setTimeout(r, 250)); // let in-flight frames land
    const durationMs = Date.now() - this.t0;
    const meta: Meta = {
      name: this.name,
      durationMs,
      frames: this.frames.length,
      markers: this.markers,
      width: this.size.w,
      height: this.size.h,
    };
    fs.writeFileSync(path.join(this.dir, "meta.json"), JSON.stringify({ ...meta, timestamps: this.frames.map((f) => f.t) }, null, 2));
    // a static page legitimately yields very few frames (screencast only emits on repaint)
    if (this.frames.length < 1) throw new Error(`${this.name}: no frames captured`);
    log(`  ${this.frames.length} frames over ${(durationMs / 1000).toFixed(1)}s (~${Math.round((this.frames.length / durationMs) * 1000)}fps)`);
    return meta;
  }
}

/* ---------------- encoding (Remotion's bundled ffmpeg) ---------------- */

function ffmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn("npx", ["remotion", "ffmpeg", ...args], { cwd: ROOT, stdio: ["ignore", "inherit", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}\n${err.slice(-2000)}`))));
  });
}

async function encodeClip(name: string) {
  const dir = path.join(FRAMES, name);
  const raw = JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8")) as Meta & { timestamps: number[] };
  const ts = raw.timestamps;
  const lines = ["ffconcat version 1.0"];
  for (let i = 0; i < ts.length; i++) {
    // the last frame holds until the recording ended, so static stretches keep their real length
    const dur = i + 1 < ts.length ? Math.max(ts[i + 1] - ts[i], 1) / 1000 : Math.max(raw.durationMs - ts[i], 50) / 1000;
    lines.push(`file 'f_${String(i).padStart(6, "0")}.jpg'`, `duration ${dur.toFixed(4)}`);
  }
  const list = path.join(dir, "list.ffconcat");
  fs.writeFileSync(list, lines.join("\n") + "\n");
  const out = path.join(CAPTURES, `${name}.webm`);
  // Remotion's trimmed ffmpeg lacks the fps filter — use -fps_mode cfr -r 60 to
  // conform the vfr concat input to a constant 60fps stream.
  const common = ["-y", "-f", "concat", "-safe", "0", "-i", list, "-fps_mode", "cfr", "-r", "60", "-pix_fmt", "yuv420p"];
  try {
    await ffmpeg([...common, "-c:v", "libvpx-vp9", "-crf", "26", "-b:v", "0", "-row-mt", "1", "-deadline", "good", "-cpu-used", "4", out]);
  } catch (e) {
    log(`  vp9 failed (${(e as Error).message.split("\n")[0]}), falling back to vp8`);
    await ffmpeg([...common, "-c:v", "libvpx", "-b:v", "8M", out]);
  }
  log(`  encoded ${path.relative(ROOT, out)}`);
}

function makeStill(name: string, atMarker?: string) {
  const dir = path.join(FRAMES, name);
  if (!fs.existsSync(path.join(dir, "meta.json"))) return;
  const raw = JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8")) as Meta & { timestamps: number[] };
  let t = raw.durationMs * 0.6;
  if (atMarker) {
    const m = raw.markers.find((x) => x.name === atMarker);
    if (m) t = Math.min(m.t + 800, raw.durationMs - 1);
  }
  let idx = raw.timestamps.findIndex((x) => x >= t);
  if (idx < 0) idx = raw.timestamps.length - 1;
  fs.mkdirSync(STILLS, { recursive: true });
  fs.copyFileSync(path.join(dir, `f_${String(idx).padStart(6, "0")}.jpg`), path.join(STILLS, `${name}.jpg`));
  log(`still → captures/stills/${name}.jpg (t=${(t / 1000).toFixed(1)}s)`);
}

/* ---------------- auth + theme setup ---------------- */

async function ensureAuthState(browser: Browser) {
  // Preferred: a storageState saved by magic-login.ts (passwordless). The
  // email+password path below is the fallback for CI-style repeat runs.
  if (fs.existsSync(STATE)) {
    const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DPR, storageState: STATE });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
    const ok = !/\/login/.test(page.url());
    if (ok) {
      log("reusing saved auth state.");
      await setDarkMode(page);
      await ctx.storageState({ path: STATE }); // also refreshes rotated Supabase tokens
      await ctx.close();
      return;
    }
    await ctx.close();
    log("saved auth state expired — falling back to password login.");
  }
  if (!EMAIL || !PASSWORD) {
    throw new Error("No valid auth state and DEMO_EMAIL / DEMO_PASSWORD not set. Run `npx tsx magic-login.ts request` or fill demo-video/.env.");
  }
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DPR });
  const page = await ctx.newPage();
  log(`logging in at ${BASE}/login …`);
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500); // React hydration — controlled inputs ignore earlier keystrokes
  await page.locator('input[type="email"]').click();
  await page.locator('input[type="email"]').pressSequentially(EMAIL, { delay: 15 });
  await page.locator('input[type="password"]').click();
  await page.locator('input[type="password"]').pressSequentially(PASSWORD, { delay: 15 });
  await page.locator("button.authbtn").click();
  await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 30000 });
  log("logged in.");
  await setDarkMode(page);
  await ctx.storageState({ path: STATE });
  await ctx.close();
  log("auth + dark theme saved.");
}

async function setDarkMode(page: Page) {
  if (await page.evaluate(() => document.documentElement.classList.contains("dark"))) {
    log("dark mode already active.");
    return;
  }
  log("setting dark mode in Settings …");
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const dark = page.locator('[role="radiogroup"][aria-label="Appearance"] button', { hasText: "Dark" }).first();
  const isDark = () => document.documentElement.classList.contains("dark");
  let applied = false;
  for (let attempt = 0; attempt < 3 && !applied; attempt++) {
    await dark.click({ timeout: 15000 });
    applied = await page.waitForFunction(isDark, undefined, { timeout: 4000 }).then(() => true).catch(() => false);
  }
  // The account copy (profiles.appearance) wins over the device copy on every
  // page load (ThemeSync), so make sure it is saved — this is the exact call
  // the Settings toggle makes.
  await page.evaluate(() =>
    fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appearance: "dark" }) }),
  );
  await page.evaluate(() => localStorage.setItem("socia-appearance", "dark"));
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  if (!(await page.evaluate(isDark))) throw new Error("dark mode did not persist after reload");
  log(`dark mode active (toggle click ${applied ? "registered" : "did not register; saved via profile API"}).`);
}

async function withPage(browser: Browser, fn: (page: Page, ctx: BrowserContext) => Promise<void>) {
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DPR, storageState: STATE });
  const page = await ctx.newPage();
  try {
    await fn(page, ctx);
  } finally {
    await ctx.close();
  }
}

/* ---------------- clips ---------------- */

type Clip = { name: string; stillMarker?: string; run: (page: Page, rec: Recorder) => Promise<void> };

const clips: Clip[] = [
  {
    // 1 — /competitors first 6s of load: intel strip counts up, scan sweep, cards stagger.
    name: "competitors-load",
    run: async (page, rec) => {
      await page.goto("about:blank");
      await rec.start();
      rec.mark("navigate");
      await page.goto(`${BASE}/competitors`, { waitUntil: "domcontentloaded" });
      await page.locator(".cx2-intel").waitFor({ timeout: 20000 });
      rec.mark("intel-visible");
      await page.waitForTimeout(6000);
    },
  },
  {
    // 2 — click a different competitor chip; the page re-derives (chart redraw, gap bars regrow).
    name: "competitors-click",
    stillMarker: "chip-click",
    run: async (page, rec) => {
      await page.goto(`${BASE}/competitors`, { waitUntil: "domcontentloaded" });
      await page.locator(".cx2-chip-card").first().waitFor({ timeout: 20000 });
      await page.waitForTimeout(3500); // let the load animation finish — this clip is about the re-derive
      await rec.start();
      await page.waitForTimeout(700);
      const other = page.locator(".cx2-chip-card:not(.you):not(.selected)").first();
      if (await other.count()) {
        rec.mark("chip-click");
        await other.click();
        await page.waitForTimeout(3000);
      } else {
        // single tracked competitor: re-derive the trajectory view instead, then
        // travel down to the gap bars — both real interactions on the live page
        rec.mark("chip-click");
        await page.locator(".cx2-card button", { hasText: "Views" }).first().click();
        await page.waitForTimeout(900);
        await page.locator(".cx2-card button", { hasText: "Followers" }).first().click();
        await page.waitForTimeout(900);
      }
      rec.mark("scroll");
      await page.evaluate(() => window.scrollTo({ top: 900, behavior: "smooth" }));
      await page.waitForTimeout(1800);
      rec.mark("gap-bars");
      await page.evaluate(() => window.scrollTo({ top: 1400, behavior: "smooth" }));
      await page.waitForTimeout(2000);
    },
  },
  {
    // 3 — Content Studio (the scorer; /scorer redirects here): upload sample.mp4,
    //     record frame extraction → score ring → click a "Jump to" fix (video seeks).
    name: "scorer",
    stillMarker: "score-visible",
    run: async (page, rec) => {
      if (!fs.existsSync(SAMPLE)) throw new Error(`missing ${path.relative(ROOT, SAMPLE)} — drop a sample video there first.`);
      await page.goto(`${BASE}/studio`, { waitUntil: "domcontentloaded" });
      await page.locator('input[type="file"]').waitFor({ state: "attached", timeout: 20000 });
      await page.waitForTimeout(1500);
      await rec.start();
      await page.waitForTimeout(600);
      rec.mark("upload");
      await page.locator('input[type="file"]').setInputFiles(SAMPLE);
      rec.mark("extracting");
      await page.locator(".st-ring").waitFor({ timeout: 180000 });
      rec.mark("score-visible");
      await page.waitForTimeout(2500);
      const jump = page.locator(".st-fix button", { hasText: "Jump to" }).first();
      if (await jump.count()) {
        await jump.scrollIntoViewIfNeeded();
        await page.waitForTimeout(400);
        rec.mark("fix-click");
        await jump.click();
      } else {
        rec.mark("fix-missing");
      }
      await page.waitForTimeout(2500);
    },
  },
  {
    // 4 — /dashboard first 4s of load (counters + charts animating).
    name: "dashboard",
    run: async (page, rec) => {
      await page.goto("about:blank");
      await rec.start();
      rec.mark("navigate");
      await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(4500);
    },
  },
  {
    // 5 — open Ask SOCIA, type the question, record the streamed answer.
    name: "chat",
    stillMarker: "answer-start",
    run: async (page, rec) => {
      await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(3000);
      await rec.start();
      await page.waitForTimeout(500);
      const opener = page.locator('a[href^="/chat"], button:has-text("Ask SOCIA")').first();
      rec.mark("open-drawer");
      await opener.click({ timeout: 15000 });
      const input = page.locator('input[aria-label="Ask SOCIA"]');
      await input.waitFor({ timeout: 15000 });
      await page.waitForTimeout(600);
      rec.mark("typing");
      await input.pressSequentially("why did my reach drop this week?", { delay: 45 });
      await page.waitForTimeout(300);
      rec.mark("send");
      await input.press("Enter");
      await page.locator(".ask-msg.assistant").first().waitFor({ timeout: 90000 });
      rec.mark("answer-start");
      // let the streamed answer land; stop once the typing dots are gone (or after 25s)
      await page
        .waitForFunction(() => !document.querySelector(".ask-typing"), undefined, { timeout: 25000 })
        .catch(() => undefined);
      rec.mark("answer-done");
      await page.waitForTimeout(2500);
    },
  },
];

/* ---------------- main ---------------- */

async function main() {
  fs.mkdirSync(CAPTURES, { recursive: true });
  const wanted = clips.filter((c) => !argOnly || argOnly.includes(c.name));

  if (stillsOnly) {
    for (const c of clips) makeStill(c.name, c.stillMarker);
    return;
  }

  // real Chrome: Playwright's bundled Chromium has no H.264, which the studio's
  // in-browser frame extraction needs for the sample mp4
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  try {
    if (smoke) {
      const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DPR });
      const page = await ctx.newPage();
      const rec = new Recorder(page, "smoke");
      await page.goto("about:blank");
      await rec.start();
      await page.goto(BASE, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(4000);
      await rec.stop();
      await ctx.close();
      await encodeClip("smoke");
      makeStill("smoke");
      return;
    }
    await ensureAuthState(browser);

    for (const clip of wanted) {
      log(`▶ ${clip.name}`);
      try {
        await withPage(browser, async (page) => {
          const rec = new Recorder(page, clip.name);
          await clip.run(page, rec);
          await rec.stop();
        });
        await encodeClip(clip.name);
        makeStill(clip.name, clip.stillMarker);
      } catch (e) {
        log(`✖ ${clip.name} FAILED: ${(e as Error).message}`);
        process.exitCode = 1;
      }
    }

    // 6 — url-bar.png: full-page shot of /competitors. Headless Chromium has no
    // browser chrome, so the Remotion comp composites a URL bar overlay on top.
    if (!argOnly || argOnly.includes("url-bar")) {
      log("▶ url-bar.png");
      await withPage(browser, async (page) => {
        await page.goto(`${BASE}/competitors`, { waitUntil: "domcontentloaded" });
        await page.locator(".cx2-intel").waitFor({ timeout: 20000 });
        await page.waitForTimeout(5000);
        await page.screenshot({ path: path.join(CAPTURES, "url-bar.png"), fullPage: true });
      });
      log("  saved captures/url-bar.png");
    }
  } finally {
    await browser.close();
  }
  log("done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
