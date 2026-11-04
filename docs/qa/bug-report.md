# QA sweep: bug report

Branch `qa-sweep`. Started 2026-11-03. Screenshots are in `docs/qa/screenshots/` (`<plan>-<screen>-<desktop|mobile>.png`); the raw per-screen findings the sweep collected are in `docs/qa/sweep/<desktop|mobile>/`.

Severity: **Critical** (data loss, money, security, cannot use the product), **High** (a main flow is broken or misleading), **Medium** (a flow works but with a wrong state, error or layout fault), **Low** (polish, wording, accessibility, minor layout).

## Status

| Phase | State |
| --- | --- |
| 1. Signed-out sweep (desktop and phone) | Done: 12 public screens, protected-page redirects, form validation |
| 1. Signed-in sweep per plan (Free, Starter, Growth, Pro) | **Blocked on a test backend** (see "Blocked") |
| 1. Production runtime errors from Vercel | **Blocked**: the connected Vercel account is not on the SOCIA team |
| 2. Fixes with a test each | Done for the signed-out findings (QA-01 to QA-05, each with a Playwright check in `e2e/public.spec.ts`) |
| 3. Rerun, tests, build, push | Pending |

## How the sweep runs

- `npm run test:e2e` runs `e2e/*.spec.ts` with Playwright against a dev server on `QA_BASE_URL` (default `http://localhost:3006`), once at 1280 x 900 and once at 375 x 812 (Pixel 7 emulation).
- Every screen is recorded by `e2e/lib/sweep.ts`: console errors and warnings, uncaught page errors, requests that failed or answered 4xx/5xx, requests slower than 2 s, sideways scrolling and elements wider than the viewport, broken images, controls without an accessible name, links that go nowhere, placeholder text (`undefined`, `NaN`, `TODO`), and on the landing and pricing pages every internal link is fetched and 4xx/5xx answers are noted.
- `e2e/app.spec.ts` signs in once per plan with `QA_<PLAN>_EMAIL` / `QA_<PLAN>_PASSWORD` and walks every sidebar section, the Studio modes, Ask SOCIA, Settings and billing, then signs out. A plan without credentials is skipped, never faked.
- The sweep is only ever pointed at a test backend. Nothing in it touches production, Stripe live mode, or a real Instagram, TikTok, Facebook or YouTube account.

## Findings

### Signed out

| ID | Severity | Screen | What | Steps | Screenshot |
| --- | --- | --- | --- | --- | --- |
| QA-01 | Low | Pricing (both widths) | The page has no `h1`. "Know what to do next." is an `h2`, so assistive tech and search engines see no page heading. | Open /pricing, inspect headings. | `signed-out-pricing-desktop.png` |
| QA-02 | Low | Landing (both widths) | The headline is two `span`s with no space between them, so a screen reader announces "Know whatto post next." | Open /, read the `h1` text content. | `signed-out-landing-desktop.png` |
| QA-03 | Low | Login, Signup, Forgot password, Reset password, 404 (both widths) | These pages use the site-wide default tab title "SOCIA — Your AI Social Strategist" (an em dash in user-facing text, and no page name), so every auth tab looks the same and the 404 page does not say it is one. | Open /login, /signup, /forgot-password, /reset-password, /nope and look at the tab title. | `signed-out-login-desktop.png` |
| QA-04 | Low | Pricing (phone) | The comparison table is 657 px wide in a 375 px viewport and scrolls sideways inside its card with no visible hint that it does. The first column is sticky, so it is usable. | Open /pricing on a phone, scroll to the comparison table. | `signed-out-pricing-mobile.png` |
| QA-05 | Low | /l/<missing slug> (both widths) | A sign-up link that does not exist shows the 404 page but keeps the tab title "Sign up". | Open /l/no-such-link. | `signed-out-link-page-missing-desktop.png` |

Checked and fine signed out: every protected path (/dashboard, /studio, /plan, /settings, /analytics, /discover, /chat, /reports, /comments, /contacts, /create, /roundup, /onboarding, /niche, /scorer) redirects to /login; /invite/<token> redirects to /login?next=/invite/<token>; the login and signup forms keep a bad email or a short password on the page; privacy, terms and data-deletion render with their own titles; no console errors, no uncaught errors, no request slower than 2 s on a warm server, no sideways scrolling at 375 px.

### Environment noise (not product bugs)

- Twice during the phone run the dev server answered 500 to a `/pricing?_rsc=…` request and logged `SyntaxError: Unexpected end of JSON input` for `/pricing`. It did not reproduce with repeated plain or RSC requests, and the page's own data reads are inside try/catch; it looks like the Next dev compile race on a manifest file. To be re-checked against a production build in phase 3.
- Full-page screenshots of the landing page are blank at the top: the hero is a scroll-driven stage and Playwright's full-page capture resizes the viewport. A viewport capture shows the hero correctly. Landing screenshots are therefore taken at viewport size.
- The landing page's example app screens (`.hx-*`) measure wider than the viewport because they are transformed "world pixels" inside a clipped stage; the page itself never scrolls sideways.

### Signed in, per plan

Pending the test backend.

### Plan gating, from the code

Read while the backend was unavailable; to be confirmed in the browser.

- Every plan-sensitive API route guards on the server (`lib/planGuard.ts`): scheduling, approvals, comment replies, niche intelligence, report exports, repurposing, team, the Studio build and auto-build routes. Pages gate the same features (`/comments` → comment_replies, `/contacts` → contacts, `/roundup` → weekly_trend_roundup, Reports → weekly/custom/platform/export, Analytics → deeper_insights, Dashboard → daily_recommendations, repurposing, comment_replies, build_from_clips).
- Diagnostic routes (`instagram/inspect`, `instagram/daily-probe`, `dashboard-audit`) are open to every signed-in user outside production (`lib/admin.ts`). Expected for a dev server; in production they need `ADMIN_EMAILS`.
- Video ideas (`/api/ideas`): the `canMake` flag the Dashboard card reads is `auto_build` (Starter and up), consistent with "Make this video".

## Fixed

| ID | Fix | Test |
| --- | --- | --- |
| QA-01 | The pricing page's heading is an `h1` (same class, same look). | `e2e/public.spec.ts` "QA-01 pricing has one h1" |
| QA-02 | A space between the two lines of the landing headline. | "QA-02 landing headline reads as one sentence" |
| QA-03 | Login, Signup, Forgot password and Reset password get their own tab titles through a `layout.tsx` each (the pages are client components); the 404 page carries `Page not found \| SOCIA`; the site-wide default title uses a colon instead of an em dash ("SOCIA: Your AI Social Strategist", also in the share-card title and image alt), and the anti-slop baseline was lowered for the two files. | "QA-03 auth and 404 pages have their own tab titles" |
| QA-04 | One line above the comparison table, shown only under 760 px: "Swipe sideways to compare every plan." No change to the table. | "QA-04 pricing table says it scrolls on a phone" (also checks the page itself never scrolls sideways) |
| QA-05 | A missing sign-up link's 404 is titled "Page not found \| SOCIA". | "QA-05 a missing sign-up link is a 404 that says so" |

## Still open

None from the signed-out sweep. The signed-in sweep has not run (see "Blocked").

## Needs decision

| ID | Severity | What | Why it is not just fixed |
| --- | --- | --- | --- |
| QA-06 | Low | The 404 page (`app/not-found.tsx`) is a dark navy screen with gradient buttons, unlike every other page (light theme, no gradients per `docs/design/anti-slop-standard.md`). | Restyling it to the light theme is a design change, which this sweep was told not to make. |
| QA-07 | Low | The default tab and share-card title now reads "SOCIA: Your AI Social Strategist" (was an em dash). | The punctuation follows the repo's copy rule, but the title itself is brand copy; say if a different wording is wanted. |

## Blocked

1. **Test backend.** No test Supabase project is reachable from this machine: the connected Supabase account's spare project (`eczhzmuiufokmtdgjqlx`, inactive) could not be restored under the current permissions, there is no Docker or Homebrew for a local `supabase start`, and the production project must not be used. The signed-in sweep, the four plan accounts, onboarding, Studio flows, scheduling, Ask SOCIA, Settings, billing and limits all wait on this.
2. **Stripe test mode.** No `STRIPE_*` keys are available locally. Checkout, promotion codes, upgrades, downgrades, the Customer Portal and the webhook cannot be exercised until test-mode keys are in `.env.local`.
3. **AI features.** No `ANTHROPIC_API_KEY` locally: Ask SOCIA, ideas, the Studio raters and captions will show their "unavailable" states, which is itself tested, but not their working paths.
4. **Production runtime errors.** The Vercel MCP account connected to this session has no teams, so Noah's project logs cannot be read from here.

## Numbers

| Severity | Open | Fixed | Needs decision |
| --- | --- | --- | --- |
| Critical | 0 | 0 | 0 |
| High | 0 | 0 | 0 |
| Medium | 0 | 0 | 0 |
| Low | 0 | 5 | 2 |
