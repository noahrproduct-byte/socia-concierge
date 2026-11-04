// Signed-in sweep, once per plan. Each plan's test account comes from the
// environment (QA_FREE_EMAIL / QA_FREE_PASSWORD, QA_STARTER_…, QA_GROWTH_…,
// QA_PRO_…); a plan without credentials is skipped, never faked. The dev
// server must point at a TEST backend (a local Supabase stack or a test
// project): nothing here must ever run against production.
import { test, expect, account, type Finding } from "./lib/sweep";
import { NAV } from "../lib/nav";
import { PLAN_ORDER, FEATURE_MIN_PLAN, planRank, type FeatureKey, type PlanId } from "../lib/plans";

// Screens beyond the sidebar: Studio modes, Ask SOCIA, the strategy and
// niche pages, and the Settings sections.
const EXTRA_SCREENS: [string, string][] = [
  ["plan-strategy", "/plan/strategy"],
  ["studio-rate", "/studio"],
  ["studio-build", "/studio?mode=clips"],
  ["studio-edit", "/studio?mode=edit"],
  ["studio-audio", "/studio?mode=audio"],
  ["chat", "/chat"],
  ["niche", "/niche"],
  ["scorer", "/scorer"],
  ["settings-plan", "/settings#plan"],
  ["settings-accounts", "/settings#accounts"],
  ["settings-team", "/settings#team"],
  ["settings-workspaces", "/settings#workspaces"],
  ["onboarding-again", "/onboarding"],
];

// A page that is for a higher plan must say so (a plan notice with an
// upgrade link), and a page the plan includes must not block the whole screen.
const PAGE_FEATURE: Record<string, FeatureKey> = {
  "/comments": "comment_replies",
  "/contacts": "contacts",
  "/roundup": "weekly_trend_roundup",
};

async function login(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login", { waitUntil: "load" });
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.locator("button.authbtn[type=submit]").click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
}

for (const plan of PLAN_ORDER as PlanId[]) {
  const creds = account(plan);
  test.describe(`${plan} plan`, () => {
    test.skip(!creds, `no QA_${plan.toUpperCase()}_EMAIL / _PASSWORD in the environment`);

    test.beforeEach(async ({ sweep, page }) => {
      sweep.plan = plan;
      await login(page, creds!.email, creds!.password);
    });

    test("signs in and lands on the dashboard", async ({ sweep, page }) => {
      const landed = new URL(page.url()).pathname;
      const extra: Finding[] = [];
      if (landed !== "/dashboard" && landed !== "/onboarding") extra.push({ kind: "auth", detail: `after login landed on ${landed}` });
      await sweep.open(landed);
      await sweep.record("after-login", extra);
      expect(extra).toEqual([]);
    });

    for (const n of NAV) {
      test(`screen: ${n.key}`, async ({ sweep, page }) => {
        await sweep.open(n.href, { settleMs: 1500 });
        const extra: Finding[] = [];
        const feature = PAGE_FEATURE[n.href];
        if (feature) {
          const included = planRank(plan) >= planRank(FEATURE_MIN_PLAN[feature]);
          const notice = page.locator(".pn");
          const hasNotice = (await notice.count()) > 0;
          if (!included && !hasNotice) extra.push({ kind: "gating", detail: `${n.href} needs ${FEATURE_MIN_PLAN[feature]} but ${plan} sees no plan notice (gating leak?)` });
          if (included && hasNotice) {
            const text = (await notice.first().innerText()).replace(/\s+/g, " ").slice(0, 160);
            extra.push({ kind: "gating", detail: `${n.href} is included in ${plan} but shows a plan notice: "${text}"` });
          }
        }
        const r = await sweep.record(n.key, extra, { links: true });
        expect(r.pageErrors).toEqual([]);
        expect(extra.filter((f) => f.kind === "gating")).toEqual([]);
      });
    }

    for (const [screen, href] of EXTRA_SCREENS) {
      test(`screen: ${screen}`, async ({ sweep }) => {
        await sweep.open(href, { settleMs: 1500 });
        const r = await sweep.record(screen);
        expect(r.pageErrors).toEqual([]);
      });
    }

    test("ask SOCIA answers or says why it cannot", async ({ sweep, page }) => {
      await sweep.open("/chat", { settleMs: 1500 });
      const box = page.locator("textarea, input[type=text]").first();
      if (!(await box.count())) {
        await sweep.record("chat-ask", [{ kind: "dead-control", detail: "no message box on /chat" }]);
        return;
      }
      await box.fill("What should I post this week?");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(8000);
      await sweep.record("chat-ask", [], { fullPage: false });
    });

    test("plan and billing section", async ({ sweep, page }) => {
      await sweep.open("/settings#plan", { settleMs: 1500 });
      const section = page.locator("#plan");
      const text = (await section.innerText().catch(() => "")).replace(/\s+/g, " ");
      const extra: Finding[] = [{ kind: "info", detail: `plan section says: ${text.slice(0, 300)}` }];
      await sweep.record("billing", extra, { fullPage: false });
    });

    test("signs out and is kept out", async ({ sweep, page }) => {
      await sweep.open("/dashboard");
      const res = await page.request.post("/auth/signout", { maxRedirects: 0 });
      const extra: Finding[] = [];
      if (res.status() !== 303) extra.push({ kind: "auth", detail: `sign-out answered ${res.status()}` });
      await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
      if (new URL(page.url()).pathname !== "/login") extra.push({ kind: "auth", detail: `still on ${new URL(page.url()).pathname} after signing out` });
      await sweep.record("after-logout", extra, { fullPage: false });
      expect(extra).toEqual([]);
    });
  });
}
