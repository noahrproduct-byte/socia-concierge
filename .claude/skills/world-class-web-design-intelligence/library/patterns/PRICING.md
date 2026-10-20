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
  - **On the marketing page only,** the credit tier is a select inside the plan card, and the price updates live. The in-app Plans page lists fixed credits, with the higher plan opening "Everything from <lower plan>, with:".
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

## Added from the logged-in apps (2026-10-19)
- **ElevenLabs Subscription:**
  - A "Credits used" card and one plain sentence about the current plan and any scheduled change.
  - Monthly / Yearly as a segmented control with the saving in the label.
  - The current plan's button is an inert "Current plan".
  - Each card starts with the cumulative line. [measured]
- **Metricool billing (weakness):** the plan cards you could buy come first; your current plan and its usage sit about 1,450px further down. [observed]
- **Higgsfield:** everything billing on one page (plan, credits left with a bar, invoices, payment methods, billing details), loading with skeletons shaped like each card. [observed]

## Updated recommendation (additions)
- Settings → Plan leads with the **current plan and its usage**, then the options.
- The current plan's button is inert ("Current plan").
- Show the yearly saving in the toggle label, if annual billing ever ships.
