# MOBILE

## The problem
SOCIA at phone width: composing, reading analytics and comparing, with touch targets that work.

## Approaches seen
- **Higgsfield** [measured]:
  - Phones get one chat-style composer instead of a squeezed desktop panel.
  - A 16px input (no iOS zoom).
  - A chip row for settings.
  - **Cost:** 32–36px icons.
- **Apple** [measured]:
  - Self-labelling compare cells keep 2 columns at 375px.
  - The local nav folds its sub-pages but keeps the action.
  - 44px is the recurring target size.
  - **Cost:** a 45×24 Buy pill.
- **Framer** [measured]: the compare table shows one plan at a time with a sticky switcher. **Cost:** 29px CTAs.
- **ElevenLabs** [measured]: the phone menu is a sheet of 44px rows. **Cost:** 36px header controls.
- **EnduroSat** [measured]: spec rows stack label over value. **Cost:** a sticky bar covers 150px of an 812px screen.

## Comparison
- Every reference gets some touch targets wrong. Treat 44px as a hard floor.
- **Replacing a complex desktop panel with a purpose-built phone composer** (Higgsfield) beats squeezing it.

## SOCIA today
- A mobile shell exists (PRs #15/#16).
- **Check:** target sizes and composer behaviour at 375px.

## Recommendation
- **44px minimum** for every target, including chip remove buttons and icon buttons.
- **Phone composer:** one input with a chip row for platform, time and media, and a send button.
- **Comparisons** keep 2 self-labelling columns.
- **Sticky bars** take at most ~56px on a phone.

## Added from the logged-in apps (2026-10-19)
- **Metricool at 375px (negative example):**
  - The sidebar stays as a 78px icon rail, leaving about 215px for content.
  - Tables scroll sideways inside it, and the page itself overflows horizontally.
  - Banners push the first chart about 1,100px down. [measured]
- **Higgsfield:** the phone drawer holds 8 destinations at 44px, with Create first. Screens that aren't ready for phones show an honest gate: a preview, one line, and "Got it". [observed]
- **ElevenLabs:**
  - The sidebar becomes a sheet.
  - In Text to Speech, Settings and History move into the editor's footer as icon buttons, with Generate full width.
  - **Cost:** 32px chips and 36px buttons. [measured]

## Updated recommendation (additions)
- **On phones, the sidebar collapses to a sheet,** not a permanent rail.
- **No horizontal page overflow.**
- **Caveats and upsells never push content below the first screen.**
