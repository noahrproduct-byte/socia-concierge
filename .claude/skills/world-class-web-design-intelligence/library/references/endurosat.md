# EnduroSat

- **URL(s):** https://www.endurosat.com/space-service/ (primary), https://www.endurosat.com/ , https://www.endurosat.com/spaceops/ , https://www.endurosat.com/products/the-frame-15-espa-class-satellite/ (FRAME S product page), https://configurator.endurosat.com/ (public mission configurator, linked from every "design your mission" CTA)
- **Category:** marketing site for a space hardware and space-as-a-service company, plus a public, app-like configurator
- **Studied:** 2026-10-19
- **Tags:** NAVIGATION, ONBOARDING, FORMS, SETTINGS, EDITOR, EMPTY-STATES, ANALYTICS, CHARTS, TABLES, PRICING, MICROINTERACTIONS, MOTION, MOBILE

## Coverage
| Area | Inspected? | How | Notes |
|---|---|---|---|
| Space Service page | yes | browser at 1024x768 and 375x812; every section scrolled; extract-styles; DOM reads of the progress bar, spec readout, calculator | ~37,000px scroll-driven page. Dragged the revisit-time calculator slider. |
| Homepage | yes | browser desktop; extract-styles; scrolled all sections | Hover checked on the hero buttons. |
| SpaceOps (solution page) | yes | browser desktop | Pricing tiles, capability checklist. The SpaceOps software itself is only shown as low-res rendered images; the real app needs an account and wasn't seen. |
| FRAME S product page | yes | browser desktop and mobile; extract-styles | Spec table, fleet-pricing slider and curve, comparison accordion, sticky local nav, hover-expand strip. |
| Configurator | partly | browser at 1024x768 and 1440x900 (emulated); extract-styles | Walked Domain, Application and Mission for one path (Remote Sensing, SAR, global coverage), moved both sliders. Didn't press Save configuration and didn't type in the region search. Other domains not walked. |
| Navigation | yes | top bar, full-screen products menu (hover states), mobile full-screen menu, chapter progress bar (clicked a segment) | |
| States (hover, focus, menus) | partly | hover on nav, product menu, payload strip, buttons; Tab order checked once | Focus was only checked on the product page. |
| Motion | measured + observed | transitions from extract-styles; scroll-scrubbed sequences watched by stepping scroll positions | `prefers-reduced-motion` couldn't be emulated; only the CSS was checked. |
| Theme | n/a | | Dark only. No light theme exists. |
| Not inspected | | | Careers, News articles, SpaceDev, subsystem category pages, tablet width, contact/demo forms (not submitted). No cookie banner appeared. |

## Measured system
- **Type:** [measured] One family, Magnetik, at 300/400/500/600/700 on the marketing site. The configurator uses only 400 and 700.
  - **Fluid root:** the marketing `html` font-size is 1/14.4 of the viewport width (71.1px at 1024 wide, so 100px at the 1440 design width). On phones it switches to 100px at 393 wide (95.4px at 375). Every size therefore scales with viewport width. Derived design scale at 1440: 9, 14, 15, 18, 20, 24, 30, 48 and 108px.
  - **Small text at 1024 wide:** text renders down to 6.4px (×19 on the homepage) and 7.1px (progress-bar labels, price units).
  - **Headlines:** weight 600, uppercase, tracking about -3% (67.5px with -2.0px), line-height below 1 (67.5/53.5).
  - **Micro-labels:** uppercase with +7% tracking on the marketing site (6.4px with 0.45px) and +10% in the configurator (10.24px with 1.02px).
  - **Spec values:** the same size as their labels, separated only by weight (300 vs 500) and colour.
  - **No tabular numbers anywhere:** `font-variant-numeric: normal` on every number checked.
  - **Configurator scale:** a tighter 6-step scale (0.75, 0.875, 1, 1.125, 1.375 and 1.5rem on a 13.65px root). Its KPI values are 38px/700 at 1440.
- **Colour:** [measured] dark only.
  - **Surfaces:** true black `#000`. Raised fills are `#23232c` (progress segments) and, in the configurator, `#13171d`, `#090d12` and `#212328` (panes, option cards and tabs).
  - **Hairlines:** `#1a1d23` and `#1c232a`.
  - **Text:** white, then two cool blue-biased greys, `#a7b2bf` (labels) and `#66717e` (tertiary, inactive nav). The configurator adds `#8b939b` for labels and `#6f767d` for de-emphasised values.
  - **Accent:** a single cyan-blue, `#00a1ff`, for the primary CTA fill, progress fill, active step, eyebrow labels, selected card bar, chart line and marker, and the one highlighted part in each render.
  - **Second hue:** orange `#fc6a18` is reserved for the "problem / traditional" side of a comparison: the challenge eyebrow, and the traditional-space cost of data. No other status colours appear.
- **Shape:** [measured] radii of 1–2px on buttons, progress segments and tiles, and 3.4px (0.25rem) in the configurator. 999px appears only on slider tracks.
  - **No shadows** on the marketing pages (`shadows: []`). The product page uses `box-shadow: 1px 0 0 0` as hairline dividers.
  - **Separation** is by fill steps and 1px hairlines. There is no elevation system.
  - **Selected option card:** a 2px inset left bar in the accent (`inset 2px 0 0 #00a1ff`) plus a one-step lighter fill.
- **Spacing and density:** [measured] all spacing is fluid rem, so there's no fixed base unit. Sizes at 1024 wide:
  - Buttons 41px tall with 17.5px side padding.
  - Product spec rows 43px; comparison rows about 48px.
  - In-scene spec readout rows 25px; progress segments 23px tall.
  - The configurator's left panel is about 210px wide at 1440.
- **Motion:** [measured]
  - **Main easing:** `cubic-bezier(0.51, 0.01, 0.2, 1)` at 0.45s for colour and transform (about 80 uses per page), a slow ease-in-out.
  - **Layout changes** in the progress bar: width and gap at 0.8s `cubic-bezier(0.76, 0, 0.24, 1)` (ease-in-out-quart). Product strip: `flex-grow` 0.8s.
  - **Scroll-linked:** Lenis smooth scroll, ScrollTrigger present, one 2048x1536 canvas for the scrubbed 3D/image sequence. Progress fills are `translate3d` driven by scroll with no transition.
  - **Configurator:** accordion `grid-template-rows` 0.4s `cubic-bezier(0.48, 0.04, 0.52, 0.96)`; pane expand width/height 0.5s `cubic-bezier(0.66, 0, 0.34, 1)`; hover colour 0.15–0.2s linear; slider fill 0.2s ease-out.
  - **Reduced motion:** the only `prefers-reduced-motion` rule on either site belongs to a third-party overlay. Site motion has no CSS fallback; JS behaviour wasn't testable.
- **Icons:** [measured] very sparse, 7–10 SVGs per page, all line icons.
  - Marketing: 1px stroke at 17px, a diagonal arrow-in-square CTA glyph, and a crosshair-style plus (gap at the centre) that turns into a minus when an accordion opens.
  - Configurator: chevrons at 11px with 1.8 stroke, and 15px icons with 1.4 stroke.
  - Payloads and products are shown as small 3D renders, not icons.

## Strongest design qualities
1. **A chapter progress bar that compresses the past and expands the present.** [measured + observed]
   - **What it does:** a bar docked at the bottom of the Space Service page holds five chapters. Finished chapters collapse to 23px squares filled solid with the accent. The current chapter expands to labelled 110px segments that fill left to right as you scroll. Future chapters stay as empty squares.
   - **Label legibility:** each segment's label is duplicated inside the fill and counter-translated, so the text flips from white-on-grey to dark-on-cyan exactly at the fill edge.
   - **Navigation:** segments are clickable. Clicking a segment smooth-scrolls to that chapter (checked).
   - **On phones** it becomes a vertical rail on the right edge.
   - **Why it works:** it answers "where am I, how much is left, what did I pass" at three levels of detail at once. It spends width only on the chapter that matters now, keeps the history as a compact count of done steps, and the inverted label means the text never loses contrast against the fill.
   - **For SOCIA:** strong fit for any multi-step flow driven by step state (not scroll): connecting accounts in onboarding, Content Studio's Make This Video phases, Plan These Posts, and the Create Post composer if it becomes stepped.
2. **One control recalculates everything.** [observed in the configurator]
   - **What it does:** dragging the revisit-time slider from 1.7 days to 2.6 hours immediately updates these together:
     - the satellite count (1 → 31) and the bus unit cost ($4.0M → $3.1M);
     - the constellation lifetime cost ($16M → $392M);
     - data per day, cost per GB and area imaged per day;
     - two markers on a dual-line chart, and the bolded nearest x-axis tick;
     - the number of satellites drawn on the globe;
     - the phase durations in the delivery timeline (production went from 9 to 10 months, launch from 3 to 6).
   - **The marketing version:** the Space Service page has a simpler one-slider calculator (revisit time → satellites → total mission cost) that also drives the globe render.
   - **Why it works:** direct manipulation with immediate, simultaneous consequences lets a person learn the model's trade-offs by feel. The technical, "intelligent" impression comes from cause and effect, not from decoration.
   - **For SOCIA:** this is the clearest example of "futurism through behaviour". Candidates:
     - Plan: posts per week, with the expected reach range and workload drawn from the account's own history.
     - Billing: plan, brands and seats, giving the monthly price and limits.
     - The Repurposing and Trial Reels choices.
     - It is only allowed where the numbers come from real data or published prices, and every projection must be labelled as an estimate with its basis.
3. **Honest placeholders, gated steps and a smart default.** [observed + measured]
   - **What it does:** until a region is chosen, the configurator's derived metrics (Satellites, Launches, Planes, Coverage) show an em-dash. The later section (revisit time) is visibly dimmed and the save button stays grey.
   - **The default:** the moment a region is set, the revisit section fills itself with a sensible default, shown as its summary (1.7 days, 1 satellite, 1×1), and save turns cyan.
   - **The hidden panes:** cost and data panes are in the DOM with "—" values and opacity 0 before they're needed.
   - **Why it works:** the system never shows an invented number, and the person always knows what's missing and what comes next. The default removes a decision without hiding that one was made.
   - **For SOCIA:** this matches Noah's "unknown is —, never 0" rule exactly, and shows it can look deliberate rather than broken. Apply it to KPI tiles before the first sync, to the composer's schedule step, and to plan setup.
4. **Collapsed sections show a summary of their choices.** [observed]
   - **What it does:** the configurator's left panel is an accordion. When Payload collapses, its header shows the chosen values separated by thin rules (the payload, its resolution and the platform). Region collapses to its summary in the same way.
   - **Why it works:** it favours recognition over recall. The stack of collapsed headers reads as a breadcrumb of every decision so far, and any one can be reopened in place.
   - **For SOCIA:** the Create Post composer's side panels (platforms, time, Trial Reel options), Settings sections, and the Content Studio look-and-sound panel.
5. **Chart legends live in the readouts.** [observed]
   - **What it does:** above the configurator's dual-line chart, each KPI label starts with a short coloured dash matching its line: blue for revisit time, white for bus unit cost. The current value sits on each curve as a marker. The x-axis is logarithmic (1+, 10+, 100+, 1000+) and the nearest tick turns bold white. The FRAME S fleet-pricing curve works the same way (slider, two readouts, curve with a marker, bold tick).
   - **Why it works:** proximity and shared colour join the number to its line with no separate legend to look up. The bold tick tells you where on the axis you are without gridline clutter.
   - **For SOCIA:** Analytics chart cards where the KPI header doubles as the legend (this period vs previous), and Dashboard KPI tiles with sparklines.
6. **Colour is a state signal, not decoration.** [measured]
   - **What it does:** almost everything is greyscale on black. One cyan marks active, selected, in-progress or primary. Orange appears only on the "old way" side of a comparison. Each render is a white wireframe with exactly one component in the accent.
   - **Why it works:** an accent this scarce becomes information. The eye goes to the cyan first, and it always means the same thing. Highlighting one element in a muted scene is pre-attentive (focus plus context).
   - **For SOCIA:** this reinforces the existing "purple is for action and active state only" rule. The transferable part is "highlight one series, mute the rest" in multi-series charts and comparisons. A distinct baseline hue is worth considering only if the chart palette needs one; never orange-as-brand.
7. **Spec tables made calm by weight and luminance, not size.** [measured]
   - **What it does:** in the FRAME S specifications, the label (300 weight, grey `#a7b2bf`) and the value (500 weight, white, right-aligned) are the same 12.8px. Rows are 43px, indented under small uppercase group headings ("payload & mechanical", "power & performance"). On phones each row stacks the label above the value.
   - **Why it works:** with a single size, the eye scans the values column without the jumpy rhythm of mixed sizes. Grouping replaces zebra stripes and borders.
   - **For SOCIA:** a post detail's metric list, the details of a connected account in Settings, and Analytics breakdown tables. Use Inter with tabular numbers, which EnduroSat doesn't use.
8. **The formula sits beside the metric.** [observed]
   - **What it does:** the cost-of-data figure is shown with its definition on the left: total mission cost divided by total data generated, in USD/GB. A two-item scale on the right marks the traditional figure in orange against theirs.
   - **Why it works:** a derived number is trusted when its derivation is one glance away.
   - **For SOCIA:** Analytics metric definitions (engagement rate, reach rate, cost per post in the cost model) shown inline or in the tile's info popover. This fits SOCIA's honesty rules.

## Best components
- **Chapter progress bar** (quality 1). Anatomy: chapter groups with a title that fades in, sub-segments with an under-label, and a fill layer carrying an inverted duplicate label. Done chapters are filled squares, future ones empty squares.
- **Calculator readout row:** big number on each side, a uppercase micro-label under each, and a hairline, a slider and a hairline between them. On phones it re-stacks vertically as satellites, slider, then cost.
- **Configurator shell:** three-step segmented stepper centred at the top (Domain, Application, Mission; active step filled cyan); an accordion config panel on the left with save pinned at the bottom; a grid of panes on the right. The panes are: orbit globe, costs, a "everything included" disclosure that flips the costs pane in place, data metrics, the satellite model, and a delivery timeline. Each visual pane has a corner expand control. Below 1280px wide only one pane shows, expanded.
- **Delivery timeline:** milestones above the bar (contract, first data, full service), phase names below, and segment widths proportional to the months. The open-ended operations phase fades out with an arrow.
- **Option card:** small render, name, value in the top right, a meta line of specs separated by middots, and a second meta line. Selected cards get a 2px accent inset bar and a lighter fill.
- **Price block (SpaceOps):** unit above in uppercase micro text (yearly per satellite), a small currency glyph, the large figure, and a qualifier below (single-year vs 5-year licence). Add-ons are inverted (white tiles) to separate core licences from extras. The hero CTA puts the price inside the button, separated from the action by a divider.
- **Sticky local nav (product page):** product name, section anchors (Specifications, Pricing, Space Service) with scroll-spy, and two CTAs on the right, docked at the bottom.
- **Accordion with crosshair plus:** the plus turns into a minus when open. The "Discover the frame range" accordion holds a 3-column comparison table.

## Best interactions
- **Scrubbed fills, not timed animations:** progress segments and spec values move with scroll position, so the user controls the pace (charge rate counts from 4A to 10A as you scroll). [measured]
- **Hover in the products menu:** the hovered name turns white, the others stay grey, and a render appears with the product's two defining specs (mass and peak power). Names first, numbers on intent. [observed]
- **Payload strip hover-expand:** the hovered panel grows (`flex-grow` 0.8s) and reveals its full descriptive name; its neighbours compress. [observed]
- **Context-following preview:** in the configurator the right-hand viewer switches to whatever the active section is about: satellite model for Payload, globe for Region. [observed]
- **Removable region chip** (dot, label, ×), and the search field disables itself while global coverage is on. [observed]
- **Snapping sliders:** the resolution slider snaps to ticks. The fleet slider is continuous but prices snap to the four published tiers (151 satellites shows the 100-tier price; the four tiers are visible in the page's data). [measured]

## Best UX patterns
- **One question per screen at the start of the configurator** (domain, then application, three to four large options each), then a dense workspace once the context is known. This is progressive commitment: easy first choices lead into the expert surface. [observed]
- **A problem/solution colour code across the whole site:** orange always labels the status quo, cyan the offer. [measured]
- **A scale reference in imagery:** a human silhouette stands next to the large satellite so the mass and size figures mean something. [observed] In SOCIA, the equivalent is giving every number a reference point (the account's median, the previous period).
- **"See what's included"** sits directly under the price as an accordion, so cost and contents are read together. [observed]

## What makes it feel premium
- **One typeface, one accent, near-zero radii, no shadows, hairlines only.** The restraint makes every coloured pixel meaningful.
- **Uppercase micro-labels with positive tracking** under large numbers (instrument-panel convention), with negative-tracked display type above.
- **Numbers carry units as smaller type** (M, KM² as superscript-size suffixes), so magnitude reads first.
- **Slow, consistent easing** (one 0.45s curve almost everywhere) gives a weighty, controlled feel.

**Where the technical/futuristic feel comes from, separated:**
- **Transferable to a data-dense app (behaviour):**
  - Live recalculation from a single input.
  - Placeholders that become real numbers as inputs arrive.
  - Progress that compresses into a summary.
  - Collapsed sections that summarise their state.
  - Charts whose markers move with the control.
  - The preview follows the section you're editing.
  - Units and definitions next to values.
  - A single state colour.
- **Marketing spectacle (not transferable):**
  - The 37,000px scroll-scrubbed 3D sequence and its giant uppercase headlines.
  - Dot-matrix globes, the x-ray wireframe renders and Earth imagery.
  - The odometer digit roll and text-scramble "decode" effect on project cards.
  - Count-up numbers that start at 0 on load.
  - Lenis smooth scrolling.
  - Fake dashboard screenshots in perspective.

## Weaknesses
- **Viewport-scaled type collapses at common laptop widths.** At 1024 wide the progress labels and price units are about 7px, and some homepage text is 6.4px. The system is tuned for 1440 and nothing stops it from shrinking. [measured]
- **Scroll-jacked length.** About 37,000px of scrolling carries roughly 20 sentences and one calculator. There's no CSS reduced-motion fallback for site motion. [measured]
- **Unit collision.** "M" means minutes (revisit 23M) and millions (cost 30 M) on the same screen. [observed]
- **No tabular numbers.** Live-updating figures change width as they recalculate. [measured]
- **Keyboard focus.** Tab lands first on items in the hidden products menu instead of the visible header links. The focus ring is the browser default. [measured]
- **Configurator below 1280px wide shows one pane at a time.** At 1024 the cost isn't visible until you collapse the expanded pane, and that control is a tiny unlabelled corner glyph. [measured + observed]
- **Selection state is unclear.** Two payload cards can both show the selected bar, with no ARIA state. [measured]
- **The smooth pricing curve implies continuity the data doesn't have.** There are four discrete tiers. [measured]
- **The comparison table doesn't mark which product you're on.** [observed]
- **Mobile:**
  - The progress rail is mostly off-screen (16px wide at x=371 of 375).
  - "Scroll to continue" overlaps the application card labels.
  - The product page's sticky bar takes about 150px of an 812px screen and covers the pricing chart. [measured + observed]
- **No visible hover change on the hero buttons.** [observed]

## Patterns relevant to SOCIA
| Pattern | Tag | SOCIA screen | Adaptation idea |
|---|---|---|---|
| Chapter progress: done steps collapse to filled marks, current step expands with labelled sub-steps, future steps empty, all clickable | NAVIGATION, ONBOARDING | Onboarding / connect accounts; Content Studio Make This Video and Plan These Posts phases | Driven by step state, not scroll. Done = `--primary` fill, current = `--primary-subtle` with the label, future = `--surface-muted`. Animate width with SOCIA's `cubic-bezier(0.22,1,0.36,1)` at 0.2s, not 0.8s. |
| Inverted label at the fill edge | MICROINTERACTIONS | AI usage and plan-limit meters, upload progress | Label stays legible over both fill and track. Clip a duplicate label inside the fill. |
| One input recalculates every derived readout, chart marker and timeline | CHARTS, ANALYTICS | Plan cadence (posts/week → expected range from the account's own history); Billing plan picker | Real data or published prices only. Show a range plus "based on your last N posts", never a fabricated point estimate. |
| "—" placeholders, gated next step, smart default once the prerequisite is set | EMPTY-STATES, FORMS | Dashboard and Analytics KPI tiles before the first sync; composer schedule step; plan setup | "—" plus a one-line reason (SOCIA rule). Disable later steps visibly. Prefill a default from history and say it's a default. |
| Collapsed section header summarises its chosen values | FORMS, SETTINGS, EDITOR | Create Post composer side panels; Settings sections; Content Studio look and sound | Summary in `--text-secondary` 12–12.5px, values separated by thin dividers, chevron to reopen. |
| Legend dash inside the KPI label, marker on the curve, bold nearest tick | CHARTS, ANALYTICS | Analytics chart cards; Dashboard KPI and sparkline tiles | KPI header doubles as the legend (this vs previous period). Hover marker on each series. Bold the tick nearest the hovered point. |
| Highlight one series, mute the rest | CHARTS | Analytics multi-platform charts; post comparison | Non-focused series go to `--chart-axis` grey; the focused one uses its series colour. |
| Spec rows: same size, label light and grey, value weighted and right-aligned, grouped under micro headings, stacked on mobile | TABLES, MOBILE | Post detail metrics; connected-account details in Settings; Analytics breakdowns | Inter with `tabular-nums`. SOCIA's 10.5–11px uppercase label style for group headings. |
| Formula or definition next to a derived metric | ANALYTICS | Engagement rate, reach rate and similar Analytics tiles | Info popover or inline caption giving the exact formula and data window. |
| Price anatomy: unit above, figure, qualifier below; "what's included" disclosure directly under the price | PRICING | /pricing and Settings → Billing | "per month" unit line and a trial qualifier. The inclusions accordion sits under each plan's price. |
| Preview follows the section being edited | EDITOR | Create Post composer: the preview switches to the platform or field being edited | Keep it a live preview, not decorative. |
| Pane expand-in-place, and flip-in-place disclosure | ANALYTICS, MOTION | Dashboard cards that open to a detail view | Expand within the grid using SOCIA's easing. Label the control (lucide maximize-2 with a tooltip). |
| Sticky section anchors with scroll-spy | NAVIGATION | Long Settings page; Analytics sections | A compact top or side anchor list, not a bottom bar that covers content on phones. |

## Patterns NOT relevant to SOCIA
- **Scroll-scrubbed narrative pages, Lenis smooth scroll, a 2048px canvas sequence:** marketing spectacle that slows access to information. SOCIA is a tool people return to daily.
- **Viewport-width root font-size:** it is exactly what produced 6–7px text here. SOCIA needs fixed, legible minimums.
- **Count-up from 0 on load, odometer rolls, text-scramble decode:** these delay reading and imply change that didn't happen. Animate a number only when the value actually updates live.
- **Black canvas, giant uppercase display type, dot-matrix globes, glow behind chart markers:** they contradict SOCIA's direction (no giant type, no glow) and its light/dark token system.
- **Fake product dashboards in perspective:** SOCIA should show its real screens.
- **Full-screen menus for a five-item nav:** SOCIA has a persistent sidebar.

## Do not copy
- The Magnetik typeface, the EnduroSat mark, and the cyan `#00a1ff` + orange `#fc6a18` pairing as an identity.
- The 3D satellite and payload renders, the white x-ray wireframe illustration style, the dot-matrix globe, the orbital imagery, and the human-silhouette-next-to-satellite composition.
- The diagonal arrow-in-square CTA glyph and the crosshair accordion icon (SOCIA uses lucide only).
- Their headlines, chapter names and calculator wording.
- The exact chapter progress bar visuals (squares, cyan fill, bottom docking). Take the principle (compress done, expand current), not the look.
