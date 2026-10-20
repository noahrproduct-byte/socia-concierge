# EMPTY-STATES

## The problem
Unknown, missing, not-yet-synced and genuinely zero must look different. An empty screen should teach the next step.

## Approaches seen
- **Unknown values** (six of six references agree):
  - Higgsfield: signed out, `GENERATE —` [measured]. **Corrected signed in:** the price shows, and while the input is incomplete the button is grey, disabled and shows no price at all.
  - ElevenLabs: `--:--`, with a disabled Play button at 50% [measured]
  - Framer: the baseline delta is "—" [measured]
  - EnduroSat: "—" until a prerequisite is set, then a stated default [observed]
  - Apple: an aligned dash plus screen-reader "Not available" [measured]
  - Metricool: no % without an equal prior period [observed]
  - **Metricool's anti-pattern (corrected from the real app):**
    - The Summary leaves unconnected networks out entirely; it doesn't show "0".
    - Inside a network, demographics with no data render as blank boxes with no message.
    - A competitor with no data shows `0` in every column.
- **Empty screens:**
  - Higgsfield: the empty results area is a three-step how-to with real examples [observed].
  - Apple: the empty bag has one headline, one sentence on how to get value, and a short list of links [observed].

## Comparison
- The unknown-value rule is universal among the strong references. The difference is how thoroughly it's done: Apple adds accessible text, EnduroSat adds a default once the input exists.
- **For empty screens,** Apple's text-only version and Higgsfield's numbered steps agree: say what unlocks content, and link to it.

## SOCIA today
- "—" for unknowns is already a hard rule (Noah).
- **Check:** whether every "—" has screen-reader text, and whether any section is hidden when its data is missing.

## Recommendation
- **Every "—"** gets visually hidden reason text (or a tooltip for sighted users).
- **Never hide a section silently:** show it with "—" and the reason and fix ("Connect TikTok to see this").
- **Empty screens:** one headline, one how-to sentence, one action link. Three numbered steps for multi-step features (Content Studio, the plan loop). No illustrations.

## Added from the logged-in apps (2026-10-19)
- **Framer:** every empty view is a tiny centred block: a title, one or two lines naming the missing prerequisite ("publish first", "add a locale"), and at most one neutral button pointing at a control that already exists. No illustration. An unknown usage figure is drawn as a short grey dash glyph, never 0. [measured]
- **ElevenLabs:**
  - Flows puts real template cards **above** a quiet "No flows yet" line. The Text to Speech editor shows starter chips where the action bar will be until there's input. [measured]
  - **Anti-pattern:** Dubbing and Speech to Text fill empty tables with five realistic, unlabelled fake rows. On one page a screen reader reads them as real. This breaks SOCIA's real-data rule outright.
- **Higgsfield:** one empty-state anatomy everywhere: a title, one line of purpose, a preview of the filled state, and one action (in neutral white, not the accent). A three-step strip appears only for concepts that need teaching. [observed]
- **Metricool:**
  - An unconnected network gets a connect page that describes what will appear once it's connected (three benefit tiles, one connect button) instead of zeros. [measured]
  - The Inbox empty state names the likely cause ("check your filters"). [observed]

## Updated recommendation
1. **Real starting points first,** if they exist (templates, suggestions from the person's own data).
2. **Then one quiet line** naming what's missing and the one action that fixes it.
3. **Not-yet-connected platforms** get a "what this page will show" connect page.
4. **Filtered lists** say when a filter may be hiding items.
5. **Never fake rows.** If an example is shown, it's labelled "Example", holds no plausible numbers, and is hidden from screen readers.
