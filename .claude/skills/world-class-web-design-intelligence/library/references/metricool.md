# Metricool

- **URL(s):** https://metricool.com/ (home, /metricoolanalytics/, /planner/, /competitors/, /social-media-inbox/, /reports/, /ai-social-media-post-generator/, /socialmedia-smartlinks/, /metricool-mcp-claude/, /pricing/), https://help.metricool.com/ (6 articles with real app screenshots), https://app.metricool.com/login (looked at only)
- **Category:** SaaS, social media analytics + planning. Direct competitor to SOCIA.
- **Studied:** 2026-10-19
- **Tags:** ANALYTICS, CHARTS, CALENDAR, EDITOR, AI-INTERACTION, PRICING, BILLING, TABLES, FORMS, INTEGRATIONS, EMPTY-STATES, MICROINTERACTIONS, MOBILE, NAVIGATION, ICONS

## Coverage
| Area | Inspected? | How | Notes |
|---|---|---|---|
| Marketing pages | yes | browser 1440px desktop; 375px mobile for home and pricing | Home, Analytics, Planner, Competitors, Inbox, Reports, AI assistant, SmartLinks, MCP. Cookie banner: "Reject" chosen. |
| Pricing | yes | browser desktop + mobile | Plan cards, annual/monthly toggle, sticky comparison table, tooltips, mobile accordion. |
| Product app screens | partly | marketing composites + help-center screenshots and one GIF; no account | App needs login (app.metricool.com/login, not used). Real screens seen via help center: calendar toolbar, calendar overflow menu, best-times heatmap (GIF frames), analytics date picker, period controls, Community growth chart, chart/table toggle, post-list toolbar, connection dashboard, an older analytics sidebar. Marketing composites (planner, analytics summary, competitors list, composer, inbox, AI generator, SmartLinks editor, report builder) are marked "marketing imagery" and may differ from the real app. |
| App design system | partly | extract-styles on the login page (app tokens load app-wide) | Vuetify 3 theme tokens, Nunito Sans, Font Awesome 6 Pro. |
| States (hover, menus, focus) | partly | browser | Mega menu, feature tabs, pricing tooltips, billing toggle, mobile menu, keyboard focus. App hover, loading, empty and error states not seen. |
| Motion | partly | measured CSS transitions on 3 pages | No app motion observed live. |
| Theme | checked | CSS media rules | No dark mode on marketing (only a plugin rule). App dark mode unknown. |

**Gaps Noah's screenshots would fill:** the real Analytics Summary with some networks unconnected (does it show 0, "—" or hide?), the composer with per-network editing and preview, the calendar month view and post hover card, what happens in-app at a plan limit (21st post on Free, 6th competitor, AI credits at 0), the AI text generator with its credits counter, a brand-new empty brand, and the mobile app.

## Measured system
- **Type (marketing):** Plus Jakarta Sans 400/500/600/700 with Bodoni Moda italic spans for emphasis inside headlines [measured]. Home scale 16 ×29, 20 ×17, 18 ×12, 33 ×10, 22.7 ×7, 56 ×6, 44 ×4, 14 ×3. Pricing scale 16 ×320, 14 ×86, 18, 24, 32, h1 500 64/76.8 [measured]. Weight 400 dominates (×393 on pricing). No label letter-spacing. The homepage hero headline is a `<p>` at 500 56px and the `<h1>` is the 22.7px subline [measured].
- **Type (app):** Nunito Sans (variable 200–900); labels 14/20 above inputs, inputs 16/24 [measured on login]. Help-center screenshots show tabular-looking but not explicitly tabular figures [observed].
- **Colour (marketing):** one deep aubergine ink `#2D1A29` for text, primary fills and 1px outlines; lime `#E7FF56` as text on dark CTAs and as highlight bands; pale blue `#D5F0FE` for the featured plan and active tab; pink, blue `#596CF2` and stripes as decoration [measured].
- **Colour (app):** Vuetify tokens: `primary` 45,26,41 (aubergine) with `on-primary` 231,255,86 (lime text on dark buttons); `background` 235,238,239 (cool grey); `info` `#596CF2`; `success` `#50C878`; `error` `#FA5053`; `warning` `#D97706`; `tertiary` `#798B95`. Full numeric ramps `--mc-deeppurple-50…900`, `--mc-yellow-50…900`, `--mc-pink-50…600` [measured]. Charts use per-network or per-metric pastel series colours [observed in help screenshots].
- **Shape:** marketing radius 16px (buttons, feature cards ×26), 20px (plan cards), 99px (tabs, billing toggle). Zero box-shadows on home and pricing; surfaces separated by 1px `#2D1A29` outlines or flat fills [measured]. App: 8px (inputs, ×9), 16px and 24px (cards); one soft shadow `0 4px 10px rgba(0,0,0,.05)` [measured].
- **Spacing and density:** pricing comparison rows 81px tall with 30px padding, grid drawn by 1px gaps over `#E7E7E7` [measured]. Plan card padding 22px [measured]. App input 40px tall [measured]. Calendar post cards in the real app are narrow (several fit side by side in one hour slot) [observed].
- **Motion:** marketing `all 0.3s ease` ×54, buttons `all 0.6s ease-in-out` ×15, one `transform 0.8s cubic-bezier(0.25,1,0.5,1)`; no keyframe animations; no reduced-motion handling [measured]. App: Material standard curve `cubic-bezier(0.4,0,0.2,1)` at 0.28s (buttons), 0.25s, 0.15s; Vuetify state opacities hover .04, focus .12, pressed .12, disabled .38 [measured].
- **Icons:** marketing feature icons 20px, stroke 2 SVG; pricing uses 20px image checkmarks (×344) and 14px ⓘ tooltip icons (×32) [measured]. App uses Font Awesome 6 Pro and Brands [measured]. Calendar cards carry two icons: network + post format (grid = Post, play-square = Reel, dashed-plus circle = Story) [observed in help docs].
- **Focus:** browser default outline (`auto 1px`) on marketing [measured].

## Strongest design qualities
1. **The recommendation is drawn where the decision is made.** "Best times" shades the calendar's own hour slots (darker = better) for one chosen network, with an optional percentage-per-slot toggle [observed in help GIF and screenshot]. **Why it works:** spatial co-location removes the translate-and-remember step between an insight on one screen and an action on another; luminance is read pre-attentively, so the eye finds the dark slot before reading anything. **For SOCIA:** strong fit for the Calendar week view and the composer's time picker, using SOCIA's existing `lib/postingTimes` windows. SOCIA must add what Metricool doesn't visibly do: say where the shading comes from. Metricool's help center admits that without personal data (Instagram not linked through Facebook, Facebook connected after Sep 2024) it shows estimates from general behaviour studies; whether the UI labels this is unverified [observed in help docs / UI unknown].
2. **One card is the value, the legend key and the series toggle.** In the real Community chart, the result cards are filled with the series colour; clicking one hides or shows that series, and a hidden one fades [observed in help screenshot + docs]. **Why it works:** it removes the separate legend lookup and makes filtering direct manipulation on the thing you're already reading; the faded state keeps the number visible so nothing looks deleted. **For SOCIA:** Analytics KPI tiles above charts (AnalyticsV3, Facebook, YouTube views).
3. **Output overlaid on outcome.** The Community chart draws the followers line over daily stacked bars of posts, reels and stories [observed in help screenshot]. **Why it works:** juxtaposition invites a causal reading ("I posted a reel, followers moved") without the product claiming causation. **For SOCIA:** Analytics growth chart and the plan loop's "what happened after you posted". Fix their flaws when adapting: the bars have no labelled scale and the follower axis is truncated (136.8K–137.1K), which exaggerates growth [observed].
4. **Comparison follows one stated rule and is absent rather than invented.** Every arrow and % compares against the previous period of equal length; when that history doesn't exist, no percentage is shown; hovering a metric shows the absolute change and the % [observed in help docs]. **Why it works:** a single rule is learnable, and omission avoids fake precision. **For SOCIA:** matches the "—, never 0" rule; adopt the hover that shows absolute delta plus the compared date range.
5. **Plan limits are chunked, scoped and metered in named units.** Cards are cumulative ("everything in X, plus"); the comparison table has category anchor tabs and a sticky CTA row; a limit that differs by platform carries tiny platform icons under its row label (competitors: 5/100 for FB, IG, Twitch, Bluesky; 10 for YouTube; X via add-on); AI is stated as credits "per brand/month", and each AI feature says whether it uses credits or is included [observed]. **Why it works:** chunking keeps a 100-row table navigable, scoping icons answer "on which platform?" at the row, and naming the unit makes cost predictable. **For SOCIA:** /pricing, Settings plan and billing, every `upgradeFor` CTA, and the AI cost model (which features consume metered AI).
6. **Per-network divergence is disclosed only when needed.** In the composer imagery, each selected network icon has its own format chip (e.g. REEL ▾, SHORT ▾) inline in the network row; one shared caption by default; an "edit by network" control splits it; per-network presets sit collapsed below [observed in marketing imagery]. **Why it works:** progressive disclosure: the common case (same post everywhere) stays one field, and format is chosen at the exact point the network is chosen. **For SOCIA:** Create Post composer. SOCIA already splits master content from per-platform tabs; the transferable part is choosing the format inline in the destination row.
7. **AI refinement is a bounded menu, not a blank prompt.** After generating, the AI panel swaps its input form for one-click transforms (translate, add CTA, add hashtags, lengthen, shorten, change tone, add emojis, correct, optimise for network, change structure), scoped to the last output; the panel header shows remaining credits [observed in marketing imagery]. **Why it works:** recognition over recall, predictable outcomes, and the cost is visible before acting. **For SOCIA:** Generate Caption and AI comment replies; SOCIA keeps its claim checker and verified-context rules on every transform.

## Best components
- **Date range picker** [observed in help screenshot]: control labelled "Main period", dual-month calendar with a filled range band, selected end dark, and a presets column (Yesterday … Last 12 months) with the active preset highlighted. A second labelled control, "Comparison period", sits beside it.
- **Calendar toolbar** [observed in help screenshot]: sub-tabs (Calendar, List, Posts library, Autolists, Flows + "New" badge), the active time zone shown at the right of the tab row, then search, "This week", ‹ range ›, filter, overflow, Best times (with the chosen network's icon), gallery, "Create view". The overflow menu groups zoom, view, social calendars, CSV import/export, feed preview and notifications.
- **Calendar status set** [observed in help docs]: Pending, Draft, Published, Sent (manual-publish notification sent), With errors, From autolist, and Published with warnings (published but missing something, e.g. a collaborator).
- **List toolbar** [observed in help screenshot]: wide search, Columns, Download CSV, and "Add to dashboard" disabled until rows are selected (row checkboxes).
- **Per-block chart/table toggle** [observed in help screenshot]: "View table" / "View chart" with icon at the block's top right.
- **Competitor list with inline expansion** [observed in marketing imagery]: one row per account with tiny labels above values (followers, posts, reels, likes, comments, engagement); a row expands in place into KPI chips and a trend chart.
- **Saved-replies picker** [observed in marketing imagery]: searchable popover anchored to the reply box, each item a title + preview line.
- **Report builder** [observed in marketing imagery]: one compact form: period, language, template + "New template", then one row per network with a toggle, "Sort by" and "Max rows", ending in Generate PDF / Generate PPT and previous downloads.
- **Connection dashboard** [observed in help screenshot]: "Brands 1 of 15" usage counter next to "+ ADD", a "What's a brand?" explainer inset at the top, and TikTok split into personal and business connect buttons up front.

## Best interactions
- **Drag-to-reschedule with explicit rules** [observed in help docs]: only Pending or Draft posts, only to future slots, autolist posts excluded, and gated by role (Analyst is read-only). Error prevention through constraints rather than after-the-fact errors.
- **Billing toggle** swaps all prices in place (annual $20/$53, monthly $25/$67) [observed].
- **Row-label ⓘ tooltips** hold per-platform caveats in the comparison table (e.g. YouTube on Free: 10 videos/month) [observed]. Useful idea, poor execution: the tooltip is very narrow and wraps to many lines.
- **Feature showcase tabs** on the homepage swap the product image per module (Planner, Analytics, Reporting…) [observed].
- **Login "Access" button** stays disabled until fields are filled [observed].

## Best UX patterns
- **Exploration vs deliverable split:** help docs state Analytics is for day-to-day exploration and Reporting is for PDFs, PPTs and saved dashboards [observed in help docs]. A clear mental model, although it later fragments (see Weaknesses).
- **Three depths of the same data, named by persona** [observed]: plain-language explanation of each metric with a suggested action ("for those who avoid data"), roles and sharing (teams), CSV and Data Studio (spreadsheet lovers). **Why it works:** it lets one product serve novices and analysts without one compromised screen. **For SOCIA:** every metric gets a plain-language "what this means / what to do" line; exports stay one click away.
- **Usage counter at the point of action** ("Brands 1 of 15") [observed in help screenshot]: the limit is visible where you're about to hit it.
- **Concept explainer where the concept bites** ("What's a brand?" inset on the connections page) [observed].
- **Limits in a three-column help table** (Feature / On Free ✅❌⚠️ / Limit or notes) [observed in help docs]. Clearer than their own pricing page.
- **MCP transparency** [observed]: the MCP page lists every tool with a one-line description and leads with example questions in accordions. Trust comes from inspectability; examples teach capability.

## What makes it feel premium
- **A strict two-colour core:** one dark ink for text, outlines and primary fills, with a single bright accent used only as text on dark CTAs and as highlight bands. Few hues means every accent reads as intentional [measured].
- **Flat surfaces, no shadows**, separated by 1px dark outlines and consistent 16/20px radii. This reads like print, which gives the confidence [measured].
- **Real product UI as hero imagery** instead of abstract illustration, so the claim and the evidence arrive together [observed].
- Where it isn't premium: rainbow wall of saturated brand-coloured CONNECT buttons, slow 0.6s ease-in-out button transitions, default focus outline, stripes and ribbons as decoration [observed/measured].

## Weaknesses
- **Contradictory limit copy:** the analytics page says "No limits" and the planner page says posting is unlimited, while Free is 20 posts/month, 30 days of history and watermarked analytics (help center) [observed]. User-count claims vary between 3M, 3.5M and 4M across pages [observed].
- **Zero conflated with missing:** the analytics hero shows greyed network chips reading "0" for networks that look unconnected [observed in marketing imagery]. The real app hides any section with no data for the period, silently [observed in help docs]. Engagement shown as "0.61" with no unit [observed in marketing imagery].
- **Numbers that don't add up:** the homepage Summary composite shows a 1.27M total over network chips summing to about 2.13M [observed in marketing imagery].
- **Chart honesty:** truncated follower axis exaggerates small growth; bars with no scale; donut legend truncated ("Promoted (Vie…"); a donut with one 100% slice [observed in help screenshots].
- **Fragmented analytics:** changing the comparison period isn't possible in Analytics; it opens Metricool Studio in a new tab [observed in help docs]. Data lives across Analytics, Studio, Reports, Campaign Dashboards and Data Studio, with an Advanced Analytics add-on on top.
- **Best-time fallback:** generic estimates stand in for personal data on some connections; the help center explains it, UI labelling unverified [observed in help docs].
- **Pricing table friction:** the sticky header shows CTA buttons but not plan names or prices; the same long sentence repeats in every cell; three rows all named "Competitor Analysis" differ only by tiny icons; "Unlimited*" depends on a fair-use footnote; annual is the default and cards show only the monthly equivalent [observed].
- **Mobile:** the annual/monthly toggle breaks into a tall pill with "Monthly" dropped below; the comparison becomes one-plan-at-a-time accordions, so side-by-side comparison is lost; the hero product image is clipped [observed at 375px]. No horizontal scroll [measured].
- **Accessibility and semantics:** hero headline isn't the h1; default focus ring; no reduced-motion or dark-mode handling on marketing [measured].
- **Two systems:** marketing (Plus Jakarta Sans + Bodoni) and app (Nunito Sans + Font Awesome on Vuetify) don't share type [measured]. SOCIA has the same split.

## Where SOCIA can do better than Metricool
- **Label every recommendation's source and sample size** (best times, plans). Metricool explains its fallback only in the help center.
- **Never show 0 for unconnected or unknown, and never silently hide a section.** Show "—" plus the reason and the fix.
- **Keep comparison inside Analytics.** No separate tool or tab for "vs previous period" or "vs custom range".
- **State limits once and consistently.** Marketing, pricing, help and in-app upgrade prompts all say the same number. Their help-center table format is the model, not their pricing page.
- **Make AI explain, not just write.** Metricool's assistant is a text generator with transforms; SOCIA's plan loop and verified-context captions are the differentiator. Keep that visible in the UI.

## Patterns relevant to SOCIA
| Pattern | Tag | SOCIA screen | Adaptation idea |
|---|---|---|---|
| Best-times heat painted into calendar slots, per network, optional % | CALENDAR, CHARTS | Calendar (CalendarBoard week view), composer time picker | Tint empty slots in 3 `--primary-subtle` steps from `lib/postingTimes` windows; a caption gives the source and sample size ("from your last 42 posts"); no tint plus a reason when data is insufficient; never generic data presented as personal. |
| KPI card = legend = series toggle | ANALYTICS, CHARTS, MICROINTERACTIONS | Analytics (AnalyticsV3, FB, YouTube) | Small series swatch in each tile; click toggles the series (`aria-pressed`); off state mutes the tile but keeps the value; 0.15s colour transition with SOCIA easing. |
| Posts published shown under the audience line | CHARTS, ANALYTICS | Analytics growth chart, plan loop results | Thin neutral bars in a bottom band with count labels; the follower axis either starts at zero or is marked as truncated. |
| % change only with an equal prior period; hover shows absolute delta | ANALYTICS, EMPTY-STATES | Analytics tiles, Dashboard | Keep "—" when there's no prior period; tooltip shows "+212 vs 21 Sep–20 Oct". |
| Format chip per network in the network row; shared caption with opt-in split | EDITOR | Create Post composer (DestinationPicker, MasterContent, PlatformTabs) | SOCIA already has master content + platform tabs + PreviewRail; the new piece is a Post/Reel/Story/Short chip inline beside each selected destination, so format is chosen where the platform is chosen. |
| Bounded AI transforms after generation, usage visible | AI-INTERACTION | Generate Caption, Comments AI replies | One-click chips (shorter, add CTA, tone, translate) on the latest draft; remaining AI usage shown only where the plan meters it; claim checker reruns on each transform. |
| Saved replies + suggestions in one anchored, searchable picker | AI-INTERACTION, FORMS | Comments | Anchor to the reply box; saved replies and AI suggestions in one list with a type badge. |
| Competitor row expands in place into KPIs + trend | TABLES, ANALYTICS | Competitors | Keep column alignment while expanded; units on every metric (engagement as %). |
| Per-platform scope icons on a limit row; "uses AI / included" wording; one limits table | PRICING, BILLING | /pricing, Settings plan and billing, `upgradeFor` CTAs | Lucide-sized platform glyphs under row labels; plan names and prices in the sticky header (their gap); one source of truth for limits. |
| Usage counter where the limit is hit ("1 of 3 brands") | BILLING, SETTINGS | Workspace switcher, Settings brands | Counter beside "Add brand"; at the cap the button shows the upgrade reason instead of failing. |
| Status taxonomy incl. "published with warnings" | CALENDAR | Calendar post cards, approvals | Warning state for partial success (collaborator dropped, trial reel params ignored), with the reason on hover. |
| Drag-reschedule constraints by status, time and role | CALENDAR | Calendar + approvals | Disallowed drops snap back with an inline reason (past slot, already published, Member needs approval). |
| Labelled "Main period" picker with presets column + dual month | FORMS, ANALYTICS | Analytics, Reports | Presets on the right, range band fill, comparison shown as text under the control. |
| Chart/table toggle per block; Columns + CSV on lists | TABLES, CHARTS | Analytics post lists, Reports | Toggle in the block header; CSV export of exactly what's shown. |
| Network + format double icon on calendar cards | ICONS, CALENDAR | Calendar cards | Lucide format glyph (12px) beside the platform mark; same size and stroke as other card icons. |
| Tool list with one-line descriptions + example questions | INTEGRATIONS, AI-INTERACTION | Settings › AI Assistants, /mcp | List SOCIA's tools with read-only or write badges and 4–6 example questions. |
| Account-type split at connect time + inline concept explainer | INTEGRATIONS, ONBOARDING | Settings connections, onboarding | Explain upfront what each account type unlocks (e.g. IG via Facebook vs Instagram Login); explainer inset where "brand/workspace" first matters. |
| Full-screen mobile menu with auth CTAs pinned to the thumb zone | MOBILE, NAVIGATION | sociaos.com marketing nav | Accordion groups, Login/Sign up fixed at the bottom. |

## Patterns NOT relevant to SOCIA
- **Ads campaign management, Hashtag Tracker ($25/day), Data Studio connector, white label, Twitch:** outside SOCIA's scope.
- **Brand-count price ladders inside each plan card:** SOCIA prices by plan tier, not by number of brands.
- **Job-grouped marketing mega menu:** marketing-site navigation; SOCIA's problem is in-app navigation.
- **Flows (comment-to-DM automation) and SmartLinks (link in bio):** not SOCIA features today. The SmartLinks split editor with live phone preview is a generic pattern SOCIA already has (composer PreviewRail).
- **Persona-named marketing sections:** the underlying "three depths" idea is relevant; the persona framing is marketing.

## Do not copy
- The aubergine `#2D1A29` + lime `#E7FF56` pairing, pink/blue stripes, ribbons and diagonal-bar graphics.
- Bodoni Moda italic emphasis inside sans headlines.
- The "∞∞" eyes logo, the robot assistant mascot, product-screenshot compositions and photography.
- Their copy and section headings, testimonial carousels, and plan names.
- The wall of saturated, all-caps brand-coloured connect buttons.
- Font Awesome icons: SOCIA stays on lucide-react.
