# SOCIA — Concierge Engine

The internal tool for Stage 0–1: generate the deliverable you sell to social
media managers — a **content audit + competitor breakdown + weekly content
plan** for one client account, in ~30 seconds instead of an afternoon.

This is deliberately _not_ the full SaaS. No auth, no database, no Instagram
API. It's the thing that earns the first dollars while you validate demand.

## Stack

- **Next.js 15** (App Router) + **TypeScript**
- **Claude Opus 5** via `@anthropic-ai/sdk`, using structured outputs so the
  deliverable is always valid, renderable JSON
- Plain CSS in the SOCIA brand (cobalt / ivory / Inter)

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
