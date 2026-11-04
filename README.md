# SOCIA

SOCIA is a growth tool for people who run Instagram, Facebook, YouTube and TikTok accounts. It reads an account's real numbers, studies its competitors, writes a weekly content plan, helps make the videos, schedules and publishes them, and reports on how they did. Each week's plan learns from the last week's results.

Live at [sociaos.com](https://sociaos.com).

## What's in the app

| Section | Path | What it does |
|---|---|---|
| Dashboard | `/dashboard` | Today's recommendations, what's working, posts worth posting again |
| Content Plan | `/plan` | Overview, account audit, competitor insights, growth strategy and a Monday to Sunday plan with hooks and scripts |
| Calendar | `/plan/calendar` | Drafts, ideas and scheduled posts; drag to move, approve, delete |
| Create post | `/create` | One post to several platforms, captions, collaborators, Trial Reels |
| Content Studio | `/studio` | Rate a finished video, build posts from raw clips, edit, add music. See [Content Studio](#content-studio) below |
| Discover | `/discover` | Competitors (picked by SOCIA or added by you), trending accounts and Reels in the niche |
| Analytics | `/analytics` | Per platform and across brands, from daily snapshots |
| Comments | `/comments` | Inbox with AI reply drafts you approve |
| Reports, Weekly roundup | `/reports`, `/roundup` | Performance reports to export, and the weekly digest |
| Settings | `/settings` | Connected accounts, Brand Workspaces, team, plan and billing, AI assistants |

Also: **Ask SOCIA**, an assistant on every page that answers from the account's data and can put posts or ideas on the calendar after you confirm; and an **MCP server** (`/mcp`, OAuth at `/oauth/*`) so Claude, ChatGPT and other AI apps can read a brand's data and, when the owner allows it, create posts.

**Plans:** Free, Starter ($19.99), Growth ($34.99) and Pro ($49.99) a month. Each plan includes everything below it. Limits and features live in `lib/plans.ts`.

## Content Studio

`/studio` has four parts, chosen by `?mode=`: Rate (the default), Build (`clips`), the Video editor (`edit`) and Audio (`audio`); Plan a post (`guide`) opens from a planned post.

- **Rate** reads a finished video on the device (ten frames, the sound measured and transcribed) and one model call returns a creative readiness score with nine category scores, each with its evidence and fix, the method one click away. The ring fills once; it never predicts views. Improve is a guided walkthrough of the fixes SOCIA can make, each opening the editor with the fix queued.
- **Build** takes raw clips, measures them on the device, understands them (one card per clip, cached by fingerprint) and finds the posts the footage supports. Every understood clip gets a score with one sentence (a clear hook, good light, a steady picture, clean sound; anything not measured is left out), and every post says why it was picked. Posts are ordered the same way every time: strong first, then the most usable footage. Make and schedule makes every video in the browser and schedules them after you check the list.
- **The Video editor** previews the cut with Remotion and renders it in the browser. The Cut tab is one inspector for the selected cut (start and end at the playhead, a transition picker with a picture of each join, sound, swap for another clip's best moment, remove) over the order of cuts; the timeline trims by dragging edges, moves cuts by dragging (the others slide aside) and times text lines. Text is six locked presets inside the safe zone; captions come from the transcript, word by word. Look and sound measures the clips and offers Auto enhance, Match clips and audio cleanup; music is a playlist made from the account's taste. The pacing ring says how the cut reads against the rules in `lib/studioClips/pacing.ts`.
- **Timing rules.** SOCIA's cuts are paced after validation: every cut starts on the action and stops when the sound stops, no cut drags (5 s without speech, 10 s with), the opener and the ending have room to land, every text line stays up long enough to read. With a track in the cut, its tempo and first beat are measured in the browser and every cut boundary is moved onto the nearest beat (Snap cuts to the beat repeats it). `lib/studioClips/pacing.test.ts` and `beats.test.ts` keep these from drifting.
- **Plans and billing.** Understand counts one footage analysis; SOCIA's cut counts one AI-made video the first time it is opened (`lib/studioClips/cutMeter.ts`); music tracks count each; the person's own edit counts nothing. `studio_builds` is server only.
- **Checking it without an account.** `/dev/studio-lab?screen=…` (development only) renders every Studio screen from fixtures with the Studio API answered in the tab; `docs/design/screenshots/studio/` holds before and after screenshots at 1280 and 375 wide, and `docs/studio-audit.md` is the audit the overhaul started from.

## Stack

- Next.js 15 (App Router), React 19, TypeScript
- Supabase: Postgres with row-level security, auth, storage, pg_cron
- Claude through `@anthropic-ai/sdk`: Opus 5.5 by default, Sonnet 5.5 for fast paths (`lib/anthropic.ts`)
- Remotion and ffmpeg.wasm for video in the browser
- Stripe for billing, ElevenLabs for music, AssemblyAI for transcription
- Deployed on Vercel; scheduled jobs run from Supabase pg_cron

## Appearance

Light only since 2026-11-03. Every page renders the light theme, whatever the device setting or an old saved choice, and there is no Light/Dark/System picker.

- `lib/themeScript.ts` and `components/ThemeProvider.tsx` always paint the light tokens and clear any old `socia-appearance` value.
- The app's top bar (`.s-headbar`) is frosted white glass; its tokens (`--headbar`, `--dock-*`) are in `app/styles/tokens.css`.
- The landing page (`components/home/`) and `/pricing` were built dark and now use light palettes matched to the app's tokens.
- The login and signup showcase panel (`.auth-brand` in `app/globals.css`) is white, with its sweeping arc in hairline grey and accent blue.
- The dark token values stay in `app/styles/tokens.css` and `profiles.appearance` is untouched, so dark mode can return.

## Run it locally

Needs Node 20 or newer (Vercel runs 24).

```bash
npm install
cp .env.example .env.local
npm run dev
```

Fill in `.env.local`, then open http://localhost:3000. Never commit it; `.env*.local` is ignored.

### Environment variables

| Group | Variables | Needed for |
|---|---|---|
| App | `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPPORT_EMAIL`, `ADMIN_EMAILS` | Links, OAuth redirects, admin-only pages |
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Everything. The service key is server only |
| Claude | `ANTHROPIC_API_KEY`, optional `ANTHROPIC_MODEL*` overrides | Every AI feature |
| Instagram | `INSTAGRAM_CLIENT_ID`, `INSTAGRAM_APP_SECRET` | Instagram login, analytics, publishing |
| Facebook | `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `FACEBOOK_LOGIN_CONFIG_ID` | Pages, competitor lookups |
| YouTube | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `YOUTUBE_API_KEY` | YouTube connect, analytics, uploads |
| TikTok | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | TikTok connect and analytics |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_GROWTH`, `STRIPE_PRICE_PRO`, `STRIPE_CHECKOUT_ENABLED` | Checkout and subscriptions |
| Studio | `TRANSCRIPTION_PROVIDER`, `ASSEMBLYAI_API_KEY`, `ELEVENLABS_API_KEY`, `STUDIO_MAX_FILE_MB` | Speech-to-text, music, upload size |
| Competitors | `SOCIA_RESEARCH_IG_USERNAME`, `SOCIA_RESEARCH_USER_ID` | Lookups for customers without their own Facebook Page |
| Jobs | `CRON_SECRET` | The pg_cron jobs call `/api/...` with it |

Features whose keys are missing switch themselves off and say so in the app. Local development talks to whichever Supabase project `.env.local` points at, so don't run jobs locally against production.

## Database

The SQL lives in `supabase/`. Run it in the Supabase SQL editor in this order (the order `supabase/tests/harness.ts` tests):

`schema`, `youtube-connections`, `plans-and-usage`, `post-destinations`, `plans-security-fix`, `workspaces`, `team`, `alerts`, `competitor-history`, `competitors-workspaces`, `platform-snapshots`, `comment-replies`, `billing`, `tiktok-catchup`, `studio`, `studio-phase-b`, `studio-audio`, `known-usernames`, `ai-assistants`, `approvals`, `security-hardening`, `rls-audit`, `growth-profile`, `platform-deletions`, `intelligence`, `competitor-autopick`, `studio-cut-meter`.

- Every file except `schema.sql` and `plans-and-usage.sql` is safe to run again.
- `tiktok-connections.sql` is superseded by `tiktok-catchup.sql`; don't run it.
- When a change needs both code and SQL, deploy the code first, then run the SQL.
- The `*-cron.sql` files schedule the jobs (publisher, daily snapshots, Studio purge, weekly plan, intelligence refresh). Replace `<CRON_SECRET>` in them with the real value when you run them; never commit it.

## Tests and checks

```bash
npm test                    # vitest: unit, route and database tests
npx tsc --noEmit            # types
npm run lint
npm run build               # stop the dev server first
```

- `supabase/tests/` builds the whole database in memory (PGlite) and checks row-level security, grants and re-runs.
- `app/api/security.routes.test.ts` calls every route signed out.
- `lib/workspaceScope.scan.test.ts` and `lib/supabase/privateTables.test.ts` fail on a query that isn't scoped to its brand or owner.
- `lib/antiSlop.test.ts` and `lib/designBudget.test.ts` hold the design rules. Lower `lib/antiSlop.baseline.json` with `UPDATE_SLOP_BASELINE=1 npx vitest run lib/antiSlop.test.ts` when a page gets cleaner; never raise it.

## Working on it

- UI and copy follow `docs/design/anti-slop-standard.md`: no invented numbers, no dead buttons, sentence case, no em dashes in user-facing text. `CLAUDE.md` has the full rules.
- Build on the design system in `app/styles/` and `components/system/`.
- Platform tokens and video cuts are server only (`lib/supabase/privateTables.ts`). Per-brand queries go through `scopeToWorkspace`. Stored URLs are fetched through `lib/fetchGuard.ts`.
- `demo-video/` is a separate Remotion project for marketing videos.
- Security reviews are in `docs/security/`.
