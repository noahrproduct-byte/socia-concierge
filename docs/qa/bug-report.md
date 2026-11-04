# QA sweep: bug report

Branch `qa-sweep`. Started 2026-11-03. Screenshots are in `docs/qa/screenshots/` (`<plan>-<screen>-<desktop|mobile>.png`); the raw per-screen findings the sweep collected are in `docs/qa/sweep/<desktop|mobile>/`.

Severity: **Critical** (data loss, money, security, cannot use the product), **High** (a main flow is broken or misleading), **Medium** (a flow works but with a wrong state, error or layout fault), **Low** (polish, wording, accessibility, minor layout).

## Status

| Phase | State |
| --- | --- |
| 1. Signed-out sweep (desktop and phone) | Done: 12 public screens, protected-page redirects, form validation |
| 1. Signed-in sweep, Pro, read only on production (owner's own account) | Done 2026-11-04: 13 sections at 1280 and 375 wide |
| 1. Signed-in sweep per plan (Free, Starter, Growth) | **Blocked**: needs a test backend or test accounts on those plans (see "Blocked") |
| 1. Production runtime errors from Vercel | **Blocked**: the connected Vercel account is not on the SOCIA team |
| 2. Fixes with a test each | Done for the signed-out findings (QA-01 to QA-05, each with a Playwright check in `e2e/public.spec.ts`) |
| 3. Rerun, tests, build, push | Done 2026-11-04: merged with main, unit tests, Playwright signed-out run (both widths), build |

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

### Signed in: Pro, read only, on production

Finished after Umar's handover (he ran out of credits). The owner's own Pro account, read only: each section opened in a frame at 1280 and 375 wide and checked for a non-200 response, failed requests (4xx/5xx), uncaught errors and rejected promises, placeholder text (`undefined`, `NaN`, `[object Object]`), and sideways scrolling. Nothing was clicked, saved, scheduled, published or asked of the AI.

Sections: Dashboard, Analytics, Discover, Content Plan, Calendar, Content Studio (clips, brief and audio modes), Create post, Comments, Contacts, Settings, Weekly roundup, Reports.

| ID | Severity | Screen | What | Steps |
| --- | --- | --- | --- | --- |
| QA-08 | Low | Dashboard (both widths) | The tab title was "Dashboard · SOCIA", the only page with a middle dot; every other page reads "<Page> \| SOCIA". | Open /dashboard, look at the tab title. |

Everything else: 200 on every section at both widths, no failed request, no uncaught error or rejected promise, no placeholder text, no sideways scrolling. `/footage` answers 404, but nothing in the app links to it (that feature was never merged), so it is not a finding.

Layout and touch on phones was covered separately the same night (PRs #184 and #186: charts drawn at their real width, 40 px touch targets, 12 px minimum labels, the floating Ask SOCIA bubble hidden at 900 px and below, Analytics' doubled title).

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
| QA-06 | The 404 page uses the site's look: the page ground and ink from the design tokens, the system buttons and the brand mark, no navy screen or gradients. Its title moved from an inline `<title>` (which lost to the site default once the page loaded) to `metadata`. | "QA-06 the 404 page wears the site's look and keeps its title" |
| QA-08 | The Dashboard's tab title is "Dashboard \| SOCIA". | Read only from production; not reachable signed out. |

## Still open

None. The Pro pass found one Low (QA-08, fixed); Free, Starter and Growth have not been swept signed in (see "Blocked").

## Decided

| ID | Decision |
| --- | --- |
| QA-06 | Fixed (see above): the anti-slop standard is a release gate, and the navy, gradient 404 broke it. |
| QA-07 | Kept: "SOCIA: Your AI Social Strategist". The colon follows the repo's copy rule (no em dashes in user-facing text); the wording itself is unchanged. |

## Blocked

1. **Test backend, for the other plans.** The Pro pass ran read only on production with the owner's own account. Free, Starter and Growth still need either a test Supabase project (restore `eczhzmuiufokmtdgjqlx`, run `supabase start` with Docker, or put a test project's URL and keys in `.env.local`) or test accounts on those plans for `e2e/app.spec.ts` (`QA_FREE_EMAIL` / `QA_FREE_PASSWORD` and the Starter and Growth pairs). Flows that write (onboarding, Studio builds, scheduling, Ask SOCIA questions, billing changes, limits and meters) were deliberately not exercised on production.
2. **Stripe test mode.** No `STRIPE_*` keys are available locally. Live checkout was tested end to end by Noah on 2026-11-03 (a test account bought Starter; checkout and both webhook calls answered 200), and `/api/admin/billing-check` reports ready in live mode. Promotion codes (SOCIA50, SOCIAFREE), upgrades, downgrades and the Customer Portal still need a test-mode run.
3. **AI features.** No `ANTHROPIC_API_KEY` locally: Ask SOCIA, ideas, the Studio raters and captions show their "unavailable" states locally. On production the video ideas writer was run for real on 2026-11-03 (two BetaTwin batches).
4. **Production runtime errors.** The Vercel MCP account connected to this session has no teams, so Noah's project logs cannot be read from here.

## Numbers

| Severity | Open | Fixed | Needs decision |
| --- | --- | --- | --- |
| Critical | 0 | 0 | 0 |
| High | 0 | 0 | 0 |
| Medium | 0 | 0 | 0 |
| Low | 0 | 7 | 0 |
