# AI Clipper, AI Studio and the Scale plan: test plan

Branch `feature/clipper-and-ai-studio`. What to check before the features go live, and how to run the one live test that confirms quality and real cost.

## Automated (run on every change)

```bash
npm test                    # unit, route and database tests (incl. supabase/tests with ai-studio.sql)
npx tsc --noEmit
npm run lint
npm run build
```

What the new tests prove:

- `lib/credits/config.test.ts`: credits only on plans with the features; clipping priced by whole source minute with the margin; a dollar cost becomes credits with the margin; every curated model has an endpoint; vertical video is the default and no model offers a shape it can't make.
- `lib/clipper/vizard.test.ts`: SOCIA's options map onto Vizard's fields; the query answer is read correctly (processing, done with clips and scores, each 4xxx error named); the key header is sent; a 4007 is final, a 429 is retried.
- `lib/generation/higgsfield.test.ts`: each model's own body (Seedance 2.5, Kling 3.0, Hailuo 2.3, SOUL 2); the live estimate's address and answer; every status; outputs from the status endpoint and from a webhook envelope; the `Key id:secret` header, `?hf_webhook=` and `Idempotency-Key`; 5xx retried, 4xx not, 402 named.
- `lib/generation/webhook.test.ts`: Standard Webhooks signatures (good, rotated, changed body, wrong id, stale, missing).
- `lib/clipper/server.test.ts`: option cleaning, YouTube link check, the video length read from the watch page, generation pricing only for offered lengths.
- `lib/plans.test.ts`, `lib/cumulativePlans.test.ts`: Scale is the fifth plan at $80, above Pro, with everything Pro has plus the two features.
- `app/api/security.routes.test.ts`: every new route refuses when signed out; the webhooks refuse without a signature or secret.
- `supabase/tests`: `ai-studio.sql` applies, re-applies, and the browser can only read its owner's rows.

## Manual, on a test account (Scale plan, Stripe test mode)

Set up: run `supabase/ai-studio.sql`, set `profiles.plan = 'scale'` on the test account, put `VIZARD_API_KEY`, `HIGGSFIELD_API_KEY` (or `HF_CREDENTIALS`) and `ANTHROPIC_API_KEY` in the environment, and (optional) the two webhook secrets.

0. **Before Scale is on sale** (`CREDIT_PRICES_CONFIRMED = false` in `lib/credits/config.ts`): /pricing and the homepage show four plans and no Scale rows; the sidebar has no Clipper or AI Studio entries; a Pro account sees no offer to move up; `POST /api/billing/checkout` with plan scale and `POST /api/billing/topup` answer 503; Settings on a Scale account says top-ups are not on sale yet. Set the test account's `profiles.plan` to scale by hand and open /clipper and /ai-studio by their address for the steps below.
1. **Gating.** On a Pro account, open /clipper and /ai-studio: the page says the feature is not available yet (on sale: on Scale, with one upgrade link); `POST /api/clipper/jobs` answers 403 with a plan error. On the Scale account both pages open and Settings shows the credit balance (6,000 after the first visit of the month).
2. **Clipper, one short video (the live test).** Paste a public YouTube talk of about 5 minutes and press Make clips: nothing is spent yet, and SOCIA answers with the measured length and its price; press Make clips again; the job shows Waiting to start, then Working; within a few minutes it shows Done and the clips appear with title, length, score and a caption. Check: each clip plays, Download works, Copy caption copies caption plus hashtags, Send to scheduler opens Create Post with the clip as a draft. Then read the real cost in the Vizard dashboard (minutes used) and compare with `CLIP_SOURCE_USD_PER_MINUTE` in `lib/credits/config.ts`.
3. **AI Studio, one cheap generation (the live test).** Get ideas (five appear, each with a hook, a concept and a shot). Use one; keep Seedance 2.5, 5 s, 9:16; the price line says it is checking, then shows the credits from Higgsfield's live estimate; Generate. Within a few minutes the result appears and plays, vertical and with sound. Then read the real cost of that request in console.higgsfield.ai and compare with the `quotedUsd` saved on the job (`generation_jobs.input`). Do the same once for text to image on SOUL 2. With no Higgsfield key set, the page says the price couldn't be read and Generate stays off.
4. **Credits.** Settings shows the balance down by both jobs, with two Spent lines. Try a job that costs more than the balance (set the balance low with an `adjust` row in `credit_ledger`): the button is disabled with the short-balance line, and `POST` answers 402.
4b. **Length is measured, never typed.** Upload a 12-minute file and type 1 in the length field: the first press answers with 12 minutes and its price, and the ledger shows nothing spent until the second press. A direct link to a private address (`https://192.168.1.10/a.mp4`) is refused before anything is spent; an .avi file is refused at upload.
5. **Failure refunds.** Submit a clipper job with a direct link to a file that does not exist: it is refused before anything is spent ("couldn't read how long this video is"). Submit a generation with a prompt the provider's filter declines: same.
6. **Top-up.** In Stripe test mode with `STRIPE_PRICE_TOPUP_SMALL` set: Buy 2,000 credits for $20 opens Checkout; pay with 4242 4242 4242 4242; Settings shows a Top-up line and the new balance. Replay the webhook event from the Stripe dashboard: the credits are not added twice.
7. **Rate limits.** Eleven clipper submissions inside an hour: the eleventh answers 429. Four within a minute: the fourth stays Waiting to start and is submitted by the next poll.
8. **Roles.** As an invited Member of the Scale brand: the pages open read-only (no Make clips or Generate), and the routes answer 403 on write.
9. **Phone width.** Both pages at 375 px: no sideways scrolling, the clip grid is two columns, the controls are reachable.

10. **Unused uploads.** Upload a video and leave without pressing Make clips: a day later the file is gone from the ai-media bucket (the minute job reports `removedUploads`).

## Putting Scale on sale

1. Enter the real provider prices from the live test in `lib/credits/config.ts` and set `CREDIT_PRICES_CONFIRMED = true` in the same change.
2. Stripe: give the two top-up Products a Managed Payments tax code (one-off Managed Payments checkouts are supported, but only for eligible digital products), and add the Scale price to the Customer Portal's plan list so existing subscribers can switch to it.
3. Run step 0 again with the flag on: Scale appears on /pricing and the homepage, checkout opens, and top-ups are on sale.

## Decide after the live test

- Set the real clipper price in `lib/credits/config.ts` (`CLIP_SOURCE_USD_PER_MINUTE`) from what Vizard charged. Generations are priced from Higgsfield's live estimate, so compare each job's `quotedUsd` with the console, then re-check `MONTHLY_CREDITS.scale` against the $80 price and `MARGIN`.
- Whether the Clipper's YouTube path is reliable enough (the length is read from the watch page; if YouTube blocks it, the person enters the length).
