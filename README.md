# SOCIA — Concierge Engine

The internal tool for Stage 0–1: generate the deliverable you sell to social
media managers — a **content audit + competitor breakdown + weekly content
plan** for one client account, in ~30 seconds instead of an afternoon.

This is deliberately _not_ the full SaaS. No auth, no database, no Instagram
API. It's the thing that earns the first dollars while you validate demand.

## Stack

- **Next.js 15** (App Router) + **TypeScript**
- **Claude Opus 5.5** via `@anthropic-ai/sdk`, using structured outputs so the
  deliverable is always valid, renderable JSON
- Plain CSS in the SOCIA brand (cobalt / ivory / Inter)

## Appearance: light only (2026-11-03)

Every page now renders in the light theme, whatever the device setting or a
previously saved choice.

- **Theme forced to light.** `lib/themeScript.ts` and
  `components/ThemeProvider.tsx` always paint the light tokens, and clear any
  old `socia-appearance` value from the browser.
- **Appearance picker removed** from Settings, the account menu, the Settings
  nav and the command menu (`components/AppearanceSettings.tsx` is deleted).
- **App top bar** (`.s-headbar`) is now frosted white glass instead of
  charcoal; its tokens (`--headbar`, `--dock-*`) live in
  `app/styles/tokens.css`.
- **Landing page** (`components/home/home.css`, `Home.tsx`, `HeroStage.tsx`),
  previously built dark, now uses a light palette matched to the app's tokens:
  the hero's product screens, the readability wash, buttons, charts, gold and
  blue highlights were all recoloured so nothing disappears on the light canvas.
- **Pricing page** (`app/pricing/pricing.css`, `components/MarketingChrome.tsx`)
  re-points the old dark `.so` palette to light values and uses the light nav.

The dark token values are kept in `app/styles/tokens.css` and the
`profiles.appearance` column is untouched, so a dark mode can return later.
The login and signup pages keep their dark decorative left panel on purpose.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Add your Anthropic API key:
   ```bash
   cp .env.example .env.local
   ```
   Then edit `.env.local` and paste your key from
   https://console.anthropic.com/settings/keys
3. Run it:
   ```bash
   npm run dev
   ```
   Open http://localhost:3000

## How to use it (the concierge flow)

1. Pick one real client account an SMM manages.
2. Paste what you know: handle, niche, a few recent posts with rough metrics,
   and 2–5 competitors with what's working for them. **The more real data you
   paste, the sharper the plan** — the model reasons from what you give it and
   flags when it's inferring.
3. Hit **Generate plan**.
4. Review, then **Export as PDF** (uses the browser print dialog) and send it to
   the SMM.

## What it produces

- A **health score** (0–100) with a one-line diagnosis
- An honest audit: strengths + concrete problems with evidence and impact
- The **top 3 fixes**, ranked by expected impact
- **Competitor gaps** — what rivals do that this account doesn't
- A **5–7 post weekly plan**, each with a written hook and the evidence it's
  based on

## Roadmap (from the revenue plan)

This is Stage 2's seed. When concierge pilots renew, the natural next steps are:

- Add **Supabase** (auth + `posts`/`accounts`/`plans` tables) so SMMs log in and
  keep history
- Add an **ingestion adapter** (Apify / EnsembleData) to pull competitor posts
  automatically instead of pasting them
- Add **Stripe** and turn the manual deliverable into a self-serve product

Keep the Claude prompt in `lib/prompt.ts` — it's the actual product. Everything
else is plumbing.
