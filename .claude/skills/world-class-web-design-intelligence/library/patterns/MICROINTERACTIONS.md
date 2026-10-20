# MICROINTERACTIONS

## The problem
Small state changes should reveal the next action without layout shift, and should give keyboard and pointer users the same feedback.

## Approaches seen
- **ElevenLabs:** the selected row cross-fades its muted label into its action button in the same slot (0.2s), so nothing shifts. [measured]
- **Framer** [measured]:
  - Hover and keyboard focus give the same lift (`:has(:focus-visible)`).
  - Buttons that depend on a slow lookup (sign-in state) reserve their space and fade in once resolved, so nothing flashes.
  - The price recalculates live.
- **EnduroSat:** a progress label is duplicated inside the fill and flips colour exactly at the fill edge, so it stays legible. [measured]
- **Apple** [measured]:
  - Repeated CTAs get unique accessible names.
  - A 2px solid focus ring, set inside dense bars.
  - Nav hover darkens text only (no background).
- **Metricool:** a KPI tile toggles its chart series (see CHARTS.md). [observed]

## Comparison
These don't compete: each solves a different small problem. Together they cover reveal-in-place, equal keyboard and pointer feedback, no flashing, legible progress, and accessible repetition.

## SOCIA today
- A 3px 12%-purple focus ring (faint on white [inferred]); hover lifts on some cards.
- The plan badge and workspace switcher depend on slow lookups.

## Recommendation
- **Suggestion rows** (Today card, Worth posting again, ideas): the muted reason swaps for the action in the same slot.
- **Cards:** hover and focus-visible share one lift.
- **Slow-loading chrome** (plan badge, switcher, connection chips): reserve the width, then fade in. Never render a default plan first.
- **Meters:** the label flips colour at the fill edge.
- **Focus ring:** consider a 2px solid `--primary` outline with a 1px offset, set inside the sidebar.
- **Repeated actions:** unique `aria-label`s ("Draft again, <post>").
