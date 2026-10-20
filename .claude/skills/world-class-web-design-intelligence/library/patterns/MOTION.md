# MOTION

## The problem
Motion in SOCIA should communicate state changes quickly and consistently. Durations currently vary (0.15 / 0.18 / 0.2 / 0.25s) around one easing curve.

## Approaches seen
- **Apple** [measured]:
  - One curve, at 0.24s (state) and 0.32s (colour and entrances).
  - Menu items stagger in 20ms apart, with an extra delay between groups.
  - Exits are faster and drop the delay.
  - Moving between open menus cross-fades in 0.12s without replaying the entrance.
  - Duration scales with the panel's height.
- **ElevenLabs** [measured]:
  - Colour and background change at 0.15s on almost every control; 0.3s only for transforms.
  - Swapping an action in place uses a 0.2s opacity cross-fade.
- **Framer** [measured]:
  - The marketplace uses tokens: fast .1, base .15, slow .2.
  - Chrome appears with opacity only (no movement).
  - Off-screen animations pause.
  - **Costs:** reveals replay on every scroll; a typewriter placeholder.
- **Higgsfield** [measured]:
  - Tokens: fast .1, normal .2, slow .3, slower .5.
  - Indicators use 0.26s ease-out-quart (SOCIA's own curve).
  - Hover overlays fade in 0.1s.
- **EnduroSat** [measured]:
  - Slow 0.45s easing everywhere, 0.8s for layout changes, and scroll-scrubbed fills.
  - Count-up and odometer numbers.
  - No reduced-motion fallback.

## Comparison
- **Four of five use fast, tokenised timing,** with movement only for content and opacity for chrome.
- **EnduroSat is the outlier.** Its slowness suits a cinematic marketing story, and its count-ups imply changes that didn't happen.
- **Apple's asymmetry** (exit faster, no replay) is the most transferable refinement.

## SOCIA today
- `cubic-bezier(0.22, 1, 0.36, 1)` ×96, with mixed durations.

## Recommendation
- **Tokens:** `--dur-fast` 0.12s (exits, hover colour), `--dur-base` 0.18s (state changes, popovers in), `--dur-slow` 0.26s (panels, layout), all on SOCIA's existing curve.
- **Rules:**
  - Exits are faster than entrances.
  - Never replay entrance motion between sibling popovers.
  - Stagger 15–20ms only for menus of 4+ items.
  - Animate a number only when it actually updates live; never count up from 0 on load.
  - Pause looping motion off-screen and under `prefers-reduced-motion`.

## Added from the logged-in apps (2026-10-19)
- **Framer app** [measured]:
  - Menus open in **80ms** (opacity plus a scale from 0.96, starting at the anchor).
  - Tooltips in **150ms**, expo-out.
  - Hover colour changes at 0.1–0.2s with no movement.
  - The marketing site's springs don't appear in the app.
- **ElevenLabs app** [measured]:
  - Colour changes at 0.15s.
  - Value pills fade in over 0.1s.
  - The sidebar collapse animates over 0.15s.
- **Higgsfield app** [measured]:
  - 0.2s standard easing nearly everywhere.
  - Tiles pop in over 0.2s.
- **Metricool app** [measured]: Vuetify's default 0.28s, the slowest of the four.

**Confirms:** apps run faster than their marketing sites. 80–150ms for menus and tooltips and about 0.15–0.2s for state changes are the norm. That supports the proposed `--dur-fast 0.12s` / `--dur-base 0.18s` / `--dur-slow 0.26s` tokens; the menu entrance could use the fast token.
