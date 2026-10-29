# SOCIA — Anti–AI-Slop Design Standard

**Version:** 1.1 · **Research date:** 2026-10-25 · **v1.1:** section 17 (additions) and section 18 (enforcement) added  
**Audience:** Claude Code, OpenDesign, frontend engineers, product designers, and design reviewers  
**Status:** Prescriptive design and QA guidance, not a claim that any visual pattern proves AI authorship.

> **Primary instruction to Claude:** Read this file before proposing, generating, or changing SOCIA's UI. Treat it as a design-quality constraint across the public website and authenticated application. Do not mechanically ban useful conventions: identify *unthinking defaults*, explain their impact, and replace them with product-specific design decisions. Preserve SOCIA's branding, functionality, data truth, security, and accessibility.

## 0. What the research actually shows

There is **no reliable visual test that proves a website was vibe-coded**. Humans use gradients, Inter, shadcn/ui, cards, and conventional SaaS layouts too. The problem is the *combination* of interchangeable structure, generic claims, decorative excess, missing states, inconsistent systems, and insufficient review. The [InterfaceKit analysis](https://blog.interfacekit.io/what-makes-a-website-look-ai-generated) frames the issue as generic, unresolved, and unreviewed design. [Nielsen Norman Group](https://www.nngroup.com/articles/ux-context-design/) argues that without product and user context, AI defaults to average designs. A [study of 832 websites](https://designpixil.com/blog/vibe-coded-apps-design-study) reports more common default markers among its Lovable sample than its YC comparison group, but explicitly notes it analyzed homepage code/styles rather than proving how any particular site was made. Treat such studies as directional, not universal.

**Use this document to make SOCIA better, not to disguise its development method.** An AI-assisted site with careful decisions can be excellent; a hand-coded site can be generic.

### Severity labels
- **P0 — Trust/quality failure:** fake content, broken interaction, inaccessible controls, inconsistent permission states, product-agnostic claims.
- **P1 — Strong template signal:** repeated stock layout, purposeless decoration, untouched library defaults, weak hierarchy.
- **P2 — Polish/craft issue:** inconsistent spacing, icon weight, motion, copy rhythm, edge-case handling.

A pattern can be acceptable when justified by the product. **Never replace a clear, usable design with novelty solely to avoid a cliché.**

---

## 1. Homepage and marketing-page clichés

**Watch for these combinations and replace them with content-driven composition.**

- [ ] **P1** Hero formula: eyebrow pill → centered 64–96px headline → gray subheading → two oversized buttons → dashboard mockup.
- [ ] **P1** Purple/blue gradient glow or radial orb behind the headline, unrelated to the product.
- [ ] **P1** Gradient-clipped headline with one arbitrary colored word.
- [ ] **P1** “Introducing,” “New,” “v2,” or “AI-powered” pill when nothing new is being announced.
- [ ] **P1** Hero content so vague it works unchanged after swapping the logo for a competitor.
- [ ] **P1** A feature grid forced into exactly three or six identical cards.
- [ ] **P1** Repeated alternating left-text/right-image sections with identical spacing and image treatment.
- [ ] **P1** Endless bento boxes used as a substitute for storytelling or prioritization.
- [ ] **P1** Logos under “Trusted by” without actual permission, customers, or evidence.
- [ ] **P0** Invented testimonials, logos, star ratings, case studies, user counts, growth percentages, or awards.
- [ ] **P1** Abstract 3D spheres, floating cubes, glowing lines, particle fields, decorative grids, or fake charts in place of the product.
- [ ] **P1** Every section centered even when comparisons, explanations, or data need left alignment.
- [ ] **P1** Excessively large empty bands between shallow sections.
- [ ] **P1** Identical visual weight for every feature regardless of importance.
- [ ] **P1** Default page sequence chosen automatically: hero → logo strip → 3 cards → testimonials → pricing → FAQ → CTA.
- [ ] **P2** Giant footer with four arbitrary columns, repeated links, and no information architecture.
- [ ] **P2** “01 / 02 / 03” section numbers on content that is not a sequence.
- [ ] **P2** Eyebrow labels and arrows on every single heading or CTA.
- [ ] **P2** A sticky announcement banner, animated ticker, or marquee with no useful announcement.
- [ ] **P2** Hover-driven spectacle that competes with the CTA or makes text harder to read.

**Better for SOCIA:** Lead with the real loop: **understand performance → find a credible opportunity → plan content → create/publish → learn**. Use real, permission-safe SOCIA screens and specific workflows. Give analytics, Content Studio, and publishing different visual treatments because they solve different jobs. Keep **“Know what to do next.”** as a product promise, not a license to fabricate outcomes.

---

## 2. Colors, backgrounds, surfaces, and decorative effects

- [ ] **P1** Unmotivated purple-to-blue, cyan-to-violet, or pink-to-orange gradients across every hero, button, chart, and card.
- [ ] **P1** Gradient text as the default heading treatment.
- [ ] **P1** Backdrop blur / frosted glass on every panel.
- [ ] **P1** Neon glows around cards, charts, buttons, and active navigation.
- [ ] **P1** Cursor-following light, magnetic glow, spotlight, or spotlight-following card border without a task benefit.
- [ ] **P1** Dark-mode charcoal surfaces differentiated only by nearly invisible gray values.
- [ ] **P0** Low-contrast body text, placeholder text, labels, charts, and disabled-looking active controls.
- [ ] **P1** Default library palette shipped unchanged with no brand adaptation.
- [ ] **P2** Inconsistent radii: some cards 8px, others 24px, random 9999px pills.
- [ ] **P2** Soft drop shadow on every element regardless of elevation or hierarchy.
- [ ] **P2** Borders, glows, shadows, and gradients all stacked on one component.
- [ ] **P2** Decorative noise/grain textures pasted over all surfaces without purpose.
- [ ] **P2** Same accent color used for neutral navigation, positive status, warnings, and destructive actions.
- [ ] **P2** Overly saturated multicolor icon tiles reminiscent of stock template features.
- [ ] **P2** Background grid, radial spotlight, or starfield used to make a plain form feel “futuristic.”

**SOCIA direction:** Charcoal/navy **#0F1115 / #0F172A**, cobalt **#2563FF**, sky **#60A5FA**, silver **#E8E9EC**, white, and semantic status colors. Blue is an intentional action/selection accent, not ambient wallpaper. Build a small, documented surface/border/text/interaction token system. A restrained gradient is allowed when it conveys hierarchy or belongs to a deliberate brand composition.

---

## 3. Typography and layout rhythm

- [ ] **P1** Default font selected only because the starter kit shipped it (Inter, Geist, Space Grotesk, etc.). These fonts are not intrinsically bad.
- [ ] **P1** One font weight and similar size used across headline, heading, label, body, and caption.
- [ ] **P1** Oversized hero text that pushes the actual product below the fold.
- [ ] **P1** Huge serif display type or italic serif word added solely to mimic a current design trend.
- [ ] **P2** ALL-CAPS, widely tracked labels above every section.
- [ ] **P2** Uniform line lengths, all text centered, or paragraphs too wide to scan.
- [ ] **P2** Random font-size jumps, line-height changes, and weight mismatches between routes.
- [ ] **P2** Arbitrary margins/padding instead of a deliberate spacing scale.
- [ ] **P2** Identical padding and vertical gaps for unrelated components.
- [ ] **P2** Too much empty space around dense operational tasks; too little around high-priority decisions.
- [ ] **P2** Repeated `max-w-7xl mx-auto` layouts on pages that need distinct content widths.
- [ ] **P2** Tiny, faint metadata paired with gigantic headlines, with no useful intermediate hierarchy.
- [ ] **P2** Artificially narrow columns and truncated labels despite available desktop space.
- [ ] **P2** Poor numerical typography: no alignment, tabular figures, units, or clear denominators.

**Better:** Define a purposeful type scale and responsive grid; use tabular numerals for analytics; reserve large typography for genuinely important content. Optimize scanning speed, not screenshot drama.

---

## 4. Cards, buttons, icons, and component-library defaults

- [ ] **P1** Every piece of content placed inside the same rounded rectangle.
- [ ] **P1** All cards share identical padding, radius, border, icon tile, and shadow regardless of function.
- [ ] **P1** Decorative icon in a pastel rounded square above every heading.
- [ ] **P1** Repeated sparkle, wand, lightning, rocket, brain, shield, or generic “AI” icons.
- [ ] **P1** Stock outline icons used without a consistent icon system or semantic need.
- [ ] **P1** Untouched shadcn/ui, Tailwind, or starter-kit components across every screen.
- [ ] **P2** Random mixtures of filled/outline icons and inconsistent stroke weights.
- [ ] **P2** Buttons all giant, pill-shaped, or all identical regardless of importance.
- [ ] **P2** Primary CTA used for several competing actions on the same screen.
- [ ] **P2** Arrow-right icons appended to every button, including actions that do not navigate.
- [ ] **P2** Generic “Learn more” links with no context or destination specificity.
- [ ] **P2** Excessive badges, chips, tags, and status pills that crowd content.
- [ ] **P2** Modal for every task when an inline editor or side panel would be simpler.
- [ ] **P2** Tooltips used to explain confusing labels instead of improving the labels.
- [ ] **P2** Hover-only access to critical actions; touch and keyboard users cannot discover them.
- [ ] **P2** Destructive actions styled like neutral or primary actions.

**Better:** Choose the right structure for the job: tables for repeated data, panels for editors, lists for activity, split views for comparisons, inline actions for common workflows. Keep one consistent icon family and define size/stroke/optical-alignment rules.

---

## 5. Interaction, animation, and “fake interactivity”

- [ ] **P0** Buttons that do nothing, lead to `#`, or show a fake success toast.
- [ ] **P0** Nonfunctional search, filters, tabs, pagination, dropdowns, or demo controls.
- [ ] **P0** Visual toggle that does not persist or accurately reflect server state.
- [ ] **P0** Misleading optimistic UI that claims a post published before confirmation.
- [ ] **P1** Every element fades/slides upward on scroll, including ordinary paragraphs.
- [ ] **P1** Arbitrary spring/bounce on professional controls.
- [ ] **P1** Hover scaling on every card and button, causing layout jitter.
- [ ] **P1** Excessive parallax, cursor followers, magnetic buttons, or 3D tilt.
- [ ] **P1** Animation that delays access to data or obscures changes.
- [ ] **P2** Missing pressed, focus, loading, disabled, selected, and success states.
- [ ] **P2** Inconsistent transition duration/easing across components.
- [ ] **P2** Drag-and-drop without keyboard/touch alternative where practical.
- [ ] **P2** Animated counters that imply live measurement when values are static.
- [ ] **P2** Toast for every small interaction, creating notification noise.
- [ ] **P2** Skeletons that don't match final layout, causing visible shifts.
- [ ] **P2** Missing `prefers-reduced-motion` support.
- [ ] **P2** Charts that animate theatrically but lack useful hover details or labels.

**Better:** Motion should communicate cause and effect: state changes, selection, progress, expansion, and completion. Prefer subtle microinteractions, consistent timing, keyboard access, and honest async states. Do not animate for the sake of looking “AI.”

---

## 6. Copywriting tells and stock phrases

**Flag these when vague, unsupported, or repeated—not as banned words in every context.**

### Generic verbs and claims
- [ ] **P1** “Unlock the power of …”
- [ ] **P1** “Supercharge your …”
- [ ] **P1** “Elevate your …”
- [ ] **P1** “Revolutionize / transform / disrupt …”
- [ ] **P1** “Leverage cutting-edge AI …”
- [ ] **P1** “Harness the power of …”
- [ ] **P1** “Streamline your workflow …” without showing what gets easier.
- [ ] **P1** “Seamless / effortless / frictionless …” without evidence.
- [ ] **P1** “All-in-one platform …” without saying what is included.
- [ ] **P1** “Next-generation / future of …” without a concrete difference.
- [ ] **P1** “Powerful insights / actionable intelligence …” without a specific example.
- [ ] **P1** “Everything you need to succeed …”
- [ ] **P1** “Built for teams of all sizes …” when target users are known.
- [ ] **P1** “Say goodbye to X, hello to Y.”
- [ ] **P1** “From chaos to clarity.”
- [ ] **P1** “Work smarter, not harder.”
- [ ] **P1** “Your ultimate [category] companion.”
- [ ] **P1** “One platform. Endless possibilities.”
- [ ] **P1** “Focus on what matters most.” with no product context.
- [ ] **P1** “AI-powered” repeated in every section instead of describing capability.
- [ ] **P2** “Delightful,” “beautiful,” “intuitive,” or “world-class” as unsupported self-praise.
- [ ] **P2** “Get Started” on every CTA even when the action is connect, review, plan, or publish.
- [ ] **P2** Exclamation marks, emojis, sparkle characters, or em dashes sprinkled everywhere as stylistic filler.
- [ ] **P2** Generic FAQs that don't answer actual objections.
- [ ] **P2** Empty-state jokes or faux-friendly copy that hides the next action.
- [ ] **P0** Fabricated claims of guaranteed growth, virality, AI accuracy, customer counts, or time savings.

### Copy substitution rule
**Bad:** “Leverage intelligent analytics to supercharge your social media.”  
**Better:** “See which posts outperformed your recent median, and what to try next.”  
**Bad:** “Seamlessly create engaging content with AI.”  
**Better:** “Upload clips. Review suggested cuts, captions, and a posting plan.”  
**Bad:** “Unlock powerful competitor intelligence.”  
**Better:** “Compare recent posting patterns with the competitors you follow.”

Use plain verbs, concrete objects, clear constraints, and verified outcomes. Distinguish *observed*, *calculated*, and *suggested*. Avoid causal language unsupported by data.

---

## 7. Fake data, fake proof, and misleading dashboards

- [ ] **P0** Made-up charts, fake activity feeds, synthetic follower counts, or invented insights presented as real.
- [ ] **P0** “+24.7%” without a defined metric, comparison window, or source.
- [ ] **P0** Treating unavailable API metrics as zero.
- [ ] **P0** Comparing incomparable platform metrics as if they share one definition.
- [ ] **P0** Claiming cause (“this hook caused growth”) from simple correlation.
- [ ] **P0** Posting recommendations without enough observations or disclosed uncertainty.
- [ ] **P0** Dummy competitor accounts or fake trend alerts in live product UI.
- [ ] **P0** Fake upload, analysis, render, or publishing progress.
- [ ] **P1** Decorative dashboard screenshot with unreadable numbers and no clear task.
- [ ] **P1** KPI cards repeated with no explanation of what changed or what to do next.
- [ ] **P1** Every chart drawn as the same smooth gradient line regardless of data semantics.
- [ ] **P2** No sample size, comparison baseline, time window, timezone, or source labeling.
- [ ] **P2** Unclear differences between lifetime totals, daily time series, and per-post publication-date totals.
- [ ] **P2** Trend arrows with no context or misleading green/red semantics.
- [ ] **P2** Insights buried under oversized illustrations or card chrome.

**SOCIA nonnegotiable:** Unavailable ≠ zero. Never fabricate. Use verified platform data and transparent calculations; label low confidence and limited sample sizes. A design can be beautiful while honestly saying “Not enough data yet.”

---

## 8. Product UX signs of an unfinished generated app

- [ ] **P0** Only the happy path was designed; failure, partial, loading, empty, and recovery states are absent.
- [ ] **P0** Permissions displayed in UI but not enforced by server.
- [ ] **P0** Paid feature appears unlocked in UI while backend rejects it, or vice versa.
- [ ] **P0** OAuth error state does not explain what happened or how to reconnect.
- [ ] **P0** User can schedule/publish without a clear destination, visibility, or confirmation.
- [ ] **P0** Data loss on refresh, navigation, upload failure, or modal close.
- [ ] **P1** Identical dashboard structure for unrelated platforms and workflows.
- [ ] **P1** “AI chat” bolted onto every page rather than contextual help at decision points.
- [ ] **P1** Excessive cards replacing a clear information architecture.
- [ ] **P1** Important actions hidden under vague three-dot menus.
- [ ] **P1** Forms request unnecessary information before delivering value.
- [ ] **P1** Onboarding tours, checklists, and confetti used in place of a clear first task.
- [ ] **P2** Inconsistent names for the same entity (brand, workspace, account, profile).
- [ ] **P2** Confusing back behavior, breadcrumbs, tabs, and navigation states.
- [ ] **P2** No sensible defaults, undo, draft save, or confirmation for consequential actions.
- [ ] **P2** Same empty-state illustration/message everywhere, regardless of the cause.
- [ ] **P2** Repetitive upgrade prompts that interrupt core free features.
- [ ] **P2** Dense forms with no grouping, labels, validation, or explanatory text.
- [ ] **P2** No clear distinction between draft, scheduled, publishing, published, failed, and cancelled.

**Better:** Map real user tasks and design every consequential state. Make the next action obvious, especially after a failure. Keep workspace, plan, and platform boundaries understandable.

---

## 9. Responsive, accessibility, and performance gaps

- [ ] **P0** Keyboard users cannot operate dialogs, menus, tabs, or file upload controls.
- [ ] **P0** Focus disappears or becomes trapped incorrectly.
- [ ] **P0** Missing accessible names for icon-only buttons.
- [ ] **P0** Form errors not associated with their fields.
- [ ] **P0** Color alone communicates status or chart series.
- [ ] **P0** Text contrast below WCAG AA where applicable.
- [ ] **P1** Mobile design merely stacks desktop cards into a long vertical wall.
- [ ] **P1** Horizontal overflow, clipped modals, offscreen buttons, or unusable dense tables.
- [ ] **P1** Desktop hover is the only way to reveal critical controls.
- [ ] **P1** Unoptimized hero video, background blur, animations, and images degrade responsiveness.
- [ ] **P2** Tiny touch targets and cramped controls.
- [ ] **P2** No responsive strategy for charts, tables, calendars, and editors.
- [ ] **P2** Layout shifts from late-loading fonts, images, and skeleton mismatch.
- [ ] **P2** Overuse of animation libraries for trivial CSS interactions.
- [ ] **P2** Missing reduced-motion behavior or high-contrast considerations.
- [ ] **P2** Poor zoom behavior at 200% or narrow viewport widths.

**Verify in browser:** keyboard-only navigation, mobile touch, 320–390px widths, tablet, desktop, zoom, slow network, no-data accounts, and reduced motion. Use automated accessibility checks **plus** manual interaction review. A single screenshot cannot validate this section.

---

## 10. Code-level signs of rushed “vibe-coded” frontend work

These are engineering smells, **not visual proof of AI use**.

- [ ] **P0** Placeholder functions wired to production buttons.
- [ ] **P0** Client-only permission checks without server authorization.
- [ ] **P0** Hardcoded demo arrays accidentally shown as real customer data.
- [ ] **P0** Unsafe HTML injection or unsanitized external content.
- [ ] **P0** Secrets or OAuth tokens exposed in client components.
- [ ] **P1** Entire page built as one huge component with duplicated state and styling.
- [ ] **P1** Repeated copy-pasted card/button/modal markup across routes.
- [ ] **P1** One-off CSS values everywhere rather than shared design tokens.
- [ ] **P1** Inconsistent design libraries or competing icon sets.
- [ ] **P1** Repeated arbitrary `z-index`, `!important`, and absolute positioning patches.
- [ ] **P1** Placeholder `href="#"`, dead onClick handlers, and `TODO` UI in shipping routes.
- [ ] **P2** Unnecessary dependency added for a simple visual effect.
- [ ] **P2** Missing tests for critical interaction states.
- [ ] **P2** Unhandled loading/error branches or console warnings.
- [ ] **P2** No shared component API or documented variants.
- [ ] **P2** Unused CSS, duplicate theme definitions, and old abandoned components.

**Better:** Reuse SOCIA's existing architecture and verified design tokens. Improve incrementally; preserve authentication, RLS, Stripe, platform integrations, publishing, and data calculations.

---

## 11. SOCIA-specific page design guardrails

### Public homepage
Show the real product and specific decisions users can make. Avoid invented trust badges, stock testimonials, generic AI illustrations, and a homepage made entirely of feature cards. Present both **creators and businesses**; SOCIA is not restaurant-only or Instagram-only.

### Dashboard
Prioritize *what changed*, *why it may matter*, and *what to do next*. Use concise summaries, activity, contextual actions, and honest data states. Avoid six interchangeable KPI cards plus a decorative graph.

### Analytics
Use meaningful baselines, time windows, sample sizes, and platform-specific definitions. Keep charts legible; provide useful hover/keyboard descriptions. Never merge unlike metrics into a fake cross-platform total.

### Competitors and niche discovery
Distinguish observed competitor activity from interpretation and recommendations. Don't fabricate audience demographics, competitor performance, or trends.

### Content Plan
Make recommendations traceable to real evidence and constraints. Show editability, acceptance, scheduling, and progress rather than a static list of AI-generated cards.

### Content Studio
Treat it as a production workspace: clear media organization, clip status, preview, edit guide, actionable controls, render state, undo, and recovery. Avoid cinematic decorative effects that make editing harder.

### Calendar and Create Post
Prioritize destination selection, visibility, account eligibility, platform-specific settings, previews, scheduling status, and failure recovery. Do not visually promise unsupported TikTok/Meta features.

### Ask SOCIA
Integrate intelligence contextually. Be clear about what data the answer uses, what it cannot know, and what action the user can take. Don't present generic chatbot decoration as functionality.

### Settings, billing, integrations, teams
Use dense, calm, predictable forms and tables. Show role/plan permissions truthfully; prevent destructive surprises. A premium product should make operational settings *boring in the good way*.

---

## 12. Decision framework: replace clichés with product-specific judgment

Before adding a new visual or interaction pattern, Claude must answer:

1. **User task:** What specific job does this help someone complete?
2. **Information:** What real content or state does it communicate?
3. **Evidence:** Is it based on real SOCIA data, user research, or a justified design reference?
4. **Alternative:** Would a table, list, panel, divider, or inline action be clearer than another card?
5. **Brand:** Does it fit SOCIA's existing design language rather than mimic a reference wholesale?
6. **Behavior:** What happens on hover, keyboard focus, touch, loading, failure, and success?
7. **Responsiveness:** How does this behave on mobile and narrow screens?
8. **Accessibility:** Can people use it without a mouse or motion?
9. **Performance:** Is the visual effect worth its rendering cost?
10. **Verification:** How will we inspect the real implementation, not just a static mockup?

If a design element has no convincing answer to #1 or #2, remove it or simplify it.

---

## 13. Claude implementation workflow

**When asked to redesign or implement SOCIA UI:**

1. **Inspect before changing.** Read existing pages, tokens, shared components, interaction code, and the design-reference library. Do not assume the current UI is wrong everywhere.
2. **Inventory issues.** Tag concrete examples as P0/P1/P2 with file path, screenshot if available, user impact, and proposed alternative.
3. **Prioritize.** Fix trust, usability, and accessibility before decorative polish. Avoid a blanket redesign that breaks workflows.
4. **Establish one system.** Typography, spacing, radii, borders, colors, elevation, icon family, interaction states, and motion rules.
5. **Prototype purposefully.** Use OpenDesign if connected and genuinely helpful; verify tool access and don't pretend a tool was used. Compare a small number of meaningfully different concepts.
6. **Implement with real content.** No invented production metrics or fake controls. Keep business logic and security intact.
7. **Review in browser.** Check signed-out and signed-in routes, empty and populated states, different roles/plans, desktop/mobile, keyboard, reduced motion, and slow network.
8. **Run checks.** TypeScript, lint, tests, build, and accessibility tooling where available. Record what was actually tested.
9. **Compare against this file.** Audit the finished page for repeated default patterns and unreviewed states; explain justified exceptions.
10. **Report precisely.** What changed, why it improves the user task, screenshots or previews, tests, and unresolved issues.

**Do not** change database schema, OAuth, RLS, Stripe, publishing, entitlements, or analytics logic merely to support a cosmetic redesign. If a UX improvement requires backend changes, isolate and explain them before implementing.

---

## 14. Anti-slop acceptance checklist (release gate)

A page is **not ready** if any applicable P0 item is unresolved. For P1/P2 items, require a reasoned review rather than a mechanical zero count.

- [ ] Can a first-time user describe what this page does within seconds?
- [ ] Would the layout still make sense if every gradient and glow were removed?
- [ ] Does the page show SOCIA-specific tasks and information rather than interchangeable SaaS filler?
- [ ] Is every CTA real, accurately labeled, and useful?
- [ ] Is every data point real or clearly identified as an illustrative example?
- [ ] Are all critical empty/loading/error/success/disabled states designed?
- [ ] Are permissions and subscription entitlements enforced by the server and represented honestly?
- [ ] Is the typography hierarchy obvious without relying on giant text?
- [ ] Is each card, icon, animation, and shadow doing a specific job?
- [ ] Does the page use a coherent icon family and design-token system?
- [ ] Is motion subtle, purposeful, and reduced-motion aware?
- [ ] Is the experience usable with keyboard, touch, and zoom?
- [ ] Is the responsive layout intentionally redesigned rather than blindly stacked?
- [ ] Does the copy describe specific value without generic hype?
- [ ] Have real workflows and regressions been tested?
- [ ] Does the result feel like one original SOCIA product, not stitched-together references?

### Fast “substitution test”
Temporarily replace “SOCIA” with a random SaaS company name. If the page's headline, feature cards, visuals, and value proposition still fit unchanged, it is insufficiently specific. Rewrite around the real workflow.

### Fast “remove the chrome” test
Remove decorative gradients, glows, icon tiles, and animation. If the page becomes incomprehensible or loses all personality, the information hierarchy and product storytelling are too weak.

### Fast “broken network” test
Simulate a slow or failed request. If the interface cannot explain progress, failure, retry, or next steps, it is not finished.

---

## 17. Additions (v1.1)

Signs the first version did not name, found while auditing SOCIA itself or common in analytics and social products. Same severity labels.

### 17.1 Scores, predictions and numbers
- [ ] **P0** A score with no stated method or inputs ("Health 92/100", "Content score 84", "Hook strength 91"). A score is allowed only when its formula, inputs and sample are one click away.
- [ ] **P0** Predicted outcomes stated as facts ("+31% above your average", "Predicted retention +17%") without the model, the sample and the uncertainty.
- [ ] **P0** Counters that animate up to a number nobody measured, or that render "0" first (crawlers, no-JS and screen readers read the zero).
- [ ] **P1** False precision: two decimals on estimates, "4.7×", "2.4× your average" without the baseline and the window.
- [ ] **P1** Round marketing numbers ("10k+ creators", "1M+ posts analysed") without a source.
- [ ] **P2** Deltas shown without the absolute values behind them ("+12 vs last week" of what?).

### 17.2 Fake liveness
- [ ] **P0** "Live", a pulsing green dot, or "Updated 2 min ago" on data that is a daily snapshot or a static mock.
- [ ] **P1** Typewriter or streaming effects on text that was not generated in that moment.
- [ ] **P1** Artificial "AI is thinking…" delays, step lists or progress theatre in front of an instant result.
- [ ] **P0** Fake urgency or scarcity: countdowns, "only 3 spots left", limited-time banners that never end.

### 17.3 Placeholder people, brands and content
- [ ] **P0** Placeholder identities in shipped UI: "John Doe", "Jane Cooper", "Acme", "Competitor A/B/C", "@username", lorem ipsum.
- [ ] **P1** Random-face avatar stacks ("Join 2,000+ creators" with stock faces), pravatar/unsplash portraits.
- [ ] **P1** Generic people illustrations (flat "unDraw" figures, isometric scenes, blob characters) in place of SOCIA's screens.
- [ ] **P1** AI-generated photos or imagery with tell-tale artefacts (hands, garbled text, plastic skin).
- [ ] **P2** "As seen in" press logos, award badges or "#1 rated" without the publication and the date.

### 17.4 Social-platform specific (SOCIA's domain)
- [ ] **P0** Claiming a platform capability the platform's API does not provide (TikTok demographics or time series, competitor private metrics, guaranteed reach), or a "Connect" button for an integration that does not exist.
- [ ] **P0** Outdated or misused platform marks (the Twitter bird for X, recoloured or redrawn logos, logos used as decoration). Follow each platform's brand rules; use the official name ("Instagram", not "IG" in UI).
- [ ] **P1** One "engagement rate" or "reach" across platforms that define it differently, without per-platform labels.
- [ ] **P1** Post previews that look pixel-identical to the real app but are not (fonts, crop, truncation): label previews "approximate".

### 17.5 Copy voice
- [ ] **P1** A chat persona leaking into product UI: "I've analysed your account…", "Great question!", "As your AI strategist…", "Let's dive in".
- [ ] **P1** "AI" as a prefix on everything ("AI Insights", "AI Calendar", "AI Score") instead of saying what the feature does.
- [ ] **P1** Hedging filler ("It's important to note that…", "In today's fast-paced digital landscape…").
- [ ] **P2** Mixed Title Case and sentence case across buttons, headings and menus. SOCIA uses sentence case.
- [ ] **P2** Inconsistent product naming (SOCIA / Socia / socia; Brand Workspace / workspace / brand) on the same screen.
- [ ] **P2** "Click here", "Submit", "OK" and "Learn more" as link or button text.
- [ ] **P2** Exclamation-mark success copy ("🎉 You're all set!") and celebratory confetti for routine actions.

### 17.6 Errors, empties and confirmations
- [ ] **P1** "Oops! Something went wrong" (or any error that does not say what failed, whether data was kept, and what to do next).
- [ ] **P0** Raw database, API or stack-trace text shown to customers.
- [ ] **P1** "Are you sure?" dialogs that do not state the consequence ("Delete 3 scheduled posts from Instagram? This can't be undone.").
- [ ] **P2** One spinner for every wait: no skeleton for layout, no progress for long work, no estimate for renders.
- [ ] **P2** Empty states with a rocket or sparkle emoji and no next step.

### 17.7 Pricing and upgrade
- [ ] **P1** "Most popular" on a plan without data that it is.
- [ ] **P1** Crossed-out "was" prices, fake annual discounts, or a decoy plan that exists only to make another look cheap.
- [ ] **P1** Feature lists that are only checkmarks, with no limits stated (what does "Unlimited" really mean?).
- [ ] **P2** An upgrade CTA on every screen of a free plan, or upgrade prompts on features the plan already includes.

### 17.8 AI features in the product
- [ ] **P1** "Generate with AI ✨" buttons sprinkled everywhere rather than at the point a decision is made.
- [ ] **P0** AI output presented as fact with no indication of what data it used or when it might be wrong.
- [ ] **P1** A floating chatbot bubble on the marketing site or in the corner of every app page.
- [ ] **P2** Keyboard shortcuts advertised (⌘K, ?) that do not work, or a command palette that only navigates.

### 17.9 Shell, metadata and "starter kit" leftovers
- [ ] **P1** Default favicon, default Open Graph image, "Create Next App" titles, default 404 and 500 pages.
- [ ] **P1** Marketing site and app that look like two different products (different theme, fonts, button styles).
- [ ] **P2** Section dot-navigation ("01 PROMISE · 02 PROBLEM"), scroll-jacking or custom cursors on a marketing page.
- [ ] **P2** Footer with "Made with ❤️", a stale copyright year, social icons linking nowhere, or Blog/Careers links to empty pages.
- [ ] **P2** Legal pages generated from a template with placeholders or another company's terms.
- [ ] **P2** A glassy, blurred sticky header over every page.

### 17.10 Charts (beyond section 7)
- [ ] **P1** Perfect up-and-to-the-right curves in illustrations; real data is never that smooth.
- [ ] **P1** Gauges, donuts for two values, 3D or radial charts where a number or a bar would do.
- [ ] **P2** "Series 1" legends, axes without units, unlabeled y-axes, tooltips without the date and the platform.

---

## 18. How SOCIA enforces this (integration)

This standard is part of how SOCIA is built, not a document to remember.

1. **Read first.** `CLAUDE.md` at the repository root tells every Claude session to read this file before proposing or changing UI. The design-intelligence skill links it as a release gate.
2. **Automated guard.** `lib/antiSlop.test.ts` scans every page, component and stylesheet for the objective signs (fake proof words, stock phrases, `href="#"`, generic "AI" icons, emoji and em dashes in user-facing text, "Oops / Something went wrong", gradient text, frosted glass, decorative gradients, glow, looping animation). It is a **ratchet**: today's known occurrences are listed per file, a new one anywhere fails the build, and when a page is cleaned its entry must shrink (a stale allowance also fails). The list only ever gets shorter.
3. **Design budget.** `lib/designBudget.test.ts` keeps the token system closed (font sizes, weights, radii, durations, keyframes).
4. **Review.** Every redesign PR is checked against section 14 (the acceptance checklist) and the fast tests, and its report says which P0/P1 items it removed and which justified exceptions remain.
5. **Judgment over counting.** The guard catches what a pattern match can. Everything else in sections 1 to 17 is reviewed by eye in the browser. A clear, usable convention stays, with the reason written down.

### 18.1 Recorded exceptions

Each exception is approved by Noah, dated, scoped to one element, and enforced in both tests so it cannot spread.

- **Headbar backdrop blur (2026-10-28).** The floating app headbar (`.s-headbar` in `app/styles/shell.css`, since the same day a centred smoked-glass dock) uses a subtle `backdrop-filter: blur(16px)` over a translucent charcoal ground. Noah asked for it twice and approved this exception. **Reason:** the bar floats over scrolling content on every app page, and the blur keeps its labels legible over that content without making the bar opaque. **Limits:** this one rule only. People who ask their system to reduce transparency get an opaque bar. Blur remains banned on every panel, card, dialog and marketing header (sections 2 and 17.9). `lib/antiSlop.test.ts` allows exactly one occurrence in `shell.css`, and `lib/designBudget.test.ts` allows it only inside the `.s-headbar` rule.

## 15. Research references and limitations

Sources below informed the **pattern inventory** and **design principles**. Most “AI tells” are industry commentary and heuristic observations, not controlled evidence that a particular site was AI-authored. Research claims are attributed rather than treated as universal laws.

1. [InterfaceKit — What makes a website look AI-generated?](https://blog.interfacekit.io/what-makes-a-website-look-ai-generated) — Generic structure, shallow product specificity, missing states, and unreviewed inconsistency; cautions against treating individual visual choices as proof.
2. [Nielsen Norman Group — UX-Context Design](https://www.nngroup.com/articles/ux-context-design/) — Why design context, research, and standards are needed to steer AI away from generic averages.
3. [Designpixil — Vibe-Coded Apps Look the Same: Data From 832 Websites](https://designpixil.com/blog/vibe-coded-apps-design-study) — Reported comparison of default style markers; limited to sampled homepages and code/style markers.
4. [Search Engine Journal — 7 AI Vibe Coding Website Mistakes to Avoid](https://www.searchenginejournal.com/7-common-ai-website-mistakes-that-are-easy-to-avoid/574196/) — Discussion of generic gradients, bento layouts, iconography, and hover patterns.
5. [SCALR — 20 Signs a Website Was Made by AI](https://scalr.sg/blog/20-signs-a-website-was-made-by-ai/) — Catalog of recurring aesthetic clichés, including gradients, frosted cards, badges, and motion.
6. [GitHub — signs-of-ai-design](https://github.com/febbhav/signs-of-ai-design) — Community field guide; acknowledges false positives and moderate reliability.
7. [Impeccable — Slop pattern catalog](https://subclaude.com/slop/) — Detection-oriented collection of visual patterns; rules should be used as prompts for review, not absolute prohibitions.
8. [The Crit — Does Your AI-Built App Look Vibe-Coded?](https://thecrit.co/resources/does-your-ai-built-app-look-vibe-coded) — Missing states, generic iconography, and unsupported proof claims.
9. [Design Research — Accessibility of AI-Generated UI](https://www.designwithclaude.com/design-research/ai-generated-frontends) — Independent site-reported audit of 123 public frontends; useful directional warning about accessibility and reduced-motion gaps, not a representative population estimate.
10. [The New Yorker — The A.I.-Design Aesthetic That's Taking Over the Internet](https://www.newyorker.com/the-ai-design-aesthetic-thats-taking-over-the-internet) — Reporting on visual convergence, templates, and the role of human judgment.
11. [ScoreMySite — AI design slop](https://www.scoremysite.dev/mistakes/ai-design-slop) — Practical suggestions to replace abstract decoration with real product imagery and specific copy.

---

## 16. One-paragraph directive for Claude

**Design SOCIA like a mature, distinctive product—not a generic AI SaaS template.** Reject reflexive gradient heroes, glowing blobs, repetitive rounded cards, stock icons, fake metrics, generic buzzwords, and decorative motion. Use real SOCIA workflows, clear hierarchy, trustworthy analytics, deliberate information density, purposeful interactions, cohesive typography, consistent components, and complete accessible states. Preserve the existing SOCIA brand and working backend. When a common convention is genuinely best for usability, keep it and document why. Audit and test the implementation; do not confuse an attractive screenshot with a finished product.
