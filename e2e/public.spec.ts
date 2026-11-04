// Signed-out sweep: every public page at desktop and phone widths, the
// protected-page redirect, the 404 page, and the sign-in forms' own
// validation (nothing here needs a backend account).
import { test, expect } from "./lib/sweep";

const PUBLIC = [
  ["landing", "/"],
  ["pricing", "/pricing"],
  ["login", "/login"],
  ["signup", "/signup"],
  ["forgot-password", "/forgot-password"],
  ["reset-password", "/reset-password"],
  ["privacy", "/privacy"],
  ["terms", "/terms"],
  ["data-deletion", "/data-deletion"],
  ["not-found", "/this-page-does-not-exist"],
  ["link-page-missing", "/l/no-such-link"],
  ["invite-missing", "/invite/no-such-token"],
] as const;

for (const [screen, pathname] of PUBLIC) {
  test(`public: ${screen}`, async ({ sweep }) => {
    await sweep.open(pathname);
    // The landing hero is a scroll-driven stage, which a full-page capture leaves blank: shoot it at viewport size.
    const r = await sweep.record(screen, [], { links: screen === "landing" || screen === "pricing", fullPage: screen !== "landing" });
    expect(r.pageErrors, "no uncaught page errors").toEqual([]);
  });
}

test("protected pages redirect to login when signed out", async ({ sweep, page }) => {
  const extra = [];
  for (const p of ["/dashboard", "/studio", "/plan", "/settings", "/analytics", "/discover", "/chat", "/reports", "/comments", "/contacts", "/create", "/roundup", "/onboarding", "/niche", "/scorer"]) {
    await page.goto(p, { waitUntil: "domcontentloaded" });
    const url = new URL(page.url());
    if (url.pathname !== "/login") extra.push({ kind: "auth", detail: `${p} did not redirect to /login (landed on ${url.pathname})` });
  }
  await sweep.open("/login");
  await sweep.record("protected-redirect", extra, { fullPage: false });
  expect(extra).toEqual([]);
});

test("login form validates before sending", async ({ sweep, page }) => {
  await sweep.open("/login");
  await page.locator("#login-email").fill("not-an-email");
  await page.locator("#login-password").fill("x");
  await page.locator("button.authbtn[type=submit]").click();
  await page.waitForTimeout(800);
  // Browser-level validation (type=email) keeps the form on the page.
  expect(new URL(page.url()).pathname).toBe("/login");
  await sweep.record("login-invalid", [], { fullPage: false });
});

test("signup form validates before sending", async ({ sweep, page }) => {
  await sweep.open("/signup");
  await page.locator("#signup-email").fill("someone@example.com");
  await page.locator("#signup-password").fill("short");
  await page.locator("button.authbtn[type=submit]").click();
  await page.waitForTimeout(800);
  expect(new URL(page.url()).pathname).toBe("/signup");
  await sweep.record("signup-short-password", [], { fullPage: false });
});

test("pricing: plan buttons when signed out", async ({ sweep, page }) => {
  await sweep.open("/pricing");
  const buttons = await page.locator("main button, main a.btn, main a[class*=cta], main a[href*=signup], main a[href*=login]").allInnerTexts();
  await sweep.record("pricing-buttons", [{ kind: "info", detail: `plan actions seen: ${buttons.map((b) => b.trim()).filter(Boolean).join(" | ")}` }], { fullPage: false });
});

// Regression checks for the signed-out findings in docs/qa/bug-report.md.
test("QA-01 pricing has one h1", async ({ page }) => {
  await page.goto("/pricing", { waitUntil: "load" });
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("h1")).toHaveText("Know what to do next.");
});

test("QA-02 landing headline reads as one sentence", async ({ page }) => {
  await page.goto("/", { waitUntil: "load" });
  const text = await page.locator("h1#hm-h1").evaluate((el) => (el.textContent || "").replace(/\s+/g, " ").trim());
  expect(text).toBe("Know what to post next.");
});

test("QA-03 auth and 404 pages have their own tab titles", async ({ page }) => {
  const want: [string, string][] = [
    ["/login", "Log in | SOCIA"],
    ["/signup", "Sign up | SOCIA"],
    ["/forgot-password", "Forgot password | SOCIA"],
    ["/reset-password", "Reset password | SOCIA"],
    ["/this-page-does-not-exist", "Page not found | SOCIA"],
  ];
  for (const [path, title] of want) {
    await page.goto(path, { waitUntil: "load" });
    await expect(page, path).toHaveTitle(title);
    expect(await page.title(), `${path} title has no em dash`).not.toContain(String.fromCharCode(0x2014));
  }
});

test("QA-04 pricing table says it scrolls on a phone", async ({ page }, testInfo) => {
  await page.goto("/pricing", { waitUntil: "load" });
  const hint = page.locator(".pr-scroll-hint");
  if (testInfo.project.name === "mobile") {
    await expect(hint).toBeVisible();
    const wrap = page.locator(".pr-table-wrap");
    const scrolls = await wrap.evaluate((el) => el.scrollWidth > el.clientWidth && getComputedStyle(el).overflowX === "auto");
    expect(scrolls, "the table scrolls inside its card").toBe(true);
    const pageScrolls = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(pageScrolls, "the page itself does not scroll sideways").toBe(false);
  } else {
    await expect(hint).toBeHidden();
  }
});

test("QA-05 a missing sign-up link is a 404 that says so", async ({ page }) => {
  const res = await page.goto("/l/no-such-link", { waitUntil: "load" });
  expect(res?.status()).toBe(404);
  await expect(page).toHaveTitle("Page not found | SOCIA");
});

test("QA-06 the 404 page wears the site's look and keeps its title", async ({ page }) => {
  await page.goto("/this-page-does-not-exist", { waitUntil: "load" });
  // No navy screen, no gradient buttons: the page ground and the system buttons.
  const bg = await page.locator(".nf-page").evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).not.toBe("rgb(11, 18, 32)");
  const gradients = await page.evaluate(() => [...document.querySelectorAll("a, .nf-page *")].filter((el) => getComputedStyle(el).backgroundImage.includes("gradient")).length);
  expect(gradients, "no gradient buttons").toBe(0);
  await expect(page.locator("a.s-btn--primary")).toHaveText("Go to Dashboard");
  // The title must survive hydration: an inline <title> used to lose to the site default.
  await page.waitForTimeout(1500);
  await expect(page).toHaveTitle("Page not found | SOCIA");
});
