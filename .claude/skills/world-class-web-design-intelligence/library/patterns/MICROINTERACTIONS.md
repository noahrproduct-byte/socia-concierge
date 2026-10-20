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

## Added from the logged-in apps (2026-10-19)
- **Framer:**
  - On a project tile, the plan badge slot turns into a "…" menu on hover. [observed]
  - Tooltips teach the shortcut: a label plus a shortcut chip, rising in 150ms. [measured]
- **ElevenLabs:**
  - The avatar wears a thin usage ring at rest and shows the percentage when the menu opens.
  - Slider labels are focusable tooltip triggers.
  - The ends of each slider are named in words ("Creative / Robust").
  - The focus ring follows the shape of whatever it surrounds. [measured]
- **Higgsfield:**
  - Overlay controls on media tiles scale with the tile's size.
  - Fields mark "Optional" instead of asterisking the required ones.
  - The primary button loses its colour and its price until the form is valid. [measured]
- **Metricool:** the character counter's tooltip names which network sets the limit. [observed]

## Updated recommendation (additions)
- **Swap status chips for "…" on hover** on Calendar cards and brand tiles, keeping the menu reachable by keyboard.
- **Icon-only buttons:** a tooltip with a shortcut chip.
- **Sliders:** the ends named in plain words, with the exact value shown.
- **Composer counter:** say which destination sets the limit.
- **"Optional" tags** on optional fields.
