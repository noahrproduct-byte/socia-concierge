# EMPTY-STATES

## The problem
Unknown, missing, not-yet-synced and genuinely zero must look different. An empty screen should teach the next step.

## Approaches seen
- **Unknown values** (six of six references agree):
  - Higgsfield: `GENERATE —` [measured]
  - ElevenLabs: `--:--`, with a disabled Play button at 50% [measured]
  - Framer: the baseline delta is "—" [measured]
  - EnduroSat: "—" until a prerequisite is set, then a stated default [observed]
  - Apple: an aligned dash plus screen-reader "Not available" [measured]
  - Metricool: no % without an equal prior period [observed]
  - **Metricool's anti-pattern:** "0" shown for unconnected networks, and sections with no data hidden silently.
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
