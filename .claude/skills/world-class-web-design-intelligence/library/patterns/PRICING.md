# PRICING

## The problem
SOCIA's /pricing and Settings → Plan must make the plans ($19 / $49 / $99, cumulative) and their limits clear and consistent.

## Approaches seen
- **ElevenLabs** [observed and measured]:
  - Each plan card starts with "everything in X, plus".
  - The compare table translates credits into minutes.
  - A calculator gives a live recommended plan in an `aria-live` region.
  - **Cost:** the billing period is hidden in a native select.
- **Higgsfield** [measured]:
  - A needs-based recommender (what you make, how many, which features) produces "We recommend Plus" with an expected-usage meter.
  - Credits are translated into outputs.
  - **Cost:** five discount badges.
- **Framer** [measured]:
  - The credit tier is a select inside the plan card, and the price updates live.
  - Each compare row has a one-line explanation and its own overage terms.
  - Rows are grouped.
  - On phones, the compare table shows one plan at a time with a sticky switcher.
- **Metricool** [observed]:
  - Cumulative cards.
  - Compare-table category anchor tabs and a sticky CTA row.
  - Platform-scope icons on limit rows.
  - "Uses AI credits" vs "included" per feature.
  - **Costs:**
    - The limit copy contradicts itself across pages.
    - The sticky header lacks plan names and prices.
- **Apple** [measured]: absolute prices at the top level, deltas inside a choice.
- **EnduroSat** [observed]: the price block reads unit (above), figure, qualifier (below), with "what's included" directly under the price.

## Comparison
- **Agreement:** state each plan as a cumulative ladder, translate units into outcomes, and keep plan names and prices visible while comparing.
- **Recommendation inputs differ:** ElevenLabs and Higgsfield ask about needs; SOCIA can also use measured usage for existing accounts.
- **The biggest trust lesson is Metricool's inconsistency.** Limits must come from one source, which SOCIA already has: `FEATURE_MIN_PLAN` and `lib/plans.ts`.

## SOCIA today
- PricingCards, a generated comparison table, cumulative plans (PR #57), and `upgradeFor` for every upgrade CTA.
- Some meters are still placeholders (checklist `decide-limits`).

## Recommendation
- **Cards:** each starts with a cumulative line in SOCIA's own words; meters are shown as outcomes ("about N videos a month").
- **Compare table:** a sticky header with plan name and price; grouped rows, each with a one-line explanation; "—" for not included.
- **Upgrade prompts** show the delta ("+$30/mo vs your plan").
- **Phones:** one plan at a time with a sticky switcher (44px targets).
- **Recommender:** from measured usage when signed in, from needs otherwise. Never invented numbers.
