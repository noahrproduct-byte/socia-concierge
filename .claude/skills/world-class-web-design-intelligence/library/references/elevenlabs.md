# ElevenLabs

- **URL(s):** https://elevenlabs.io/app/home (redirects to sign-in), https://elevenlabs.io/, /text-to-speech, /studio, /voice-library, /pricing, /app/sign-in, /app/sign-up, https://ui.elevenlabs.io/ (their open-source agent and audio component kit: /docs/components/voice-picker, audio-player, waveform, orb, transcript-viewer, shimmering-text)
- **Category:** AI creative tool (voice, music, video generation) with a marketing site and a gated web app
- **Studied:** 2026-10-19
- **Tags:** AI-INTERACTION, PRICING, BILLING, EDITOR, MICROINTERACTIONS, LOADING, EMPTY-STATES, SEARCH-COMMAND, NAVIGATION, MOBILE, MOTION, ONBOARDING, FORMS, CHARTS

**How to read the marks in this entry.** `[measured]` = a computed-style or DOM value read with `extract-styles.js` or a targeted script. `[observed]` = read from the rendered DOM, the accessibility tree or the page text. No screenshots could be taken in this session (the shared browser pane was hidden, so screenshots and mouse input timed out), so nothing here is a visual impression. `[inferred]` = a reasoned guess.

## Coverage
| Area | Inspected? | How | Notes |
|---|---|---|---|
| App (`/app/home`) | no | browser | Redirects to `/app/sign-in?redirect=%2Fapp%2Fhome`. **No app screen was seen**: home, Text to Speech editor, generation history, Voice Library (app), Studio timeline, Studio Agent, usage/credits, subscription, settings, sidebar. Nothing below describes them. |
| Sign-in / sign-up | yes (looked, nothing submitted) | DOM, desktop | Structure and control sizes measured. |
| Marketing: home, Text to Speech, Studio, Voice Library (public page), pricing | yes | DOM + extract-styles (home, pricing, sign-in), desktop 1024px | The Text to Speech page has a public voice browser with previews; generating speech needs an account. |
| Pricing | yes | DOM, desktop + 375px | Plan cards, cost calculator, compare table, mobile behaviour. |
| Component kit (ui.elevenlabs.io) | yes | DOM, docs prop tables, extract-styles | A Vercel security checkpoint cleared on its own without any interaction. This is their published kit, not proof that the app uses identical components. |
| States (selected, disabled, open menus) | partly | DOM after JS-dispatched clicks (inspection only) | Voice row selected vs unselected, disabled submit, Products mega-menu, voice-picker popover, mobile nav sheet. Hover and focus visuals not seen; the focus rule was read from CSS. |
| Mobile | partly | `resize_window` mobile on pricing | Header, nav sheet, plan scroller, compare table. Home and product pages not checked at phone width. |
| Theme | yes | colorScheme dark | Marketing and auth stay light (0 dark media rules). The component kit follows the system theme and rendered dark. |
| Motion | measured only | transition values from CSS | Not watched. Two `prefers-reduced-motion` rules exist on the marketing site. |
| Docs (elevenlabs.io/docs), Agents product page | no | | Not visited (time spent on the app-adjacent surfaces instead). |

**To fill the gap, Noah's screenshots or a screen recording of the signed-in app would be needed:** the home screen and sidebar (expanded and collapsed), the Text to Speech editor before, during and after a generation (settings panel, history list, players), Voice Library with filters and a voice detail, Studio with the timeline and Studio Agent, the usage/credits and subscription pages, settings, and one phone-width view.

## Measured system
- **Type** [measured]: two systems.
  - **Marketing:** Waldenburg at weight 300 for headings (h1 48px/52px, -0.96px; h2 36px/42px), Inter for everything else. Tokens `--f-heading-01` 2.25rem/300/-0.03em/105% down to `--f-heading-05` 1.125rem/400/0em; paragraph 1.125rem and 1rem at 140%. Sizes in use on home: 14px ×77, 15 ×65, 16 ×50, 13 ×39, 18 ×27, 36 ×8, 12 ×7, 20 ×3, 48 ×2. **Weights: 400 ×191, 500 ×79, 300 ×11** (pricing: 400 ×187, 300 ×9, 500 ×2). Body text gets slight positive tracking (14px +0.14px, 15px +0.15px, 16px +0.16px), while display sizes get negative tracking. Chart readouts and player times use `tabular-nums`. Code uses Geist Mono.
  - **App auth pages:** Inter 14px/20px at 500 on buttons, h1 24px/30px at 600 (WaldenburgHF).
  - **Component kit:** Geist, 14px/20px body, 12px/16px meta, weights 400/500/600.
- **Colour** [measured]: warm, slightly brown-biased neutrals on marketing: page `rgb(253,252,252)`, fill `rgb(245,243,241)`, slider track `rgb(235,232,228)`, text tiers black, `rgb(89,84,79)`, `rgb(119,113,105)`, `rgb(165,159,151)`. **The primary action is black**, with no brand hue in the chrome. Saturated colour appears only in data and media: the two chart series (`rgb(255,71,4)` and `rgb(4,71,255)`, 1.5px lines over very pale area fills) and the voice avatars. Auth pages use a cooler neutral (`rgb(15,15,16)` text, `rgba(0,0,0,.1)` borders). The kit uses shadcn neutral tokens (`--primary #171717`, `--muted-foreground #737373`, `--radius .625rem`).
- **Shape** [measured]: the radius grows with element size: 9999px for controls, tabs and nav (×132 on home), 12px for inputs and chips, 16px for list rows, 20px for plan tiles, 24px for media cards; 4px only for tiny marks. Auth uses 12px on 46px controls. The kit uses 8px for buttons and inputs and 6px for options.
  - **Separation is a hairline ring, not a border.** White buttons get `0 0 0 0.5px rgba(0,0,0,.125), 0 1px 1px rgba(0,0,0,.04), 0 2px 4px rgba(0,0,0,.04)` (×29 on home); cards get an inset 0.5px ring at `rgba(0,0,0,.075)`. Real borders appear only 2–5 times per page. A selected row is marked by a warm fill, never by a border.
- **Spacing and density** [measured]: tokens set a 20px outer gutter, an 8px inner gutter, a 12-column grid and 60px between content blocks. Row heights:
  - voice rows 52px with a 4px gap
  - plan feature rows about 44px with 12px vertical padding
  - mobile nav rows 44px
  - auth controls 46px
  - kit picker options 48px
- **Motion** [measured]:
  - **Colour and background state changes:** 0.15s `cubic-bezier(0.4,0,0.2,1)` (×109 across three property sets on home).
  - **Transforms:** 0.3s (×12). Carousels: 0.36s ease.
  - **Row action reveal:** 0.2s ease-out opacity cross-fade.
  - **Auth buttons:** 0.075s.
  - **Kit loading:** shimmer 2s with a 0.5s pause between sweeps; pulse 2s.
- **Icons** [measured]: marketing uses custom SVG at 1px stroke (12, 16, 20 and 24px). The kit uses **lucide** (38 lucide SVGs on its home, 16px with stroke 2: play, settings, check, search), the same family as SOCIA. Auth icons are 18px at 1.5 stroke. Focus: `:focus-visible` is a 1.5px solid outline with a 2px offset.

## Strongest design qualities
1. **Hierarchy comes from size and colour, not weight.** [measured] Nearly all text is 400. 500 marks names and labels, and headings are *lighter* (300) but large. Three warm text greys carry secondary and tertiary information. **Why it works:** when weight stays constant, a weight-500 name in a list stands out without shouting. The levels come from a few size steps and three greys, so the page never looks bold-heavy and nothing competes with the one black button. **For SOCIA:** this directly addresses the baseline's scattered weights (500, 550, 600, 650, 700, 750, 780, 800). Moving to about three weights (400/500/650) and letting `--text-primary/secondary/muted` carry the levels would sharpen hierarchy. Do it system-wide through tokens. Don't copy the light display face.
2. **Colourless chrome, so colour means data.** [measured] Actions are black, surfaces are warm greys, and the only saturated pixels are chart series and voice avatars. **Why it works:** with no decorative hue in the interface, any coloured pixel is content, so the eye goes to the data first. **For SOCIA:** SOCIA already keeps purple for action only. Extend the rule: chart series, status colours and post thumbnails are the only other colour, with no tinted cards or coloured section headers. This transfers as a rule; SOCIA keeps purple and the navy sidebar.
3. **Selecting a row reveals its action in place.** [measured] In the public voice browser, the selected row (`aria-pressed=true`) gets the warm fill. Its right-hand slot cross-fades in 0.2s from a muted category label to a "Use voice" button. Unselected rows show only the label. **Why it works:** progressive disclosure keeps one primary action on screen, so the list stays scannable. The label and the button share one slot, so nothing shifts. **For SOCIA:** suggestion lists such as the Today card lines, Worth posting again, YieldView ideas and PlanPanel drafts. Each row shows its reason in muted text, and the selected or focused row swaps it for the action (Draft, Use, Schedule). On touch, tap selects. The action must stay reachable by keyboard.
4. **The avatar is the preview control.** [measured] Each voice row's 28px avatar has a 28px play button over it, with a 29px SVG progress ring around it. In the kit's voice picker the 30–32px avatar is the click target, and playback state is shared so only one sample plays at a time. **Why it works:** it gives the shortest path from "which one?" to hearing it. The row needs no separate player, and the ring shows progress in zero extra width. **For SOCIA:** clip cards in Build from Clips and YieldView, and any list of posts or renders. Make the thumbnail the play/preview target with a thin progress ring or bar, and keep one shared player so starting one clip stops the other.
5. **Unknown is shown as unknown.** [measured] With nothing loaded, the kit's player shows "No track selected", a Play button disabled at 50% opacity, and a duration of `--:--`, never a fake `0:00`. Times use 12px tabular numbers. **Why it works:** the person can tell "empty" from "zero", and tabular figures stop the time readout from jittering while it plays. **For SOCIA:** this matches Noah's "unknown is —" rule. Apply it to the ClipBuilder Player, render progress and every duration readout (`—:—` until measured).
6. **Pricing is in the person's unit, with a live answer.** [observed, measured]
   - **Plan cards:** each states its credits once, and each feature list starts with a short cumulative line ("Everything in Starter, plus").
   - **Compare table:** translates credits into minutes per plan (about 10, 30, 121, 600 and so on) plus the cost of an extra minute.
   - **Calculator:** features are picked as removable chips, minutes are set on a slider, and a recommended-plan card updates live. The result is announced through an `aria-live="polite"` region.

   **Why it works:** an abstract unit (credits) becomes the outcome people think in (minutes of audio). The cumulative line keeps each card short and makes the ladder visible. The calculator turns a comparison into one answer. **For SOCIA:** the Settings plan picker and sociaos.com pricing. Translate meters (`content_build`, `video_builds`) into outcomes ("about N videos a month") and keep the cumulative feature line, which matches the FREE ⊂ STARTER ⊂ GROWTH ⊂ PRO rule. SOCIA can go further than a slider: recommend a plan from the person's *measured* usage, never from invented numbers.
7. **A tiny step line tells you where you are.** [measured] Above the voice list sits "Select a voice", a 14px chevron, then "Generate speech": the current step in black, the next in the tertiary grey. **Why it works:** it orients the person in a two-step micro-flow without the weight of a stepper component. **For SOCIA:** Build from Clips (Upload › Understand › Ideas › Edit guide) and the Create Post composer (Write › Caption › Schedule) as one quiet line above the working area.
8. **Transcript words have three states.** [measured] In the kit's transcript viewer, spoken words are bright, the current word is an inverted chip (light fill, dark text), and unspoken words are muted. The states live in `data-status`. **Why it works:** a single contrast change per state keeps the reading position obvious while the text stays readable. **For SOCIA:** the Text & captions panel in ClipBuilder already has word timestamps from AssemblyAI. Highlight the current word during Player playback and allow click-to-seek on a word.
9. **The waveform is also the scrubber.** [observed from the kit's prop tables] Canvas bars default to 4px wide with a 2px gap and 2px radius, in the foreground colour, with a 24px fade at both edges. The same component takes `currentTime`/`onSeek` and has a bar-click callback. **Why it works:** one visual carries both the content's shape and the playhead, so the person seeks by sound (pauses, loud parts) rather than by time. **For SOCIA:** Look & sound already measures 100 ms RMS windows. A static waveform drawn from those *real* windows, doubling as the seek bar in the Cut panel, needs no invented data.

## Best components
- **Voice row** [measured]: 52px, 16px radius, 10px/12px padding, 8px internal gap. Avatar with built-in play and a progress ring, name 15px, and a right slot holding a muted category label that swaps to an action when selected. Pagination below: 32px round previous/next buttons and a "1/3" counter in the secondary grey.
- **Searchable voice picker** (kit) [measured]: built on Command + Popover + AudioPlayer.
  - **Trigger:** 36px, showing the 24px avatar and name.
  - **Popover:** a search row with a 15px search icon and a "Search voices..." placeholder.
  - **Options:** 48px, each with a 30–32px avatar, name 14px/500, and a 12px meta line of three attributes separated by "•".
  - **Selection:** a lucide check (16px) is visible only on the selected option (opacity 1 vs 0); the selected option has a filled background.
- **Audio player** (kit) [measured]: 40px Play button, 12px tabular time either side of a 4px track, a 12px thumb at opacity 0 at rest (shown on interaction, inferred), and a 36px playback-speed button. Its empty state is described under quality 5.
- **"Fill bar" range on pricing** [measured]: a 36px-tall rounded bar (10px radius). A black fill grows from the left, the value ("50 min") sits inside the fill next to a 2px light handle line, and the endpoints ("0", "9k+") sit underneath in the tertiary grey. The native input runs 0–100, and the mapping to minutes appears non-linear [inferred].
- **Removable selection chips** [measured]: 44px white chips (12px radius) with a 44px remove hit area around a 12px icon. The "Add feature" button beside them uses the muted fill.
- **Plan card** [measured]: a 200px header tile (name 24px, price, an optional outline badge with 8px radius), then a 44px black pill CTA (identical on every paid plan), then the muted cumulative line, then 20px-icon feature rows separated by dividers.
- **Mega-menu** [observed]: an Overview column plus three product columns of text-only links (about 50 in all) and one featured item. There are no icons or descriptions, so grouping does all the work.

## Best interactions
- **Cross-fade, not reflow, for contextual actions** [measured]: 0.2s opacity in a shared slot (quality 3).
- **One fast easing for state changes** [measured]: 0.15s standard ease for colour and background on almost every control; slower 0.3s only for things that move.
- **Disabled until valid** [measured]: on sign-up, the 46px submit button is grey (`rgb(163,163,163)` with light text) until the terms box is ticked. Google sign-in comes first, above the email form.
- **Live recommendation announced to screen readers** [measured]: the calculator result is in an `aria-live="polite"` region.
- **Compact header on scroll (phone)** [measured + inferred]: a second fixed bar, parked off-screen at -50px, carries only the logo symbol and the "Sign up" pill. It's presumably revealed on scroll.

## Best UX patterns
- **Browse by job, not by attribute** [observed]: voices are grouped by use case (Narration, Characters, Conversational, Social Media, Educational, Advertisement), with three-adjective descriptors on each voice card. Attributes (accent, gender, age) live in the picker's meta line. **For SOCIA:** group ideas and templates by the goal they serve; keep format and length as secondary meta.
- **Preview before the account wall** [observed]: the public Text to Speech page lets anyone browse and play voices. The account is asked for only at the step that costs money ("Generate speech"). **For SOCIA's onboarding:** show something real before sign-up only if it can be done with public, honest data. Otherwise the principle is to gate at the first costly step, not at the door.
- **AI output stays editable** [described in Studio marketing copy, not seen in the product]: the Studio agent drafts a project, and the person can keep iterating with it or take manual control at any point. Speech is corrected by editing the script text. **For SOCIA:** this is already the ClipBuilder model (EDL plus Regenerate plus manual edits). Keep every AI result as an editable draft with an obvious manual path, never a dead end.
- **One unit across the product** [observed]: credits power every product, and pricing translates them per product. This is noted as a principle (translate the unit), not as a model for SOCIA (see "not relevant").

## What makes it feel premium
- **Restraint with a short list of decisions:** essentially two text weights, three warm text greys, black actions and one hairline elevation recipe reused everywhere (×29 on a single page) [measured].
- **Tracking runs in opposite directions by size:** -0.02 to -0.03em on large display type, +0.01em on body sizes. Display type tightens and small text opens up, which reads as typeset rather than default [measured].
- **The radius scale follows element size** (pill controls, then 12, 16, 20 and 24px), so nested surfaces feel related [measured].
- **The product proves itself on the marketing pages:** real voices play from the voice rows, the calculator gives a real answer, and the chart illustration has a tabular hover readout [observed].
- **Hairline 0.5px rings instead of 1px borders** give crisp edges that never look heavy [measured].

## Weaknesses
- **Numbers disagree across pages** [observed]: the voice count appears as 10,000+, "11.000+" (with a European separator), 17,000+ and 17,500+. The Studio page says "Studio 4.0" in its intro and "Studio 3.0" further down. For a data product this erodes trust in every other number, which is a lesson for SOCIA's own copy.
- **Raw API values leak into the interface** [measured]: the kit's picker shows an age value like "middle_aged"; CSS `capitalize` doesn't remove the underscore.
- **Small touch targets on phones** [measured]: 36px header controls and the hamburger, and 32px pagination buttons, all below 44px.
- **Mobile pricing is hard to compare** [measured]: about 1,000px of plan cards sit in a 333px horizontal scroller with no scroll-snap, and the compare table switches to a one-plan-at-a-time select.
- **The billing period is a native select** ("Monthly billing" / "Yearly billing") rather than visible options, which hides the yearly saving [measured].
- **Two design systems** [measured]: the warm Waldenburg/Inter marketing system, light only, ignores a dark system preference. The neutral, dark-first Geist/shadcn kit is the other. This mirrors SOCIA's own marketing/app split.
- **Settings illustration sliders show no numbers** [measured]: the Speed, Tone, Pacing and Style tracks have no values. That's acceptable for an illustration, but it's unknown whether the app does the same.
- **A dense mega-menu** [observed]: about 50 text links with no descriptions; scanning relies entirely on the column headings.

## Patterns relevant to SOCIA
| Pattern | Tag | SOCIA screen | Adaptation idea |
|---|---|---|---|
| Selected row reveals its action in place | MICROINTERACTIONS | Dashboard Today card, Worth posting again, Studio YieldView, PlanPanel | Muted reason in the right slot; on select or focus, cross-fade (0.15–0.2s, SOCIA easing) to the action button in the same slot, with no reflow. |
| Thumbnail or avatar is the preview control, one shared player | EDITOR | Build from Clips clip cards, ClipBuilder, renders list | The thumbnail plays on click, with a thin progress ring or bar on the thumbnail; a single shared player state stops the previous clip. |
| Unknown durations as `—:—`, disabled Play with a reason, tabular time | EMPTY-STATES | ClipBuilder Player, render/export progress, Analytics watch-time cells | `font-variant-numeric: tabular-nums` on all time and metric readouts; never `0:00` for unknown. |
| Waveform doubles as the scrubber, drawn from real measurements | EDITOR | ClipBuilder Cut panel, Look & sound | Bars from the existing 100 ms RMS windows; click or drag to seek; edge fade only if it aids reading. |
| Three-state transcript words (spoken / current / unspoken) | EDITOR | ClipBuilder Text & captions | Highlight the current word during playback using AssemblyAI timestamps; click a word to seek. |
| Quiet step line for a micro-flow | NAVIGATION | Build from Clips, Create Post composer | One 12.5–13px line with lucide `ChevronRight` 12px; current step in `--text-primary`, the rest `--text-muted`. |
| Credits translated into outcomes; cumulative "Everything in X, plus" | PRICING | Settings plan picker, sociaos.com pricing | Show each meter as "about N videos / builds a month"; start each paid plan's list with the cumulative line, driven by `FEATURE_MIN_PLAN`. |
| Recommended plan from usage, announced politely | BILLING | Settings billing, upgrade prompts | Recommend from the person's *measured* usage (never a guess), in an `aria-live="polite"` region; through `upgradeFor()` so higher plans never see it. |
| Removable chips with 44px hit areas | FORMS | Composer platform/account pickers, competitor handles | Chips keep SOCIA's radius scale; the remove target stays 44px even when the icon is 12px. |
| Searchable picker with inline preview and a 3-attribute meta line | SEARCH-COMMAND | Account/brand switcher, competitor picker, music line picker | Name 13–14px/500, meta 11.5–12px muted with "•" separators, check only on the selected option; humanise raw values. |
| AI status text with a restrained sweep, only while visible | LOADING | Studio "Understanding clips", Generate Caption, Plan These Posts | A low-contrast text sweep (no glow, no colour) on the status label only, paused off-screen and under `prefers-reduced-motion`. Skeletons stay for layout. |
| AI drafts are editable documents with a manual path | AI-INTERACTION | ClipBuilder, Generate Caption, Plan These Posts | Keep "Regenerate" and manual edit side by side; never present AI output as final. |
| Gate at the first costly step, not at the door | ONBOARDING | sociaos.com → sign-up | Only with honest public data; otherwise show a real, labelled example rather than fake numbers. |
| Colour reserved for data | CHARTS | Analytics, Dashboard | 1.5px series lines, very pale area fill, 10–11px axis labels in `--chart-axis`, tabular hover readout; no decorative hues elsewhere. |
| One fast easing for colour changes, slower only for movement | MOTION | All | Unify SOCIA's 0.15/0.18/0.2s into one colour-change duration; keep `cubic-bezier(0.22,1,0.36,1)` for movement. |
| Phone nav as a sheet of 44px rows with accordions | MOBILE | SOCIA mobile shell | Check SOCIA's row heights and that grouped sections collapse; fix the 36px controls ElevenLabs gets wrong. |

Untagged, because no pattern tag covers typography: **hierarchy from size and colour with few weights** (quality 1) applies to every app screen through `globals.css`. Consolidate weights to about 400/500/650 via tokens and let the three text tokens carry hierarchy, together with the baseline's type-scale cleanup. It belongs in `principles.md` and the baseline's inconsistency list rather than a pattern file.

## Patterns NOT relevant to SOCIA
- **The 3D audio-reactive orb as voice identity** (Three.js, seeded per voice, states idle/thinking/listening/talking): Noah bans glowing orbs, and SOCIA's entities (accounts, posts, clips) already have real thumbnails and avatars. The principle of one persistent, state-driven status element survives only in restrained form (a status label or dot).
- **A single credit currency across every product:** SOCIA's meters have very different costs (see the cost model), and one currency would hide that. Only the "translate the unit into outcomes" idea transfers.
- **Inline performance tags in scripts** (bracketed delivery cues) and 70–90 language selectors: they belong to voice generation, not social posting.
- **The model-release timeline, logo walls and enterprise sections:** marketing furniture with no product lesson.
- **The warm brown-grey palette:** SOCIA's neutrals are deliberately cool and blue-biased against the navy sidebar; switching would be a cosmetic redesign.

## Do not copy
- The Waldenburg typeface and the light-display-heading look, the ElevenLabs logo and "Eleven" naming.
- The orb renders and gradient voice avatars, voice names and photos, illustrations and marketing imagery.
- The black-pill-everywhere CTA as a visual identity, and the warm grey palette as a whole.
- Their copy lines (including "Everything in X, plus" verbatim on a SOCIA page if it reads as theirs; SOCIA should phrase its cumulative line in its own voice).
- Their component kit's code or effects imported directly: rebuild any adopted pattern with SOCIA tokens, Inter, lucide at SOCIA's sizes, and SOCIA's easing.
