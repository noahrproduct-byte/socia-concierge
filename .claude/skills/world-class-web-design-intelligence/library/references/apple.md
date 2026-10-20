# Apple

- **URL(s):** https://www.apple.com/ (homepage), /macbook-pro/ (product page), /mac/compare/ (compare), /shop/buy-mac/macbook-pro (configurator, stopped before Continue)
- **Category:** marketing site + e-commerce configurator (no logged-in app studied)
- **Studied:** 2026-10-19
- **Tags:** NAVIGATION, SEARCH-COMMAND, TABLES, ANALYTICS, FORMS, PRICING, MOTION, MOBILE, EMPTY-STATES, ICONS, MICROINTERACTIONS

## Coverage
| Area | Inspected? | How | Notes |
|---|---|---|---|
| Homepage | yes | browser 1024px + 375px, extract-styles.js | Tiles, CTAs, footer directory measured. |
| Global nav flyouts | yes | keyboard (Enter on the hidden disclosure button), CSS rules read | Synthetic mouse hover did **not** open the flyouts in this pane, so the hover-intent delay is unmeasured. Open/close/stagger timings read from the live CSS. |
| Search flyout | partly | opened, typed a query, never submitted | Zero-query state seen. Type-ahead suggestions did not render after typing, so they're unverified. |
| Bag flyout | partly | opened (empty bag only) | Never signed in. Bag with items not seen. |
| Product page (MacBook Pro) | yes | 1024px + 375px, extract-styles.js | Local nav, type roles, feature cards, modal, highlights gallery. Tech Specs sub-page not visited. |
| Compare page | yes | 1024px + 375px, extract-styles.js | Changed one column with the native select (URL + title update seen). Not checked above 1024px, where more columns may show. |
| Buy / configure flow | yes, up to the summary | 1024px | Chose 14-inch → Space Black → Standard display → M5 Pro to watch steps unlock. **Continue, Save, Share, trade-in serial, payment and AppleCare not touched.** The step-progress bar was 0×0 at 1024px and never seen. |
| Footer / directory | yes | DOM + screenshot | |
| States (hover, focus, open) | partly | focus rules read, disclosure/escape tested, modal opened/closed | Mouse hover states read from CSS, not watched. |
| Motion | measured from CSS | transition/animation values | `prefers-reduced-motion` rules counted (34 on the product page), not visually tested. |
| Dark mode | n/a | | No `prefers-color-scheme` rules. Theme is set per section (`theme-dark`/`theme-light`). |
| Tablet width | no | | |

## Measured system
- **Type:** [measured] SF Pro Text below 19px, SF Pro Display from 19px up (the family switches at an optical-size threshold). Sizes in use across the three pages: **12, 14, 17, 19, 21, 24, 28, 32, 40, 48, 56, 64px**. 12px dominates the chrome (251 text nodes on the homepage), 17px is body. **Weights: 400 and 600 only** on the product and compare pages (homepage adds 700 on 7 nodes). The product page uses ~48 named `typography-*` roles (eyebrow, caption, feature-card-label, modal-header-headline…), yet they all resolve to those 12 sizes and 2 weights. **Tracking is a function of size**, not of component: 12px −0.01em, 14px −0.016em, 17px −0.022em, 19px +0.012em, 21px +0.011em, 24px +0.009em, 28px +0.007em, 32px +0.004em, 40px 0, 48px −0.003em, 56px −0.005em, 64px −0.009em. Line heights are tight on display sizes (24/28, 40/44, 64/68) and roomy on body (17/25). No tabular-number setting seen on the compare figures.
- **Colour:** [measured] Neutrals are near-neutral greys with almost no hue bias: text `#1d1d1f` (not pure black), secondary `#6e6e73`, tertiary `#86868b`; surfaces white, `#f5f5f7`, `#fafafc`, black, `#1d1d1f`. Much of the chrome uses **alpha black** instead of fixed greys: 0.88 (footer headings), 0.8 (nav links), 0.72 (links/secondary), 0.56 (footnotes), so text sits correctly on any surface. **One accent:** blue, in three tunings by background: `#0071e3` fills, `#0066cc` link text on light, `#2997ff` on dark. Status colours exist as tokens (`--sk-fill-green/orange/red/yellow` with `-secondary` tints) but barely appear. One disabled token: `--sk-link-disabled-opacity: 0.42`, reused for locked configurator steps.
- **Shape:** [measured] Radius grows with the element: 5px selects, 8px small buttons, 12px option cards, 18px configurator modal, 28px feature cards, 980px for pill CTAs, 50% for swatches and icon controls. **Shadows almost absent** (one shadow on 3 elements on the homepage, none on product and compare). Surfaces separate by fill (white vs `#f5f5f7` vs black), with 1px `#e8e8ed` rules on compare and 1px `#86868b` borders on configurator options.
- **Spacing and density:** [measured] Global nav 44px, local nav 52px (48px on phone), sticky configurator bar 124px, compare selector bar 69px. Homepage tiles 650px (full-bleed) and 490px (2-up) with **12px gutters** both ways. Content max-width 1024px at this viewport. 44px is the recurring hit size: nav items, CTAs (44px tall), modal close (44×44), segmented control (44px). Phone menu items are 53px tall.
- **Motion:** [measured] One standard curve, `cubic-bezier(0.4, 0, 0.6, 1)`, at 0.24s (state changes) and 0.32s (colour, entrances). Nav flyout height duration scales with height: 254ms for a 552px panel, 242ms for 528px (two data points; formula unknown). Flyout items: opacity + translateY(−4px→0), 0.32s, staggered 20ms per item plus a per-group delay (80ms first group, +40ms after). Close: no delay, faster (`min(0.16s + 20ms × remaining items, 0.24s)`). Switching from one open flyout to another uses a 0.12s cross-fade with no re-stagger. Page curtain behind a flyout fades in at 0.32s after an 80ms delay. Local nav background 0.24s `cubic-bezier(0.28, 0.11, 0.32, 1)`.
- **Icons:** [measured] SF Pro Icons plus inline SVG; nav chevrons 10px; configurator delivery/pickup glyphs in a 25px box with a 5px gap to a 12px label; bag menu glyphs 11×16; card affordance icons are 36px circles. Strokes are uniform and light. The nav's submenu chevron is invisible (opacity 0) until it gets keyboard focus.

## Strongest design qualities
1. **A large role vocabulary on a tiny scale.** About 48 named type roles collapse onto 12 sizes, 2 weights and one tracking curve. [measured] **Why it works:** each role's name tells authors *where* to use it, but the values come from a short ladder, so any two adjacent elements differ by a clear step, never by 0.5px or 50 weight units. Weight is reserved for "this is a label/heading" (600) versus "this is reading text" (400). Size and colour do the rest of the work. **For SOCIA:** direct fix for the baseline's known problem (10 sizes between 9 and 13.5px, 8 weights). Transfer the method (named roles → ~6 size tokens, 2–3 weights, tracking set per size token), not Apple's values or font.
2. **Hierarchy by colour steps, with one accent kept for action.** [measured] Text uses 4 alpha steps of black; blue appears only on links, CTAs, the selected configurator option and focus rings. Emphasis inside a paragraph is done by colour, not weight: product copy is 21px/600 in `#86868b` with one clause in white. [measured] **Why it works:** with weight and size held constant, the eye reads the brighter clause as the point, and the paragraph stays visually quiet. A single accent never competes with itself, so wherever it appears it means "you can act here". **For SOCIA:** matches the purple-for-action rule. The in-paragraph colour emphasis suits AI insight lines (Today card, plan rationale, alert explanations): the finding in `--text-primary`, the reasoning in `--text-secondary`, same weight.
3. **Complex choices simplified step by step (configurator).** [observed + measured] The steps are native fieldsets. Downstream steps are rendered and readable but `disabled` and dimmed to 0.42 until the upstream choice exists, so you see the whole path but can't make an invalid combination. Each step heading is two-tone at the same size: a noun in primary colour and an instruction in grey (pattern: "Model. Choose your size."). Other mechanisms:
   - Top-level options show absolute "from" prices. Choosing one reveals a nested sub-choice *inside* the selected card, priced as deltas ("Included" / "+ $200").
   - Deeper customisations collapse to one-line summaries that state the constraint from earlier choices (memory "up to 128GB with your current chip selection").
   - Every step has an on-demand "Need help choosing …?" helper that opens a modal with a 44px segmented control to flip between the options.
   - A sticky top bar keeps the running total current (it moved from $1999 to $2499 when the chip changed), and a sticky left column shows media and explainer text for the current step.

   **Why it works:** progressive disclosure keeps each decision small. Showing the locked future steps sets expectations about effort. Deltas answer "what does this change cost me?", and stating the constraint stops people from hunting for options that don't exist. **For SOCIA:** the Create Post composer (platform → media → caption → schedule), onboarding/connect, Plan These Posts, plan upgrade.
4. **Comparisons made scannable.** [measured] The compare page has no left-hand label column. Every cell labels itself: a big value with a small caption under it (40px "10-core" over 12px "CPU"), and a qualifier like "From" in small text above. A "Quick Look" band of headline metrics comes first, then grouped sections with 28px headings and 1px rules. Rows align across columns, so a difference shows up by position. A missing feature is an `aria-hidden` dash plus visually hidden "Not available" text in the same row. Under the layout are ARIA `table/row/rowheader/columnheader` roles with a hidden header row. The model pickers are native selects with optgroups (current vs older, 59 models) in a sticky 69px bar. The selection is written to the URL (`?modelList=A,B`) and the document title ("A vs B"). **Why it works:** self-labelling cells give every column the full width, so two columns still fit at 375px with no horizontal scroll [measured scrollWidth 375]. The headline band answers the common question first. The sticky pickers keep column identity visible. URL state makes a comparison shareable and restorable. **For SOCIA:** Analytics "All brands" tab, Competitors, platform comparison, and SOCIA's "unknown is —, never 0" rule (Apple adds the screen-reader text SOCIA should add too).
5. **Navigation density handled by handing over context.** [measured] The 44px global bar scrolls away on product pages and a 52px sticky local bar takes over. It holds the product name (21px/600), sub-pages (12px; inactive at opacity 0.8; current at full opacity with a 1px underline and `cursor: default`) and one compact primary action (a 45×24 Buy pill). On a phone the sub-pages fold behind a chevron and Buy stays. **Why it works:** only one bar ever takes vertical space, and it always holds the most relevant scope plus the single next action. The current page is marked by three redundant cues and is visibly not clickable. **For SOCIA:** in-app sticky page headers (Analytics, Calendar, Content Studio): title, tabs, one primary action; on phone, tabs collapse and the action stays.
6. **One overlay template for every top-level surface.** [observed] Product menus, search and the bag all open the same full-width flyout: 24px/600 "elevated" links for primary destinations, 12px/600 links for secondary ones, 12px grey group headers, a blurred page curtain behind. Search shows quick links before anything is typed. The empty bag gives one headline, one sentence on how to get value (sign in to see saved items) and a short list of profile links. **Why it works:** once you've learned one menu you can read them all. The two-size link hierarchy inside a menu says "start here" without icons or descriptions. **For SOCIA:** the workspace switcher, bell inbox, user menu and a future command palette should share one popover anatomy. The zero-query quick links suit a command palette.
7. **Motion that encodes structure, not decoration.** [measured] Entrance stagger (20ms per item, extra per group) shows the menu's grouping. Exits are faster and drop the delay, so closing never feels slow. Moving between open menus skips the entrance and cross-fades in 0.12s, so browsing menus doesn't replay the animation. Height duration grows with distance. In the highlights gallery the active dot stretches to a 48px pill whose fill grows over time: position and time-to-next-slide in one indicator, with a 56px pause button always visible. **Why it works:** the timing follows what the user is doing (opening, leaving, browsing), and the indicators say what's about to happen. **For SOCIA:** unify the scattered 0.15/0.18/0.2s durations into 2 tokens, make exits shorter than entrances, don't replay entrance animation when moving between sibling popovers.

## Best components
- **Configurator option card** [measured]: 12px radius, 1px `#86868b` border, 15px padding. Selected state: 2px `#0071e3` border, with no fill change and no shadow. The title, a one-line description, then the price, all inside the card. Nested sub-options sit in a grey inset panel inside the selected card.
- **Compare cell** [measured]: optional qualifier (small) / value (40px/600) / caption (12px). In detail sections a label (600) sits over the value (400), with an aligned dash for "absent".
- **Local nav** [measured]: 52px, translucent with a 1px hairline (24% white on dark) that appears once it sticks. Title left, links + compact action right.
- **Segmented control in help modals** [measured]: 44px tall, 14px/600. The active segment is a near-black filled pill, *not* the accent blue, so "selected view" stays apart from "action".
- **Feature card affordance** [observed + measured]: the whole card is the control, with a 36px circular glyph at bottom-right. A **chevron means it navigates away, a plus means it opens in place** (a modal that is `role="dialog"`, `aria-modal`, labelled by the card's headline, with a 44×44 close). Repeated CTAs get unique accessible names ("Learn more, <topic>").
- **Footer directory** [measured]: 5 columns × 196px, 76 links, all 12px. Hierarchy only by weight (600 headings) and opacity (0.88 / 0.72 / 0.56). Short sections stack within a column to balance column heights.

## Best interactions
- **Keyboard-first disclosure in the nav** [measured]: each top item has a hidden chevron button that appears only on `:focus-visible`. Enter opens the flyout (`aria-expanded` flips), Escape closes it and focus stays on the trigger.
- **Steps that unlock** [measured]: picking a model removed `disabled` from the next fieldset at once, with no page change.
- **Running total in a sticky bar** [measured]: the price updated in place on each choice.
- **URL and title follow the comparison** [measured]: a select change rewrote the query string and `document.title`.
- **Hover on nav links darkens the text** (alpha 0.8 → solid, 0.32s colour transition) [measured]. No background or underline, which keeps a 12-item bar calm.
- **Focus ring** [measured]: 2px solid accent, 1px offset; inside the 44px nav it's inset (−7px offset) so it never spills outside the bar.

## Best UX patterns
- **Show the whole path, lock what isn't ready** (disabled + 0.42 opacity) instead of hiding later steps.
- **Absolute price at the top level, delta inside a chosen option.** Each level answers the question people have at that moment.
- **State constraints from earlier choices** inside the collapsed summary, not in an error after the fact.
- **Help next to the decision** ("Need help choosing …?") opens a focused explainer and keeps the person in the flow.
- **Headline metrics first, detail second** (Quick Look band before grouped specs).
- **Self-labelling cells** so a comparison works at any width without a label column.
- **Absence shown in place** (dash in the aligned row, with screen-reader text).
- **Exactly two CTAs per promo tile** [measured]: filled primary + outline secondary, both 44px. The choice is always "learn" or "act", never a third option.

## What makes it feel premium
- **Optical tracking per size** and a font switch at 19px [measured]: small text is loosened, large text tightened, so every size looks evenly set.
- **Two weights** [measured]: emphasis is rare, so it reads as deliberate.
- **Near-black `#1d1d1f` and alpha greys** instead of pure black and arbitrary greys [measured]: softer contrast without losing legibility, and text adapts to any surface.
- **Accent tuned per background** (`#0066cc` on light, `#2997ff` on dark) [measured]: the "same" blue keeps its contrast everywhere.
- **No shadows, separation by fill** [measured]: fewer edges, calmer screens.
- **Consistent 44px interactive height** [measured] across nav, buttons, close and segmented controls.
- **Asymmetric motion** [measured]: quick to leave, slightly slower to arrive, no replay when browsing.
- **Radius proportional to size** [measured] (5 → 8 → 12 → 18 → 28), so corners look related.

## Weaknesses
- **Hover-dependent mega menus with 11 top-level items** [observed]: the hover path couldn't be triggered here, and on touch laptops it relies on the hidden disclosure button. Most nav and footer text is 12px.
- **Footnote noise** [measured]: symbol footnotes (§, ◊, ※, #, ±) set at 8.4px interrupt nearly every price and claim.
- **Repetitive financing copy** [observed]: every configurator option repeats "Buy from … or …/mo. … Lease from …/mo.", which buries the actual difference between options.
- **Very long pages** [measured]: the MacBook Pro page is ~29,000px tall at 1024px; the Performance section alone is ~6,300px.
- **Compare has no "only differences" filter or difference highlight** [observed]: 59 rows, and identical rows have the same weight as different ones.
- **Truncated names in the phone compare pickers** [observed]: the sticky selects cut model names mid-word.
- **Small phone action target** [measured]: the local-nav Buy pill is 45×24 on a 375px phone, under the 44px size the rest of the site keeps.
- **Locked steps at 0.42 opacity** [measured] are hard to read on light grey. That's acceptable for a preview, too faint for content people need.
- **Focus after closing a mouse-opened modal** went to `<body>` rather than back to the card [observed, one test].
- A chat avatar bubble sits over configurator content at bottom-right [observed].

## Patterns relevant to SOCIA
| Pattern | Tag | SOCIA screen | Adaptation idea |
|---|---|---|---|
| Named type roles on a short size ladder, 2–3 weights, tracking set per size | (system-wide) | All screens, `app/globals.css` | Define ~6 Inter size tokens (e.g. 11/12/13/15/18/22) with tracking baked into each token, roles mapped onto them; collapse weights to 500/600/700. Use Inter's own size-dependent tracking guidance, not Apple's SF values. |
| Alpha text steps + single accent for action | (system-wide) | All screens | Keep `--text-primary/secondary/muted`; never use purple for decoration or headings. |
| Emphasis by colour inside a sentence | (system-wide) | Dashboard Today card, plan rationale, alert explanations | Key finding in `--text-primary`, reasoning in `--text-secondary`, same weight. No bold-within-bold. |
| Radius grows with element size | (system-wide) | All components | Replace 6/8/9/10/12/14 with a 4-step rule: chips 6, controls 8, cards 12, dialogs 16. |
| Visible-but-locked downstream steps, one disabled-opacity token | FORMS | Create Post composer, onboarding/connect, Content Studio Make This Video | Render later steps, set `disabled` + a single `--disabled-opacity` (~0.45), unlock on the upstream choice. |
| Two-tone step heading (noun + instruction) | FORMS | Composer sections, Settings sections | "Platforms. Pick where this goes." pattern: noun in primary, instruction in secondary, one size. (Write SOCIA's own copy, no em dashes.) |
| Nested choice only inside the selected option | FORMS | Composer per-platform options (Trial Reel, collaborators, first comment) | Reveal per-platform settings inside the selected platform card, not as a separate panel. |
| Constraint-aware collapsed summary | FORMS | Composer hashtags/collaborators, Settings limits | Show "Up to 5 hashtags on Instagram" in the collapsed row before the person tries to exceed it. |
| Sticky running summary | FORMS | Composer, Plan These Posts | A sticky footer/header showing selected platforms, scheduled time and approval status, updated live. |
| "Need help choosing?" explainer next to a decision | FORMS | Trial Reels toggle, plan choice, metric pickers | Inline link → small dialog with a segmented control comparing the options in SOCIA's own words. |
| Absolute price at top level, delta inside selection | PRICING | Plans page, upgrade prompts (`upgradeFor`) | List plans at $19/$49/$99; on upgrade, show "+$30/mo vs your plan" next to the target plan. |
| Headline metric band, then grouped detail | ANALYTICS | Analytics overview, All brands tab | One row of value-over-caption KPIs with qualifiers ("Last 28 days") above grouped sections. |
| Self-labelling comparison cells, no label column | TABLES | All brands, Competitors, platform compare | Each cell = value + caption, so 2 brands fit side by side on a phone. |
| Aligned dash + screen-reader reason for absent data | TABLES, EMPTY-STATES | Every analytics table | Keep the visible "—", add visually hidden text with the reason ("Not available for TikTok"). |
| Sticky column identity + comparison in URL/title | TABLES, NAVIGATION | Competitors, All brands | Sticky brand pickers; write `?brands=a,b` and set the tab title so comparisons can be shared and restored. |
| Global chrome yields to a contextual sticky header | NAVIGATION, MOBILE | Analytics, Calendar, Content Studio headers | Sticky page header: title, tabs, one primary action; on phone tabs collapse behind a chevron, the action stays (at ≥40px height, unlike Apple's 24px pill). |
| Current tab: full opacity + 1px underline + not clickable | NAVIGATION | `components/ui/tabs` | Inactive tabs at secondary colour, current at primary with a 1–2px underline and `cursor: default`. |
| One popover anatomy for all top-level menus | NAVIGATION, MICROINTERACTIONS | Workspace switcher, bell inbox, user menu, create menu | Same padding, header style, item heights and motion for all of them. |
| Zero-query quick links | SEARCH-COMMAND | Future command palette | Show 4–6 likely destinations ("Schedule a post", "Today", "Connect TikTok") before typing. |
| Empty state = headline + one how-to sentence + links | EMPTY-STATES | Calendar empty, bell empty, Worth posting again empty | One line on what unlocks the content, one link to do it. No illustration. |
| Chevron = navigates, plus = opens in place | ICONS | Dashboard cards, Today card, alert rows | lucide `ChevronRight` for navigation, `Plus`/`Maximize2` for in-place detail, used the same way everywhere. |
| Unique accessible names for repeated CTAs | MICROINTERACTIONS | Lists with repeated "Draft", "View", "Approve" | `aria-label="Draft again, <post title>"`. |
| Exit faster than enter; no replay between siblings; distance-scaled duration | MOTION | Dropdowns, sidebar groups, bell inbox, dialogs | Two duration tokens (e.g. 0.16s exit, 0.22s enter) on the existing `cubic-bezier(0.22, 1, 0.36, 1)`; 15–20ms stagger only for menus of 4+ items. |
| Solid 2px focus ring, inset inside dense bars | MICROINTERACTIONS | Whole app | SOCIA's 3px 12% purple ring is faint on white [inferred]. Consider a 2px solid `--primary` outline with a 1px offset, inset in the sidebar. |

## Patterns NOT relevant to SOCIA
- **Full-bleed product photography tiles, scroll-driven films, 3D product viewer:** marketing spectacle with no counterpart in an analytics tool.
- **40–64px marketing headlines:** they break SOCIA's "no giant type" rule. Only the *method* of the type system transfers.
- **Translucent blurred bars and a blur curtain behind menus** (`blur(20px) saturate(1.8)`): this is glass, which SOCIA avoids. The purpose (dim the page so the menu has focus) can be met with a plain scrim if it's ever needed.
- **Per-section dark/light theming with the nav recolouring to match:** SOCIA's theme is the user's choice, not the content's.
- **980px pill CTAs at 44px:** SOCIA forbids giant pill buttons.
- **Full-width hover mega menus with 11 categories:** SOCIA navigates with a sidebar.
- **Auto-advancing galleries:** SOCIA has no carousels. If anything ever auto-advances, keep the principle: show the time remaining and a visible pause.
- **Footnote symbol system and financing copy:** legal and commerce needs SOCIA doesn't share.

## Do not copy
- The SF Pro Text/Display/Icons fonts and glyphs (licensed for Apple platforms), the Apple logo, product names and imagery, chip artwork, and the highlights-gallery visuals.
- Apple's blue (`#0071e3` / `#0066cc` / `#2997ff`) as an accent. SOCIA's action colour stays purple.
- Their copy and taglines, including the exact two-tone heading wording and the "Learn more" + "Buy" tile pairing as a visual signature.
- The translucent nav look, the 28px-radius promo card look, the dot-to-progress-pill gallery control as drawn, and the footer's exact column layout.
