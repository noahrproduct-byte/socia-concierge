// The QA sweep's shared fixture: every test gets a `sweep` that records what
// a person would never see but a bug report needs (console errors and
// warnings, failed and slow requests, page errors), runs the generic checks
// on a screen (horizontal overflow, broken images, nameless buttons, links
// that 404) and saves a screenshot under docs/qa/screenshots. Findings are
// written to docs/qa/sweep/<project>/<plan>-<screen>.json so the report can
// be assembled after the run.
import { test as base, expect, type Page, type Request, type Response } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export const SLOW_MS = 2000;
const ROOT = path.resolve(__dirname, "../..");
export const SHOTS = path.join(ROOT, "docs/qa/screenshots");
const SWEEP = path.join(ROOT, "docs/qa/sweep");

export type Finding = { kind: string; detail: string; where?: string };

export type ScreenReport = {
  plan: string;
  screen: string;
  url: string;
  project: string;
  title: string;
  findings: Finding[];
  consoleErrors: string[];
  consoleWarnings: string[];
  pageErrors: string[];
  failedRequests: { url: string; status: number | string; method: string }[];
  slowRequests: { url: string; ms: number }[];
  screenshot: string | null;
};

// Noise that is not a bug of the page under test.
const IGNORE_CONSOLE = [
  /Download the React DevTools/,
  /\[Fast Refresh\]/,
  /was preloaded using link preload but not used/,
  /hydration/i, // reported separately as a page error when real
];
const IGNORE_URL = [/\/_next\/static\//, /\/__nextjs/, /hot-update/, /favicon/];

export class Sweep {
  readonly page: Page;
  readonly project: string;
  plan = "signed-out";
  private consoleErrors: string[] = [];
  private consoleWarnings: string[] = [];
  private pageErrors: string[] = [];
  private failed: ScreenReport["failedRequests"] = [];
  private slow: ScreenReport["slowRequests"] = [];
  private started = new Map<Request, number>();
  readonly reports: ScreenReport[] = [];

  constructor(page: Page, project: string) {
    this.page = page;
    this.project = project;
    page.on("console", (m) => {
      const text = m.text();
      if (IGNORE_CONSOLE.some((r) => r.test(text))) return;
      if (m.type() === "error") this.consoleErrors.push(text.slice(0, 500));
      else if (m.type() === "warning") this.consoleWarnings.push(text.slice(0, 500));
    });
    page.on("pageerror", (e) => this.pageErrors.push(String(e.message ?? e).slice(0, 500)));
    page.on("request", (r) => this.started.set(r, Date.now()));
    page.on("requestfailed", (r) => {
      if (IGNORE_URL.some((x) => x.test(r.url()))) return;
      // A prefetch or media request the browser itself cancelled is not a failure.
      if (r.failure()?.errorText === "net::ERR_ABORTED") return;
      this.failed.push({ url: r.url(), status: r.failure()?.errorText ?? "failed", method: r.method() });
    });
    page.on("response", (res: Response) => {
      const req = res.request();
      const url = res.url();
      if (IGNORE_URL.some((x) => x.test(url))) return;
      const t0 = this.started.get(req);
      if (t0) {
        const ms = Date.now() - t0;
        if (ms > SLOW_MS) this.slow.push({ url, ms });
      }
      if (res.status() >= 400) this.failed.push({ url, status: res.status(), method: req.method() });
    });
  }

  /** Forget what was collected so far (call after navigating to a new screen). */
  reset() {
    this.consoleErrors = [];
    this.consoleWarnings = [];
    this.pageErrors = [];
    this.failed = [];
    this.slow = [];
    this.started.clear();
  }

  /** Visit a path, let it settle, and start a fresh collection for it. */
  async open(pathname: string, opts: { wait?: "networkidle" | "load" | "domcontentloaded"; settleMs?: number } = {}) {
    this.reset();
    await this.page.goto(pathname, { waitUntil: opts.wait ?? "load" });
    await this.page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => null);
    await this.page.waitForTimeout(opts.settleMs ?? 800);
  }

  /** Generic checks on whatever is on screen now. */
  async inspect(): Promise<Finding[]> {
    const page = this.page;
    const r = await page.evaluate(() => {
      const out: { kind: string; detail: string; where?: string }[] = [];
      const vw = window.innerWidth;
      const doc = document.scrollingElement ?? document.documentElement;
      if (doc.scrollWidth > vw + 1) out.push({ kind: "layout", detail: `page scrolls sideways: content ${doc.scrollWidth}px wide in a ${vw}px viewport` });
      // Elements poking out of the viewport on the right (first few, by size).
      const wide: string[] = [];
      for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
        if (wide.length >= 5) break;
        const cs = getComputedStyle(el);
        if (cs.position === "fixed" || cs.display === "none" || cs.visibility === "hidden") continue;
        const b = el.getBoundingClientRect();
        if (b.width > 0 && b.right > vw + 2 && b.left < vw) {
          const id = el.id ? `#${el.id}` : el.className && typeof el.className === "string" ? `.${el.className.split(/\s+/).filter(Boolean).slice(0, 2).join(".")}` : "";
          wide.push(`${el.tagName.toLowerCase()}${id} (right edge ${Math.round(b.right)}px)`);
        }
      }
      if (wide.length) out.push({ kind: "layout", detail: `elements wider than the viewport: ${wide.join("; ")}` });
      if (!document.title.trim()) out.push({ kind: "a11y", detail: "page has no <title>" });
      if (!document.querySelector("h1")) out.push({ kind: "a11y", detail: "page has no h1" });
      // Broken images.
      for (const img of Array.from(document.images)) {
        if (img.complete && img.naturalWidth === 0 && img.src && !img.src.startsWith("data:")) out.push({ kind: "asset", detail: `broken image ${img.src.slice(0, 160)}` });
      }
      // Buttons and links a screen reader would announce as nothing.
      const nameless: string[] = [];
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("button, a[href], [role=button]"))) {
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        const name = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("title") || "").trim();
        const labelled = el.getAttribute("aria-labelledby");
        const hasImgAlt = Array.from(el.querySelectorAll("img[alt], svg[aria-label], svg title")).length > 0;
        if (!name && !labelled && !hasImgAlt) nameless.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.split(/\s+/)[0] : ""}`);
      }
      if (nameless.length) out.push({ kind: "a11y", detail: `${nameless.length} control(s) without an accessible name: ${Array.from(new Set(nameless)).slice(0, 6).join(", ")}` });
      // Dead links.
      const dead = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href="#"], a[href=""], a:not([href])')).filter((a) => getComputedStyle(a).display !== "none");
      if (dead.length) out.push({ kind: "dead-control", detail: `${dead.length} link(s) that go nowhere: ${dead.slice(0, 5).map((a) => (a.textContent || "").trim().slice(0, 40) || "(no text)").join(" | ")}` });
      // Text that looks like a placeholder or a template leak.
      const body = document.body.innerText;
      for (const needle of ["undefined", "NaN", "[object Object]", "null null", "Lorem ipsum", "TODO"]) {
        const i = body.indexOf(needle);
        if (i >= 0) out.push({ kind: "copy", detail: `"${needle}" appears on the page: …${body.slice(Math.max(0, i - 40), i + 40).replace(/\s+/g, " ")}…` });
      }
      return out;
    });
    return r;
  }

  /** Every internal link on the page, checked with a GET; 404s and 500s are findings. */
  async checkLinks(limit = 60): Promise<Finding[]> {
    const hrefs = await this.page.evaluate(() =>
      Array.from(new Set(Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).map((a) => a.getAttribute("href") || "").filter((h) => h.startsWith("/") && !h.startsWith("//")))),
    );
    const out: Finding[] = [];
    const ctx = this.page.context();
    for (const href of hrefs.slice(0, limit)) {
      const res = await ctx.request.get(href, { maxRedirects: 5, timeout: 20_000 }).catch(() => null);
      if (!res) out.push({ kind: "link", detail: `${href}: no response` });
      else if (res.status() >= 400) out.push({ kind: "link", detail: `${href} answers ${res.status()}` });
    }
    return out;
  }

  /** Save a screenshot and the collected report for this screen. */
  async record(screen: string, extra: Finding[] = [], opts: { fullPage?: boolean; links?: boolean } = {}) {
    const name = `${this.plan}-${screen}-${this.project}`;
    mkdirSync(SHOTS, { recursive: true });
    const shot = path.join(SHOTS, `${name}.png`);
    let screenshot: string | null = null;
    try {
      await this.page.screenshot({ path: shot, fullPage: opts.fullPage ?? true });
      screenshot = path.relative(ROOT, shot);
    } catch {
      screenshot = null;
    }
    const findings = [...(await this.inspect().catch((e) => [{ kind: "harness", detail: `inspect failed: ${String(e).slice(0, 200)}` }])), ...extra];
    if (opts.links) findings.push(...(await this.checkLinks().catch(() => [])));
    const report: ScreenReport = {
      plan: this.plan,
      screen,
      url: this.page.url(),
      project: this.project,
      title: await this.page.title().catch(() => ""),
      findings,
      consoleErrors: Array.from(new Set(this.consoleErrors)),
      consoleWarnings: Array.from(new Set(this.consoleWarnings)),
      pageErrors: Array.from(new Set(this.pageErrors)),
      failedRequests: this.failed,
      slowRequests: this.slow,
      screenshot,
    };
    this.reports.push(report);
    const dir = path.join(SWEEP, this.project);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `${this.plan}-${screen}.json`), JSON.stringify(report, null, 2));
    return report;
  }
}

export const test = base.extend<{ sweep: Sweep }>({
  // Playwright's fixture callback is named `use` by convention; `provide` keeps the React hook lint quiet.
  sweep: async ({ page }, provide, testInfo) => {
    const s = new Sweep(page, testInfo.project.name);
    await provide(s);
  },
});

export { expect };

/** Credentials for a plan's test account, from the environment; undefined when not set up. */
export function account(plan: string): { email: string; password: string } | null {
  const email = process.env[`QA_${plan.toUpperCase()}_EMAIL`];
  const password = process.env[`QA_${plan.toUpperCase()}_PASSWORD`];
  return email && password ? { email, password } : null;
}
