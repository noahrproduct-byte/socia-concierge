# SOCIA: instructions for Claude

## Any UI, copy or design work

Before proposing, generating or changing anything a person sees (public site or app), read
`docs/design/anti-slop-standard.md` and treat it as a release gate:

- No P0 item may ship: no invented metrics, logos, testimonials, scores or predictions; no fake
  liveness or progress; no dead controls; unavailable data is never shown as zero.
- P1 and P2 items need a written reason if they stay.
- Answer the decision framework (section 12) before adding a pattern; if it has no real task or
  real information behind it, leave it out.
- Check finished work against the acceptance checklist and the three fast tests (section 14) in
  the browser, signed out and signed in, desktop and phone, light and dark, keyboard and reduced
  motion.

`lib/antiSlop.test.ts` enforces the parts a pattern match can catch. It is a ratchet against
`lib/antiSlop.baseline.json`: never raise a number in the baseline; when a page is cleaned, lower
it with `UPDATE_SLOP_BASELINE=1 npx vitest run lib/antiSlop.test.ts`.

Build on the existing design system only: `app/styles/*` (tokens, primitives, shell, charts) and
`components/system/*`. `lib/designBudget.test.ts` keeps the token scale closed. Design research
lives in `.claude/skills/world-class-web-design-intelligence/`.

Copy: sentence case, plain verbs, concrete objects, no em dashes in user-facing text.
