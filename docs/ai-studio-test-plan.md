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

- `lib/credits/config.test.ts`: credits only on plans with the features; clipping priced by whole source minute with the margin; video by the second, images each; every curated model has an endpoint and a price.
- `lib/clipper/vizard.test.ts`: SOCIA's options map onto Vizard's fields; the query answer is read correctly (processing, done with clips and scores, each 4xxx error named); the key header is sent; a 4007 is final, a 429 is retried.
- `lib/generation/higgsfield.test.ts`: each model's own body; every status; outputs from the status endpoint and from a webhook envelope; the `Key id:secret` header, `?hf_webhook=` and `Idempotency-Key`; 5xx retried, 4xx not, 402 named.
- `lib/generation/webhook.test.ts`: Standard Webhooks signatures (good, rotated, changed body, wrong id, stale, missing).
- `lib/clipper/server.test.ts`: option cleaning, YouTube link check, the video length read from the watch page, generation pricing only for offered lengths.
- `lib/plans.test.ts`, `lib/cumulativePlans.test.ts`: Scale is the fifth plan at $80, above Pro, with everything Pro has plus the two features.
- `app/api/security.routes.test.ts`: every new route refuses when signed out; the webhooks refuse without a signature or secret.
- `supabase/tests`: `ai-studio.sql` applies, re-applies, and the browser can only read its owner's rows.

## Manual, on a test account (Scale plan, Stripe test mode)

Set up: run `supabase/ai-studio.sql`, set `profiles.plan = 'scale'` on the test account, put `VIZARD_API_KEY`, `HIGGSFIELD_API_KEY` and `ANTHROPIC_API_KEY` in the environment, and (optional) the two webhook secrets.

1. **Gating.** On a Pro account, open /clipper and /ai-studio: the page says the feature is on Scale with one upgrade link; the sidebar shows both entries; `POST /api/clipper/jobs` answers 403 with a plan error. On the Scale account both pages open and Settings shows the credit balance (6,000 after the first visit of the month).
2. **Clipper, one short video (the live test).** Paste a public YouTube talk of about 5 minutes. The price line shows the credits before the button is pressed (5 min at `clipCredits`); press Make clips; the job shows Waiting to start, then Working; within a few minutes it shows Done and the clips appear with title, length, score and a caption. Check: each clip plays, Download works, Copy caption copies caption plus hashtags, Send to scheduler opens Create Post with the clip as a draft. Then read the real cost in the Vizard dashboard (minutes used) and compare with `CLIP_SOURCE_USD_PER_MINUTE` in `lib/credits/config.ts`.
3. **AI Studio, one cheap generation (the live test).** Get ideas (five appear, each with a hook, a concept and a shot). Use one; keep Hailuo 2.3 (fast), 6 s, 9:16; the price line shows the credits; Generate. Within a couple of minutes the result appears and plays. Then read the real cost of that request in console.higgsfield.ai and compare with `usdPerSecond` for the model in `lib/credits/config.ts`. Do the same once for text to image on SOUL 2.
4. **Credits.** Settings shows the balance down by both jobs, with two Spent lines. Try a job that costs more than the balance (set the balance low with an `adjust` row in `credit_ledger`): the button is disabled with the short-balance line, and `POST` answers 402.
5. **Failure refunds.** Submit a clipper job with a direct link to a file that does not exist: the job fails within a minute with a plain message and the credits come back (a Refunded line in Settings). Submit a generation with a prompt the provider's filter declines: same.
6. **Top-up.** In Stripe test mode with `STRIPE_PRICE_TOPUP_SMALL` set: Buy 2,000 credits for $20 opens Checkout; pay with 4242 4242 4242 4242; Settings shows a Top-up line and the new balance. Replay the webhook event from the Stripe dashboard: the credits are not added twice.
7. **Rate limits.** Eleven clipper submissions inside an hour: the eleventh answers 429. Four within a minute: the fourth stays Waiting to start and is submitted by the next poll.
8. **Roles.** As an invited Member of the Scale brand: the pages open read-only (no Make clips or Generate), and the routes answer 403 on write.
9. **Phone width.** Both pages at 375 px: no sideways scrolling, the clip grid is two columns, the controls are reachable.

## Decide after the live test

- Set the real provider prices in `lib/credits/config.ts` (`CLIP_SOURCE_USD_PER_MINUTE`, each model's `usdPerSecond` / `usdPerImage`) from what the two consoles charged, then re-check `MONTHLY_CREDITS.scale` against the $80 price and `MARGIN`.
- Whether the Clipper's YouTube path is reliable enough (the length is read from the watch page; if YouTube blocks it, the person enters the length).
