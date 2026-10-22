# What the library has learned

The synthesis across all references. "Show me what you've learned" reads from here. Update it whenever a principle recurs across references or one reference has an unusually strong solution.

**Library as of 2026-10-19:**
- **References:** 6 (Metricool, Apple, ElevenLabs, Framer, EnduroSat, Higgsfield).
- **Logged-in screens studied** (signed in by Noah, look-only): Metricool, ElevenLabs, Framer and Higgsfield.
- **Gaps remaining:**
  - Framer's project was empty, so its populated CMS and Analytics weren't seen.
  - Metricool had no posts, so its post cards weren't seen.
  - No live AI generation was watched in any product.

## Recurring principles

1. **Few weights; hierarchy comes from size steps and text-colour steps.**
   - **Evidence:**
     - Apple: 2 weights (400/600) across about 48 named roles.
     - ElevenLabs app: 400 and 500 used about equally.
     - Framer app: six named sizes and two weights (450/550).
     - Higgsfield app: 400–700 on a 10–24px scale.
     - Metricool app: 12–30px with light 30px KPI values.
     - EnduroSat configurator: 2 weights.
   - **Mechanism:** with weight held steady, each step in size or contrast reads as deliberate.
   - **SOCIA gap:** 8 weights and 10 sizes between 9 and 13.5px.
   - **Caution:** pure-400 titles scan weakly in dense lists.

2. **One accent, kept for the consequential action; the chrome stays neutral, so colour means data or state.**
   - **Evidence:**
     - Framer app: the accent fills exactly one button per screen (Publish / New project); every other button is neutral.
     - Apple: blue only on links, CTAs, selection and focus.
     - ElevenLabs: black actions; colour only in data.
     - Higgsfield: lime = spend/act; white = create.
     - EnduroSat: cyan = active.
     - Metricool: a strict two-colour core.
   - **SOCIA:** purple for action only. Go further: **at most one filled purple button per screen.**

3. **One control height and concentric radii (outer radius = inner radius + padding).**
   - **Evidence:**
     - Framer app: every control is 30px; menu 13px = item 8px + padding 5px.
     - The same growth-with-size rule shows in Apple, ElevenLabs, Higgsfield and the Metricool app (8px dominant, 16px banners).
   - **SOCIA gap:** loose 6/8/9/10/12/14px corners and mixed control heights.

4. **Elevation by fill steps and hairlines, not shadows.**
   - **Evidence:**
     - Framer app: a surface ladder from `#111` to `#303030`, with tiny shadows always paired with a 1px ring.
     - Apple, EnduroSat and the Metricool marketing site: no shadows.
     - Higgsfield: inset highlights.
     - ElevenLabs: 0.5px rings.

5. **Apps move faster than their marketing sites; motion uses a few named tokens.**
   - **Evidence:**
     - Framer app: 80ms menus, 150ms tooltips, no springs.
     - ElevenLabs app: 0.15s colour, 0.1s value fades.
     - Higgsfield app: 0.2s.
     - Apple: exits faster than entrances, no replay between menus.
     - Metricool's 0.28s is the slowest of the apps.
   - **Mechanism:** speed is respect for a tool used daily.
   - **SOCIA gap:** mixed 0.15/0.18/0.2/0.25s.

6. **Unknown is shown as unknown; empty is an instruction, never a fake.**
   - **Positive:**
     - Framer: a grey dash glyph for unknown usage, and empty views that name the missing prerequisite plus one existing control.
     - ElevenLabs: `--:--`, "—" in Assets, "No data has been collected" plus the metric's scope.
     - Apple: a dash plus screen-reader text.
     - EnduroSat: "—" until the input exists.
     - Metricool: connect pages that describe the future page.
   - **Negative:**
     - Metricool: unconnected networks vanish, blank boxes, zeros for unknown competitors.
     - ElevenLabs: **unlabelled fake example rows** in empty tables.
   - **SOCIA:** its rule is right. Add reason text for screen readers, never hide a section, never fake rows.

7. **Show the consequence, and the cost, at the point of decision, before the click.**
   - **Evidence:**
     - ElevenLabs app: "N credits / M credits" beside every generate button.
     - Higgsfield: the price on the button, updated live.
     - Framer app: a used/limit meter in the panel footer where the credits are spent.
     - Metricool: "N out of M posts this month" in the Planner.
     - Apple: a sticky running total.
     - EnduroSat: one slider recalculates everything.
   - **Mechanism:** this is where "futuristic" really comes from: cause and effect you can see.

8. **Progressive disclosure driven by the person's choice.**
   - **Evidence:**
     - Higgsfield: the model rewrites the form, confirmed signed in.
     - Apple: locked-but-visible steps.
     - EnduroSat: gated steps and summarised sections.
     - Metricool: per-network split.
     - ElevenLabs: settings collapse to "label … value".

9. **Translate abstract units into outcomes.**
   - **Evidence:**
     - ElevenLabs: credits → minutes; a "Credits used" card.
     - Higgsfield: credits → videos, money next to credits on the Usage page.
     - Metricool: named units per brand.
     - Framer: "Everything from Basic, with:".

10. **Tabular numbers for anything that changes or lines up.**
    - **Evidence:** the Framer app (usage, steppers), ElevenLabs (account balance, times).
    - **Weakness:** ElevenLabs' own KPI tiles and EnduroSat don't use them.

11. **The legend lives in the numbers, and KPI tiles select the chart.**
    - **Evidence:**
      - Metricool: the KPI card = legend = toggle, confirmed in the real app.
      - ElevenLabs usage analytics: KPI tiles switch a single chart.
      - EnduroSat: a colour dash in the KPI label.

12. **AI is scoped, explained, and never the only path.**
    - **Evidence:**
      - Framer: the agent placeholder changes per screen and inapplicable tools disappear; standing instructions live in Skills.
      - Metricool: AI Configuration with brand-wide and per-network instructions you can read and edit.
      - Framer: an audit is approved before any deletion.
      - ElevenLabs and Higgsfield: starters before input; results carry next steps.
    - **Weakness:** ElevenLabs' ⌘K makes an AI chat the default Enter target.

13. **Settings are rows of label, current value and one action, grouped by scope and deep-linkable.**
    - **Evidence:**
      - ElevenLabs settings rows.
      - Framer: scope groups, every tab a URL, Plans openable for one feature.
      - Metricool: a brand vs account divider.
      - Higgsfield: settings led by the workspace name.

14. **Paywalls are contextual, quantified and non-destructive.**
    - **Evidence:**
      - Metricool: gated controls stay visible with one marker; clicking opens "Unlock <tool>" with numbers for the lowest qualifying plan and "Maybe later".
      - Higgsfield: a sheet titled with the gated choice; closing it leaves the selection intact.
      - Framer: a deep link to Plans per feature.
    - **Weakness seen in all four apps:** upsell overload (stacked banners, toasts, modals, a watermark, "Upgrade now" in the canvas toolbar).

15. **One command menu (⌘K) that reaches every action and object.**
    - **Evidence:**
      - ElevenLabs: Quick actions plus Recent when empty; grouped, capped results.
      - Framer: grouped commands with shortcuts; unavailable commands dimmed, not hidden.

16. **Usage answered at three depths.**
    - **Evidence:**
      - Higgsfield: a 30-day mini chart with zero days as dots, summary tiles plus a share bar, and a ledger with filters in the column headers.
      - ElevenLabs: a balance ring on the avatar, a Balance card in the account menu, a usage analytics page.

## Standout solutions
- **Apple's configurator and Compare page:**
  - Configurator: locked visible steps, deltas, constraint summaries, a running total.
  - Compare: self-labelling cells that keep two columns on a phone.
- **EnduroSat's compressing progress bar:** finished steps shrink to marks, the current step expands.
- **ElevenLabs' prompt island:** each option shows its current value; the cost and the balance sit beside send.
- **Framer's app discipline:** one accent button per screen, one 30px control height, concentric radii, 80ms menus, empty states that name the prerequisite.
- **Metricool's real composer:**
  - A format chip per network.
  - A counter that names the network setting its limit.
  - Submit options with one-line consequences.
  - A preview that admits it's approximate.
- **Higgsfield's usage page** (three depths, money next to credits) and its **Info / Edit / Comments item viewer.**

## Corrections made after the logged-in study (2026-10-19)
- **Higgsfield:** "GENERATE —" was a signed-out loading artefact. Signed in, an incomplete form disables the button and drops the price.
- **Metricool:**
  - Unconnected networks are omitted, not shown as "0".
  - On Free, KPI cards show no change, and comparing periods is a paid tool.
  - The best-time shading couldn't be confirmed visually, and its source is never stated.
- **Framer:** the credit-tier select exists only on the marketing page. "1%" is the canvas zoom.
- **ElevenLabs app:** neutral greys, 500 and 400 weights, 8–12px radii, its own icons (not lucide), a large modal voice picker, and visible slider values.

## Where references disagree
- **Weights in dense UI:** 2 (Apple, Framer app) vs 4 (Higgsfield, Metricool). **For SOCIA:** 3.
- **Comparison tables on phones:** one plan at a time (Framer, ElevenLabs, Metricool) vs two self-labelling columns (Apple). **For SOCIA:** Apple's approach for real comparisons; one at a time is acceptable for the pricing table.
- **Motion:** slow and weighty (EnduroSat, Metricool's 0.28s) vs fast (the others). **For SOCIA:** fast.
- **Pills:** used for CTAs by Apple, ElevenLabs and Higgsfield. **For SOCIA:** pills only for chips, toggles and badges.
- **Hover-only menus:** Higgsfield opens the account menu on hover. **For SOCIA:** click to open; hover only as a preview.
- **Where the balance lives:** in the header chrome (ElevenLabs' ring) vs only in the account menu (Higgsfield). **For SOCIA:** the account menu, plus a meter at the point of use. A ring only if AI allowance becomes the main limit.

## Proposed improvements (not yet decided: each needs Noah's go-ahead and solves a stated problem)
| # | Problem in SOCIA today | Proposed approach | Sources |
|---|---|---|---|
| 1 | Hierarchy is muddy: 10 sizes within 4.5px, 8 weights | About 6 size tokens with tracking built in; 3 weights; hierarchy carried by the text-colour tokens. System-wide. | Apple, ElevenLabs, Framer, Higgsfield |
| 2 | Radii, control heights and durations drift | One control height (about 32px), concentric radii (outer = inner + padding), fast/base/slow duration tokens on SOCIA's existing curve, menus at about 100ms | Framer app, Apple, Higgsfield, ElevenLabs |
| 3 | Several filled purple buttons compete on some screens [to verify per screen] | At most one filled purple button per screen; others neutral | Framer app, Apple |
| 4 | The posting-time insight lives away from scheduling | Tint Calendar and composer time slots by SOCIA's best-time windows, **labelled with source and post count** (Metricool never says where its numbers come from) | Metricool (+ SOCIA's honesty rule) |
| 5 | Analytics needs a separate legend; deltas lack context; platform caveats get lost | KPI tiles select and toggle the chart; % only with an equal prior period plus a hover with the absolute change; platform tabs show connected / connect / plan-gated; caveats as ⓘ on the metric | Metricool, ElevenLabs, EnduroSat |
| 6 | The composer asks for everything at once | The format chip decides the fields; "label … value ›" settings with named defaults; a counter that names its binding platform; one-line consequences in the submit menu; a preview that states its limits | Metricool, Higgsfield, ElevenLabs, Apple |
| 7 | AI allowance and plan limits are abstract or found late | Allowance shown beside every metered action before the click; plan and allowance in the account menu; a contextual, quantified upgrade sheet with "Maybe later", deep-linked through `upgradeFor`; a Settings → Usage page (tiles, share by feature, ledger); one upgrade message at a time | ElevenLabs, Higgsfield, Metricool, Framer |
| 8 | Unknowns aren't announced; numbers jitter | Keep "—" with screen-reader reason text, never hide sections, never fake rows; `tabular-nums` on every metric | Apple, Framer, ElevenLabs |
| 9 | Settings is one long page | Scope groups (Account, Workspace and brand, Connections, Plan and usage); rows of label, value and one action; every tab a URL | ElevenLabs, Framer, Metricool |
| 10 | No fast way to reach actions and objects | A ⌘K menu: Create / Go to / Workspace / Recent, grouped and capped results, unavailable items dimmed with a reason, "Ask SOCIA" as a labelled option | ElevenLabs, Framer, Apple |

## Decisions for SOCIA
| Problem | Approach adopted | Sources | Why this one | How SOCIA adapted it | Date |
|---|---|---|---|---|---|
| Purple reads as the first wave of generated AI pages and the brief's palette is cobalt | Cobalt #2563FF is the one action colour; sky #60A5FA for coloured text on dark; chrome neutral | Framer app, Apple, taste-skill colour.md | One accent, kept for the action; matches the brand palette Noah set | `--primary` and its aliases remapped in `app/styles/tokens.css`; hex literals swept by hand | 2026-10-20 |
| A dark sidebar on a light canvas appears on 0 of 17 studied light screens | Sidebar on the page ground, 1px hairline, neutral active pill with accent text | taste-skill app-screens §3, Framer, ElevenLabs | Navigation recedes so colour can mean data or action | Phase 2 shell; dark theme shares one ground (#0F1115) | 2026-10-20 |
| Two type systems (Geist marketing, Inter app) and 50 font sizes | Inter only; app scale 12/14/16/20/24 at 400/500/600; marketing display by clamp | Apple, Framer, operate.md "one family" | Fewer steps make hierarchy legible; one face makes one product | `--fs-*` and `--fw-*` tokens; Geist import removed in phase 9 | 2026-10-20 |
| Fabricated onboarding plan, fake preview competitors, fake "Connected" rows, unsourced health score | Removed or given their basis; unknown shown as a dash with its reason | SOCIA's own rule; Framer and ElevenLabs empty states | Honesty is the product's differentiator against Metricool | `Unavailable` primitive; fixes land in phases 3, 6 and 8 | 2026-10-20 |
| Ten flat nav items and a sidebar used as a status board | Groups Understand / Make; social accounts move to the workspace switcher panel and Settings | ElevenLabs, Framer sidebars; cognitive-load ≤7 rule | A grouped list reads faster than ten peers | Phase 2 shell; hrefs unchanged | 2026-10-20 |
| About 3,000 lines of CSS for redirected routes and dead generations | Delete per page as it migrates; a budget test keeps the count down | overnight-polish prune method | Layering is how four shells happened | Phases 2 to 9; `lib/designBudget.test.ts` | 2026-10-20 |
| After phases 1 to 3 the app read as plain; Noah asked for ElevenLabs' look | Their measured system with SOCIA's identity: hue-less alpha-black chrome, near-black actions, cobalt for data only, ring-and-drop raised surfaces, six-layer floating shadow, concentric radii 6/8/12/16/24, two weights with jobs, 75ms colour changes; patterns: KPI tiles as chart tabs, tabs for sections vs segmented for units, labelled query bar, quiet empty states, dense rows | ElevenLabs study (app section), taste-skill "a kit, not a product" warning | Restraint repeated everywhere is what reads as premium; a clone would read as them, so the typeface, logo, icons, orb and copy were not taken | `app/styles/tokens.css`, `primitives.css`, `shell.css` retuned; `--primary` alias now means `--action`; radii budget 6 | 2026-10-21 |
