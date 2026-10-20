# SOCIA redesign direction

Written 2026-10-20 from the audit (three code reports, the live homepage and dashboard at 1440 and 375px, measured CSS) and the design library (Metricool, Apple, ElevenLabs, Framer, EnduroSat, Higgsfield) plus the three reference skills Noah supplied (taste-skill, impeccable, Emil Kowalski's design-engineering skills). Nothing here is built yet. Each numbered section answers one of the ten questions in the brief.

Audit reports: `scratchpad/audit/shell-dashboard-analytics.code.md`, `calendar-composer-studio.code.md`, `competitors-plan-chat-settings-onboarding.code.md` (session scratchpad). The live logged-in pass by agents did not run (session limit, then a TLS failure); I looked at the homepage and dashboard myself at both widths, and every screen gets a live check during its own phase.

---

## 1. The biggest problems with SOCIA's UI today

In order of how much they show.

1. **Three design systems and four generations of CSS load at once.** `app/globals.css` is 12,820 lines; about 3,000 of them style routes that now redirect (`/niche`, `/chat`, `/plan`, `/scorer`) and another 1,000 or so are dead selectors inside live families. The app shell (`.app`/`.side`) is declared four times and the phone shell twice; Competitors (`cx` + `cx2`), Settings (`st2` + `st3` + override pass) and Content Plan (v1 "premium" + consistency pass) each wear two or three skins and the last override wins. A separate shadcn/Tailwind layer (`components/ui`, Radix menus with `w-60 gap-2`) sits beside hand-rolled popovers with different keyboard behaviour.
2. **The "AI SaaS" costume.** 149 gradients, 85 coloured glow shadows, 17 backdrop blurs, 70 keyframe sets, the Sparkles icon 85 times in 30 files (it is even the nav icon for Weekly roundup), an aurora and an orb in onboarding, a full-screen "AI is scanning your account" cinematic after connect, a "SOCIA INTELLIGENCE" strip with a scan sweep and an equaliser, count-up animations on real numbers, staggered entrances on every chip and card, a pulsing green "live" dot on an estimate, hover-lift on nearly every card. 👋 in the greeting on all three dashboards, 🎉 in an onboarding h1.
3. **Nothing is sized from a scale.** 50 distinct font sizes (177 declarations at half-pixel sizes such as 12.5px; 49 below 11px), 8 to 12 weights (500/550/600/650/700/750/780/800), 21 radii, 165 shadow recipes, 285 literal durations while the motion tokens that exist are used zero times, 11 breakpoints, about 12 different "button heights" on one screen.
4. **Hierarchy is muddy because every component was drawn once more.** Seven KPI tiles, seven tab idioms, seven to nine primary-button implementations (flat, glow, gradient, gradient with dark text), nine chip styles, five spinners (two named `.spin` with different keyframes), four drop zones, four platform-mark sets with three different Instagram pinks, ten variants of the tiny uppercase eyebrow label. Readers cannot learn the interface because it never repeats.
5. **The homepage could belong to any AI start-up.** Dark navy starfield, a tracked uppercase eyebrow "AI SOCIAL INTELLIGENCE", numbered section labels ("02 PROBLEM"), eight statement headlines, a sticky numbered side index, scroll-reveal sections that leave screens of blank ground (seen live at 1440 and 375), and invented proof: six made-up logos ("northloop", "Verve", "STUDIO/9"…) and stats ("3.2× more engagement", "6 hrs saved per week"). On a phone the first screen shows the nav, an empty starfield and the top of a mock dashboard: no headline, no statement of what SOCIA is.
6. **Data honesty has leaks, against Noah's own rule.** Onboarding shows a fabricated four-post plan with invented scores (92/88/90/85) behind a timer-only "Building your strategy…"; Settings shows three fake competitor handles with stock avatars to every user; X and LinkedIn (and in onboarding TikTok, Facebook, YouTube) show a green "Connected" state after a string write; the Content Plan "/100 health" score has no stated basis; "0 synced posts", "Sound: 0%", "0 MB" where the value is unknown; bare "—" in Competitors rosters although the reason exists in the data model; "Publish readiness 67%" dresses a checks-passed ratio as a score; every failed platform read is swallowed and shown as "not connected".
7. **Mobile is the desktop squeezed.** At 375px the sidebar becomes two sticky strips plus the top bar (about 220px of chrome pinned above every page, seen live); the KPI grid never goes to one column; the calendar month view has about 33px per cell for 10.5px no-wrap text and a hover-only add button; the week view stacks seven day sections with seven "Schedule post" buttons; the composer's step labels truncate; the connect path (social-account rows) is hidden on phones.
8. **Copy drifts.** Title Case and sentence case alternate on one screen ("Performance Overview" next to "What changed"); six labels for the same destination (`/tool`: "View strategy", "Generate Content", "Generate my week", "Open Content Plan"…); "Create post" vs "Create Post" (5 vs 16); about 70 em dashes in user-facing strings; marketing taglines inside the product ("Powers every recommendation the AI makes", "a plan that actually works", "Hit Generate and you'll get…"); "Business Account" as a literal under the avatar; "AI-powered" on the auth shell; "Smart time"; "Hook Lab".
9. **Accessibility is uneven.** Tab lists without roles or arrow keys (24 `tablist` roles in 17 files, 10 of those files with no arrow-key handler, and the Analytics tabs with no role at all), hover-only controls with no focus reveal, 110 `title=` attributes in the app's TSX, most of them the only explanation of a formula, a reason or a disabled button (invisible on touch), 365 focusable chart buckets on a yearly chart, two keyboard models for menus, labels not associated with inputs in Settings, `window.confirm` for destructive actions, a `listitem` role on a button.
10. **Plain bugs the audit surfaced.** `.cpl-generate` sets dark text on a violet gradient (light mode); the Team and Workspaces managers reference tokens that do not exist (`--muted-text`, `--text`, `--input-bg`); `cal2-toast` is undefined so the Studio "Draft saved" toast renders unstyled; spinners on the Dashboard and Analytics do not rotate on a cold load because their class lives in the composer stylesheet; the Analytics screen renders two "Analytics" h1s; the dashboard donut draws Facebook and TikTok in the same colour.

What is already right and must not be lost is listed in section 4.

## 2. The strongest principles from the reference library

Each one is backed by at least two studied products and by the reference skills.

1. **Colour goes on data and the one action, never on chrome.** Framer fills exactly one button per screen; Apple uses blue only on links, CTAs, selection and focus; ElevenLabs runs black actions with colour only in data; the taste-skill app study found the median screen about 3% coloured pixels and no filled primary at all on 12 of 23 screens.
2. **Few weights, few sizes; hierarchy comes from size steps and text-colour steps.** Apple: two weights across about 48 roles. Framer: six sizes, two weights. The cleanest app scales measured are 12/14/16/24 and 12/14/18/24.
3. **One control height and concentric radii.** Framer: every control 30px, menu radius = item radius + padding. Radius is bimodal in good products: tight (4 to 8) or soft (16 to 24), never a ladder of 6/8/9/10/11/12/13/14.
4. **Flat surfaces.** 17 of 23 studied screens give cards no shadow; separation is a 1px line or one tone step. Shadows only on what floats (menu, popover, dialog). A border or a shadow, never both.
5. **KPIs are type, not tiles.** No studied screen puts an icon in a coloured circle on a KPI or draws a sparkline on one. Label over value, 24px at regular or medium weight, delta in words with its window, colour says good or bad (not up or down), zero or undefined change stays grey.
6. **Charts carry almost no chrome.** One series per chart, one hue, 2px straight segments, no point markers, 3 to 5 faint gridlines, no y-axis line, no legend for a single series, a scale always, the event that matters annotated.
7. **Navigation recedes; the product is named.** Active item is a neutral grey pill or a change of text colour; no studied light screen puts a dark or saturated sidebar against a light canvas (0 of 17). The product's mark and the scope (workspace) sit at the top of the shell.
8. **Unknown is shown as unknown; empty is an instruction; an empty section keeps its frame.** Framer's grey dash and empty views that name the prerequisite; ElevenLabs' "—" and scoped "No data has been collected"; a real zero prints as a zero. This matches SOCIA's own rule and is the one place SOCIA is already ahead of Metricool.
9. **Show the consequence and the cost at the point of decision.** ElevenLabs' credits beside every generate button; Higgsfield's live price on the button; Metricool's "N out of M posts this month" in the planner. This is where "futuristic" really comes from: cause and effect you can see, not glow.
10. **Motion is feedback, and apps move fast.** Framer menus at 80ms, ElevenLabs at 150ms, no entrance choreography; Emil's frequency table: anything used tens of times a day gets near-imperceptible motion or none; UI transitions stay under 300ms; `ease-out` on enter and exit, never `ease-in`; transitions over keyframes so they can be interrupted; reduced motion keeps opacity, drops movement.
11. **Settings are rows of label, current value and one action, grouped by scope, each tab a URL.** ElevenLabs and Framer. One save model per view.
12. **Paywalls are contextual, quantified and non-destructive.** Metricool's "Unlock <tool>" with the lowest qualifying plan and "Maybe later"; Higgsfield's sheet that leaves the selection intact. SOCIA's `PlanNotice` + `upgradeFor` already do this; the redesign keeps one upgrade message per screen.
13. **The brief wins; refinement preserves, redesign replaces.** From impeccable. This is a redesign of the look, so the old look is evidence and anti-reference, but product truth, content and function stay exactly as they are.
14. **Removal is not enough.** From taste-skill: a page with every tell removed and nothing in its place is "an empty page with good manners". What fills the space is the product: its own data at real size, each screen's one question answered by its biggest block, the main job one click away.

## 3. The proposed design language

A name helps the team talk about it: **"the instrument"**. SOCIA is a measuring and deciding tool for people who post every day, so it should look like a well-made instrument: neutral body, a readable face, one coloured needle.

**Palette (from the brief's hues, with the contrast measured):**

| Token | Light | Dark | Role |
|---|---|---|---|
| `--ground` | `#F5F6FA` | `#0F1115` | page |
| `--surface` | `#FFFFFF` | `#161920` | cards, sidebar, top bar (the shell shares the ground tone, see §8) |
| `--surface-raised` | `#F5F6FA` | `#1D2129` | wells, hover |
| `--border` | `#E8E9EC` (brief's silver) | `#262B35` | hairlines, 1px |
| `--border-strong` | `#CFD3DB` | `#343A46` | inputs, controls |
| `--ink` | `#0F172A` (brief's navy) | `#EEF1F8` | primary text |
| `--ink-2` | `#4B5565` | `#A8B0C0` | secondary text (7.5:1 on white, 7.0:1 on the ground; 8.7:1 on dark) |
| `--ink-3` | `#646B7A` | `#8A93A6` | meta, placeholders (5.4:1 on white, 5.0:1 on the ground; 6.1:1 on dark). The current `#8a93a6` is 3.1:1 on white and fails. |
| `--accent` | `#2563FF` (cobalt) | `#2563FF` | the one action fill, white text (4.88:1 both themes) |
| `--accent-ink` | `#1D4ED8` (6.7:1 on white) | `#60A5FA` (sky, 7.4:1 on navy) | links, selected text, focus ring, the main data series |
| `--positive` text | `#15803D` | `#4ADE80` | good change, published |
| `--warning` text | `#B45309` | `#FBBF24` | attention |
| `--negative` text | `#B91C1C` | `#F87171` | bad change, failed |
| pale pills | tint + dark ink of the same hue | hue on a dark tint of itself | status only |

Cobalt replaces purple as the action colour everywhere, including the sidebar active state (which becomes a neutral pill with cobalt text) and the focus ring. Measured: the token swap covers 156 `var(--primary)`, 159 `var(--accent)` (an alias of `--primary` at globals.css line 2349), 299 `--primary-rgb` and 128 `--cobalt` uses in CSS; 22 hex literals in TSX (`#5b4bd6` ×7, `#7b6cf6` ×3, `#2563ff` ×12, the last on the landing page) must be swept by hand in the same phase. Cobalt on the navy ground is only 3.9:1, so on dark surfaces coloured text uses sky and fills keep cobalt with white text. Platform brand colours become four tokens (`--brand-instagram` etc.) used only inside the platform marks; data series never borrow them.

**Type:** Inter everywhere, one family (Geist on the marketing pages goes). App scale: 12 / 14 / 16 / 20 / 24px with line heights 16 / 20 / 24 / 28 / 32; weights 400 / 500 / 600 only (600 reserved for the page title, card titles and money). Tabular figures on every number. Nothing under 12px; meta and axis labels 12px sentence case. No tracked uppercase labels except the workspace switcher's context word. Marketing scale: body 17px, lead 20 to 24px, section headings 40 to 56px, the display line a `clamp()` between 44 and 80px at weight 500 with tracking -0.02em, two lines maximum at every width.

**Shape:** tight radii, concentric. Controls 6px, chips 4px, cards 8px, dialogs and drawers 12px, inputs 6px. Pills only for chips, toggles and avatars. One control height: 32px for every button, input, select and segmented control in the canvas; the top-bar search is also 32px.

**Depth:** 1px `--border` on cards and tables, or one tone step; no shadow at rest anywhere. Shadows exist only on menus, popovers, tooltips, drawers and dialogs, always offset with a soft blur and paired with a 1px ring. No gradients, no glow, no blur, no glass, no aurora, no orb, no particles, no cinematic.

**Motion:** four tokens, `--t-press 100ms`, `--t-menu 150ms`, `--t-panel 200ms`, `--t-dialog 250ms`; `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` for enter and exit, `--ease-move: cubic-bezier(0.77, 0, 0.175, 1)` for things that move while on screen. No entrance animation in the app: no stagger, no rise, no count-up, no bar growth, no chart draw-in, no tab fade. Feedback only: press (`scale(0.97)`), hover colour (gated by `(hover: hover) and (pointer: fine)`), menu and drawer open, toast arrive and leave. Transitions, not keyframes, for anything rapid. Reduced motion keeps opacity changes and removes movement. The marketing site gets one authored moment (the hero's product fragment settling into place) and otherwise content is in place on first paint.

**Icons:** lucide only, three sizes: 16px in nav and buttons, 14px inline, 12px in chips. Default stroke. One `PlatformMark` component with one set of four SVGs. Sparkles is retired; Ask SOCIA uses the brand mark; AI-written text is marked by the label "SOCIA's read" and nothing else. No emoji, no text glyphs (★ ✓ ▶) as icons.

**The product's face (what only SOCIA has):**
- **The "Next" line.** Every app screen opens with a 24px noun title, then one sentence in `--ink-2` that states the screen's one finding from today's data, with the one action beside it. On the Dashboard this is the Today card promoted to the title row. "Know what to do next" becomes a visible structure, not a slogan.
- **The honest cell.** One treatment for unknown everywhere: a grey dash plus the reason in 12px text under it (and for screen readers), never only a tooltip, never a zero. Shown on KPIs, roster chips, tables and the dashboard platform list alike.
- **Cobalt on today's data.** The one hue goes on the current period's series and the selected state; everything else in a chart is grey.

## 4. What to preserve

Untouched, by design:
- All of `lib/*`: auth, entitlements and `FEATURE_MIN_PLAN`/`upgradeFor`, workspaces and `connectionWorkspaceId`, the Meta/YouTube/Facebook/TikTok readers, publishing (`lib/publishing/*`, status, timing, capabilities), scheduling and approvals, Stripe, the OAuth and MCP server, alerts, plan loop, analytics calculations, the provenance model (`Series.provenance`, `Kpi.status/note/source`, `Cell/absent/CELL_REASON`).
- Every API route and every URL (`/tool` stays `/tool`; only labels change).
- The honest copy that already exists: "Not available, not zero", "no previous period yet", "Needs at least 4 posts on each side of a comparison", "Where a post lands is not proof the hour caused its result", `pa-unavail` lists, `gateText()`, `NO_HISTORY_SENTENCE`, "did not return a link", "did not say why", Trial Reel copy, "Not done automatically", "(placeholder)" times, "Didn't make the cut" with reasons, "Built from N of your posts…", connect-card error copy for every OAuth outcome.
- Components whose behaviour is right and only need the new skin: `PageHeader`, `PlanNotice`/`UsageLine`, `ov/Drawer` semantics (Escape, scroll lock), `AnalyticsShell` instant tab switching with URL sync, `Mounted`/`TodayCard` time-zone handling, `UpdatedAgo`, `DateRangeSelector` serving the real range, `Locked` panels, the `ov-why-block` evidence structure (Observed / Derived / Interpretation / Recommendation kept apart), `KpiCard`'s dash-with-reason, `WhatChanged`, `EngagementCard`'s formula sentence, the composer's `contracts.ts` reducer and left/right split, `ReadinessPanel`'s Fix buttons that focus the field, `PublishingStatus` per destination, `UsernameInput`'s complete combobox, `Roster`'s keyboard model, `SettingsNav` scroll highlighting, `PageSkeleton` + route `loading.tsx` variants, the global `:focus-visible` rule, the token architecture (one `:root`, one `[data-theme="dark"]`, shadcn names mapped onto SOCIA tokens).
- The SOCIA logo and mark (`BrandMark`).

## 5. What to change

- **Replace the CSS, do not patch it.** New token and primitive layer; each page migrates onto it and its old families are deleted in the same PR; the ~3,000 lines for redirected routes and the dead families (`an3`, `an2`, `db2`, `yta`, `nt2*`, `nd`, `ch2`, `chat*`, `cp2`, `cp3`, `cal`, `dm`, `onb`, `dropzone`, `report`, `settings`, `momentum`, gen-1 and gen-2 shell) go first. Target: globals.css under 3,000 lines, split into `tokens.css`, `base.css`, `primitives.css`, `shell.css` and one small file per page.
- **One of each primitive** (section 9): button, control, segmented control, tabs, chip, KPI strip, card, table, field, menu, popover, drawer, dialog, toast, empty state, skeleton, platform mark, status pill, honest cell.
- **Remove every decorative device** listed in §1.2, the Sparkles icon, emoji, count-ups, staggers, entrance keyframes, the SyncCinematic theatre (replaced by a plain progress list in the title row), the onboarding aurora and orb, the Competitors intel strip, the Content Plan orb and capability grid, the "SOCIA AI" chatbot card (Ask SOCIA stays in the top bar and in context, as `lib/nav.ts` already says).
- **Fix the honesty leaks** (§1.6): the onboarding plan phase shows the real first analysis or an honest waiting state, never invented posts; Settings' preview competitors become the real tracked list or an empty state; X and LinkedIn rows say "Not supported yet" with no connect control; the health score states its basis or is removed from the card; every `?? 0` on an unknown becomes the honest cell; failed reads say "Couldn't load X. Last good at HH:MM. Retry" instead of "not connected".
- **Copy pass**: sentence case for every heading and label; nouns for page titles; one label per destination ("Content Plan", "Create post"); no em dashes; "…" for loading; one voice (second person, plain, dry); remove taglines inside the product and the "AI-powered" line on the auth shell; "SOCIA's read" as the single label for interpretation.
- **Accessibility pass** as part of the primitives: real `tablist`/`tab`/`tabpanel` with arrow keys, `combobox` on search, one keyboard model for menus (base-ui), focus trap and restore in drawers and dialogs, visible-on-focus for anything that was hover-only, reasons as text not `title`, inline confirm instead of `window.confirm`, charts with one focusable summary plus a data table, labels bound to inputs.
- **Mobile as its own composition** (section 10 of the brief, phase 9 here): one 48px top bar with title, menu sheet and one action; KPI strips as 2-column grids with an even count; tables as two-line rows below 640px; the calendar month view as a list of days on phones; the composer's step strip as a scrollable chip row.

## 6. Homepage direction

**Mode:** Persuade. **Idea:** the product is the hero and the proof. **Headline:** "Know what to do next." (five words; passes two lines at every width). **Supporting line:** one honest sentence on who and what: "SOCIA reads your Instagram, Facebook, YouTube and TikTok numbers, then tells you what to post, when, and why. For creators and the businesses they work with." **Action:** "Start free" as the one cobalt button; "See how it works" as a text link. One primary per screen.

**Ground:** white, not the navy starfield. Navy appears once, as a full-width inverted section mid-page (the one planned exception), and the page ends on a quiet line, not a link-column footer.

**Sections, as claims with their proof** (the order of the argument, not the stock order):
1. *It tells you what to do next* → the real Dashboard title row with its Next line and Today card, built from the real components with sample data labelled "Example account".
2. *It reads your real numbers from four platforms* → the Analytics KPI strip and one chart, with an honest cell visible ("Reach — Not returned by Instagram for this period"): the honesty rule shown, not claimed.
3. *It tells you why* → one evidence block (Observed / Interpretation / Recommendation) from a post drawer.
4. *It helps you make the post* → the composer's destination picker and readiness list.
5. *It learns what happened* → the plan → publish → result loop as one strip (the real `OutcomeTags`).
6. *Who it is for* → two example contexts, a creator and a business, each as one real screen fragment, labelled as examples. No named customers.
7. *What it costs* → the three plans as a plain table (no "most popular" badge), the 7-day trial stated once.
8. *Questions* → the FAQ as plain rows.
9. *Close* → "Know what to do next." repeated on navy, one button.

**Removed:** the eyebrow labels, the numbered section labels, the sticky numbered side index, all scroll reveals (content is in place on first paint), the mock dashboard with invented "+24%", the six invented logos and four invented stats, the cursor labels, the "AI SOCIAL INTELLIGENCE" / "INTELLIGENCE ENGINE" vocabulary. The current eight statement headlines reduce to one heading per section, two to five words each.

**Pricing page** follows the same system (it already carries the right headline). **Login / signup / forgot / reset** become one quiet centred card on the ground, the form at 32px controls, no brand panel with taglines; the "Magic link" button becomes "Email me a sign-in link".

## 7. App direction

**Mode:** Operate, 80% professional tool / 15% intelligent interaction / 5% polish, exactly as the brief puts it.

- **Every screen has one h1 noun at 24px, one Next line, one primary action.** Title row: title left, freshness stamp ("Updated 4 min ago" with refresh) and the one action right; the date range and workspace scope in the row below, left-aligned; nothing else in the header.
- **Dashboard** answers "What should I do today?". Biggest block: Today (what is due, what needs a reply, what to post), then one KPI strip (four cells, one container, hairline-divided), one chart with KPI cells as its series tabs, then Platform snapshot as a table (platform mark, handle, posts, followers, engagement, dash-with-reason), Upcoming as a capped list with "View all". The Repurpose and Roundup entries stay as rows in Today, not cards. The three dashboards collapse to one component with the connect state as a row, not a wall.
- **Analytics** gets one header (the duplicate h1 goes), platform tabs as underline tabs on a full-width rule, section tabs inside as a segmented control, and nothing else nested. KPI cells select the chart. Platform caveats as the honest cell and a small ⓘ with text, not `title`.
- **Competitors** keeps its provenance model and its drawers; loses the intel strip, the staggers, the glows, the micro-labels and two of its three recommendation surfaces (one "Next move" block remains). The roster becomes a table with the honest cell where chips showed "—".
- **Content Plan** becomes a document view: the plan as a table of posts (day, time with its source, format, hook, status), the brief as a collapsed section, Generate as the one action. The empty state is one sentence and the action; loading is a flat skeleton of the table.
- **Calendar** keeps its week and month grids but flattens them: 1px day lines, weekends one tone step darker, today as a 1px cobalt line, 20 to 24px event bars with a status mark per kind (draft dashed, scheduled outline, published filled, failed negative), the best-window estimate shown once, as a shaded band with its source and sample ("est. from 14 posts"). The legacy single-platform composer modal is removed once Create post can load a row without destinations (legacy Instagram posts and the drafts Studio and the plan modal still create through `/api/schedule`); until that is verified in phase 5 the modal keeps working and only takes the new skin.
- **Create post** keeps its contracts and rail; the section "journey" chrome, springs and rises go; three mark systems become one; readiness shows "3 of 5 checks pass" and the list, not a percentage.
- **Content Studio** keeps its analysis but shows it as one scrolling document with sentence-case section headings instead of seven stacked cards, the score as "72 of 100, SOCIA's read" with the basis one click away, and a single toast primitive.
- **Settings** becomes scope groups (Account · Workspace and brand · Connections · AI and assistants · Plan and usage) with each group a URL, rows of label / current value / one action, one save model per view, destructive actions last in their own section with inline confirm.
- **Comments, Reports, Weekly roundup** adopt the shared header, table and KPI primitives and lose their private button classes.
- **Onboarding** keeps its steps but on the ground, with real controls, honest waiting states and the fabricated plan removed.
- **States:** loading as flat grey bars at the final layout's real sizes, no shimmer; empty keeps the frame and header plus one sentence and one action; error inside the failed block with the last good time and Retry; plan-gated stays visible with one marker and one quantified sheet.

## 8. Navigation direction

- **Shell archetype: open plane.** The sidebar sits on the page ground, separated by a 1px hairline, 232px wide, labelled, 34px rows with 16px lucide icons. The dark navy sidebar on a light canvas goes; in dark mode the whole shell is one ground.
- **Top of the sidebar:** the SOCIA mark and name, then the workspace switcher (the scope), as the library's references do. **Bottom:** Settings, Help, then the account row (name, plan name, appearance). The upgrade card becomes one quiet row with the plan and a text link.
- **Groups instead of ten flat items:** *Understand* (Dashboard, Analytics, Competitors, Weekly roundup, Reports) and *Make* (Content Plan, Create post, Calendar, Content Studio, Comments), with 12px sentence-case grey group labels. Hrefs unchanged. Counts appear only on queues that need action (Comments, Calendar approvals), with the noun clear.
- **Active state:** a neutral grey pill with cobalt text; no left bar, no tinted fill.
- **Social accounts** move out of the sidebar into the workspace switcher's panel and Settings → Connections; the sidebar stops being a status board.
- **Top bar: 48px**, kept because it holds real things: search (⌘K, 32px, centred, becomes a command menu over pages, posts and actions: Create post, Ask SOCIA, Switch workspace, Connect), the Ask SOCIA button (brand mark, no sparkle), the bell, the account menu. Unavailable commands are dimmed with a reason, not hidden.
- **Phone:** one 48px top bar with the page title, a menu button opening a full-screen sheet (nav groups, workspace switcher, account) and at most one action. No second sticky strip. Tabs scroll inside their own row.

## 9. Component and design-system changes

**Where it lives:** `app/styles/tokens.css` (colour, type, space on a 4px base, radius, motion, z-index), `app/styles/base.css` (reset, focus ring, selection, scrollbar, `::placeholder`, tabular numerals), `app/styles/primitives.css`, `app/styles/shell.css`, then `app/(app)/<page>/<page>.css` kept small. `components/system/` holds the React primitives; `components/ui` (base-ui + cva) is kept as the accessible foundation for Menu, Popover, Dialog, Tabs, Select, Tooltip and Toast so there is one keyboard model, and its classes are the system's, not Tailwind utilities in JSX.

**The primitives, one each:**
`Button` (primary / secondary / ghost / danger, one height, icon slot) · `IconButton` · `SegmentedControl` (role from a prop: tabs or radiogroup) · `Tabs` (underline, arrow keys, panels) · `Chip` and `StatusPill` · `KpiStrip` and `KpiCell` (label over value, delta in words, honest cell) · `Card` with `CardHeader` (title, optional period, optional action) · `Table` (sentence-case headers, numeric right-aligned, two-line rows on phones) · `Field` (label bound to input, hint, error) · `Menu`, `Popover`, `Tooltip` · `Drawer`, `Dialog` (focus trap, restore) · `Toast` (one, transitions not keyframes) · `Empty` (frame, sentence, action) · `Skeleton` (flat bars at real size) · `Unavailable` (the honest cell) · `PlatformMark` · `PageTitle` (title, Next line, freshness, action) · `Chart` helpers wrapping the existing SVG charts with the new rules (one hue, straight lines, 3 to 5 gridlines, no animation).

**Rules enforced by a test** (`lib/designBudget.test.ts` reads the compiled CSS): at most 8 font sizes, 3 weights, 5 radii, 4 durations, 0 gradients outside `print`, 0 `backdrop-filter`, 0 `filter: drop-shadow` on data, 0 `@keyframes` outside the spinner and the toast, 0 em dashes in `components/**` and `app/**` user-facing strings. The test fails the build when the system drifts.

**Deleted:** the families and files listed in §5, `components/ui.tsx`, `ov/MiniArea.tsx`, `ProfileForm.tsx`, `SyncCinematic.tsx` (replaced by a progress list), the legacy composer modal in `CalendarBoard.tsx`, three of the four platform-mark sets, four of the five spinners, duplicate `STATUS` maps and formatters (one `fmtNum`, one `relTime`, one `formatDate` with `timeZone` always set).

## 10. Implementation order

Each phase is one PR behind a "merge it" gate, verified live in the browser at 1440 and 375 before it is called done, with fixture pages under `app/(app)/zz-*` for state coverage (deleted before commit). Nothing in `lib/*`, `app/api/*` or the routes changes.

| Phase | Scope | Notes |
|---|---|---|
| 1 | **Tokens + base + primitives + budget test** | New `app/styles/*`, `components/system/*`, the test. Nothing visible changes yet except focus ring, selection and the fixture page that shows every primitive in every state, light and dark. |
| 2 | **Shell + navigation** | Open-plane sidebar with groups, 48px top bar, command menu, phone sheet; social accounts move to the switcher panel. Delete the four shell generations and both phone blocks. |
| 3 | **Dashboard** | One dashboard component, Today in the title row, KPI strip, chart, platform table, upcoming list; SyncCinematic replaced; connect wall becomes a row. |
| 4 | **Analytics + Reports + Weekly roundup** | One header, tab tiers, KPI cells as series tabs, honest cells, charts to the new rules. Delete `an2/an3/yta/db2/dsh` dead rules. |
| 5 | **Calendar + Create post + Comments** | Flat grids, one composer, one mark set, readiness as checks, one toast. Delete `cal`, legacy modal, `cp-` chrome. |
| 6 | **Competitors + Content Plan + Ask SOCIA** | Roster table, one recommendation block, plan as a document, drawer skin. Delete `cx` dead rules, `cp2/cp3`, `nt2*/nd`, `ch2/chat*`, `cpl` v1. |
| 7 | **Content Studio** | Document layout, score copy, builder tabs with real roles. Delete `st`/`cb` collisions by renaming to one prefix. |
| 8 | **Settings + Onboarding + auth pages** | Scope groups as URLs, rows, inline confirm, bound labels; onboarding without the fake plan and the aurora; quiet auth card. Delete `st2/st3/onb/settings/ProfileForm`. |
| 9 | **Homepage + pricing** | Sections as claims with real fragments, white ground, one inverted section, Inter display, no reveals, no invented proof. Delete `so-` (595 rules) and the Geist import. |
| 10 | **Mobile pass** | Every screen at 375 and 768: one top bar, 2-column KPIs, two-line table rows, calendar list view, composer chips, 44px targets, 0px overflow measured. |
| 11 | **Consistency pass** | Run the budget test, the taste-skill style counts and the copy lint over the whole app; fix the stragglers; globals.css below 3,000 lines; update `reference/socia-baseline.md` and the library's decision log. |

Phases 3 to 8 can be split if a PR grows past review size; phases 1 and 2 must land first because everything else depends on them.

---

## Decisions needed before phase 1 starts

1. **Cobalt replaces purple as the action colour** across the app (the brief's palette implies it; this changes every primary button, link, focus ring and the sidebar active state). Confirm.
2. **The sidebar moves onto the page ground** (light in light mode, navy ground in dark mode) instead of staying dark navy in both themes. Confirm.
3. **The homepage turns light** (white ground, one navy section) and **Inter replaces Geist** so one typeface runs the whole product. Confirm, or keep a display face for marketing only.
4. **Honesty fixes that change behaviour:** the onboarding fabricated plan is removed, the Settings preview competitors are removed, X and LinkedIn lose their connect controls, the Content Plan health score shows its basis or is dropped from the card. Confirm each.
5. **Navigation groups** (Understand / Make) and **social accounts leaving the sidebar**. Confirm.
6. **Dead-CSS deletion** of the redirected routes' styles (`/niche`, `/chat`, `/plan`, `/scorer`) and the orphan components. Confirm.
