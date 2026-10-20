# Higgsfield

- **URL(s):** https://higgsfield.ai/ (home), /ai/video, /ai/image, /audio, /marketing-studio, /generate and /generate/all (Cinema Studio), /community, /community/generations (shot viewer), /pricing, /explore and /start/agent (phone). Signed in: /asset/all, /asset/projects, /asset/elements, /asset/video, /asset/all/<id> (item viewer), /me/settings, /me/settings/usage, /me/settings/subscription, the public profile page, the account menu and the studio notifications panel.
- **Category:** AI creative tool (video and image generation) with a community gallery; consumer/prosumer web app, dark UI only
- **Studied:** 2026-10-19 signed out; signed-in screens 2026-10-19 (signed in by Noah, look-only)
- **Tags:** AI-INTERACTION, EDITOR, FORMS, PRICING, BILLING, NAVIGATION, EMPTY-STATES, ONBOARDING, LOADING, MOTION, MOBILE, ICONS, TABLES, ANALYTICS, SETTINGS, CHARTS

## Coverage
| Area | Inspected? | How | Notes |
|---|---|---|---|
| Marketing homepage | yes | browser 1440px (screenshots + DOM) and 375px (screenshot) | Desktop page is about 11,700px of promo sections. At 375px the homepage redirects to `/explore`, a different "Creation Hub" layout. |
| Video and audio generators (`/ai/video`, `/audio`) | yes | browser 1440px, screenshots + DOM; preset picker, model popover and preset selection exercised; signed in, the model switched (a gated one and Genjutsu) to watch the form and price, then restored | Public without sign-in. Nothing was generated; Generate was never pressed; no prompt typed. |
| Image generator (`/ai/image`) | yes (signed in) | 1440px emulated viewport, screenshots + DOM; model picker and Quality menu opened, model, quality and batch changed to watch the price | Signed out it was DOM only. Generate never pressed, no prompt typed; settings restored afterwards. |
| Marketing Studio, Cinema Studio | yes (signed in) | screenshots + DOM; Image/Video mode toggled to watch the price | Signed out it was DOM only. `/gallery/all` (Library) redirects signed-out visitors to Cinema Studio. |
| Community feed + shot viewer | yes (DOM) | DOM, shot modal opened | Prompt, details and actions are all public. No screenshot. |
| Pricing | yes (DOM) | DOM + extract-styles | Includes the plan recommender. No screenshot. |
| Phone width | yes | 375px screenshots + DOM | `/ai/video` redirects to a chat-style `/start/agent` composer. |
| States (hover, menus, focus) | partly | Mega-menu hover (screenshot), model popover (DOM), preset picker (screenshot); signed in: account menu, Filter/View/Quality/date-range menus, tile hover overlays, disabled and loading Generate states | Keyboard focus not tab-tested; focus CSS read from stylesheets. Hover-to-play previews couldn't be confirmed because the page reported `visibilityState: hidden`. Filter submenus didn't open in the hidden pane. |
| Motion | measured, not watched | extract-styles + root tokens | Durations, easings and keyframe names are measured. Live playback not observed. |
| Signed-in shell, account menu, profile | yes | signed in by Noah, 2026-10-19; screenshots (1440px emulated, pane hidden so captured at 800px) + DOM | Header, hover account menu, credits tooltip, public profile page with its empty sections. |
| Assets library + item viewer | yes | screenshots + DOM; Filter and View menus opened; one existing image opened read-only, its Info/Edit/Comments tabs viewed | Edit-tool sub-panels (Upscale, Relight…) not opened in case they spend credits. Selection, like, download never used. |
| Generator history (signed in) | yes | image history hover overlay, View menu, Cinema Studio "My generations" | No video or audio history existed, so only the empty fallback was seen there. |
| Settings, Usage, Subscription | yes | screenshots + DOM + extract-styles | Date-range menu opened. Sessions, Gifts and Promocode pages not opened. Nothing edited. |
| Upgrade/plan sheet | yes (passive) | opened by "View credits" and by choosing a gated model and a gated quality | Nothing chosen inside it; closed with its X. |
| Notifications | yes | studio sidebar bell, panel and its type filter opened | The account had no notifications, so item anatomy is not seen. |
| Phone width signed in | partly | 375px: Assets page and the navigation drawer | Generators at phone width not re-checked signed in. |
| Light theme | n/a | | Dark only. No theme toggle found. |

**Still not seen (would need a real generation or screenshots from Noah):** a generation queued and in progress, a result arriving, a failed generation, the error after pressing Generate without enough credits, the top-up or checkout flow, invoices with entries, notification items, a video item in the viewer, comments with content.

## Measured system
- **Type:** Inter (variable 100–900) for all UI. Space Grotesk 700, uppercase, for display titles and preset names. Space Mono was also loaded on the homepage, and "Inter Display" was used for a phone heading [measured].
  - **Core app scale:** 12/16, 14/20 and 16/24, so line heights sit on a 4px grid, plus 20/28 for preset titles. Only four weights are used: 400, 500, 600 and 700 [measured].
  - **Homepage display sizes:** 28, 36, 40, 44, 48 and 56px. Tracking tightens from -2% to -4% on display type (-2.24px at 56px), and +0.1px is added at 14px for details text [measured].
  - **Named type tokens:** text styles like `text-h-lg-bold` carry their own tracking and weight (for example `--text-h-lg-bold--letter-spacing: -2%`) [measured].
- **Colour:**
  - **Neutrals:** near-neutral with a faint cool bias. Page `#0f1113`, panels `#131517`, controls `#1c1e20`, tiles `#23262a`, raised `#383e46`. Text `#f7f7f8`, secondary `#898a8b`, tertiary `#a8a8a8` [measured].
  - **Accent:** one, lime `#d1fe17`. It's used for the primary action (Generate, Sign up, Upgrade), the active filter chip, the selected preset's title and a few highlight labels. Lime fills at 20–24% mark subtle selected states [measured].
  - **Promotions:** discount badges use pink `#ff005b` [measured].
  - **Tokens:** three overlapping namespaces (`--hf-*` ×740, `--color-*` ×454, `--color-q-*` ×166) hold duplicate values, 2,045 custom properties in all [measured].
- **Shape:**
  - **Radius ladder:** tokenised in 0.125rem steps (2, 4, 6, 8, 10, 12, 16, 20 and 24px, plus full). In use: 12px ×117, 10px ×91, 8px ×85 and pills [measured].
  - **Radius grows with the element** [measured]:
    - 4px on spec chips
    - 8px on chips and icon tiles
    - 10–12px on buttons and cards
    - 16px on popovers, preset cards and picker panels
    - 20px on the floating image composer
  - **Surface separation:** surfaces are separated by fill steps, not borders. The few borders are 1px white at 4–10% alpha [measured].
  - **Depth:** comes from inset highlights (`rgba(255,255,255,.05) 0 1.5px 3px inset`) rather than drop shadows. The lime CTA has a darker inset bottom edge (`0 -3px 0` olive) for a pressable look [measured].
  - **Popovers:** 95% opaque with `blur(32px)` and a 16px radius [measured].
- **Spacing and density:** 4px base (Tailwind) [measured].
  - **Video control panel:** a fixed 318px column [measured].
  - **Row heights:** mega-menu rows 64px, model-list rows 52px, setting tiles 40–48px, chips 28–32px [measured].
  - **Community grid:** 5 columns of 262px with 16px gutters at 1440px [measured].
- **Motion:**
  - **Default:** 0.2s `cubic-bezier(.4,0,.2,1)` (Tailwind) on most colour and transform transitions [measured].
  - **Indicators and size changes:** 0.26s ease-out-quart `(.22,1,.36,1)`, the same curve SOCIA uses, on transform, width and clip-path [measured].
  - **Scale:** 0.26s emphasized `(.32,.72,0,1)` [measured].
  - **Hover overlays:** 0.1s opacity [measured].
  - **Preview crossfade:** 0.5s from poster image to video [measured].
  - **Keyframes:** popovers enter with `popover-in-right 0.2s`, pricing cards with `pricing-card-enter 0.22s`, and skeletons use `pulse 2s` [measured].
  - **Named tokens:** durations fast .1s, normal .2s, slow .3s and slower .5s; easings swift, emphasized, out-quart, out-expo and spring (with overshoot) [measured].
  - **Reduced motion:** 7 `prefers-reduced-motion` blocks, mostly on pricing and toasts, so coverage is partial [measured].
- **Icons:** a custom outline set on a 24px grid, stroke 1.5, square line caps [measured].
  - **Sizes:** 16px in dense chips and model rows, 20px on the homepage, 24px inside 48px menu tiles [measured].
  - **Icon tiles:** 48px with a 12px radius (mega menu), and 40px with an 8px radius and a white-5% fill (model list) [measured].
  - **Icon-to-label gap:** 12px in rows, 6px in chips [measured].

## Strongest design qualities
1. **Cost on the commit button, before the commit.** The Generate button carries the credit price of the current configuration (`Generate ✦ 80`). The price updates as settings change: picking a cheaper preset dropped it from 80 to 10 [observed]. Signed in it behaves the same: batch 1 → 2 doubled an image price (2 → 4), switching Marketing Studio from Image to Video moved it from 3.5 to 90, and image quality 1K → 2K left it unchanged [observed]. While the price is still loading the button reads just `GENERATE`, with no number, and the price appears when it's ready [measured]. When required input is missing (Genjutsu without a reference video, Audio without a script) the button is disabled, grey and shows no price [measured]. A discount shows as a struck-through old price at 40% opacity next to the new one (8.5 → 6.5) [measured]. *Correction:* the signed-out Marketing Studio `GENERATE —` dash was not a lasting "can't compute" state; signed in, the same default configuration shows a price.
   - **Why it works:** the price sits exactly where the decision is made, so there's no surprise and no hunting for a pricing page. Live recalculation teaches which settings are expensive without any explanation. Showing no number while loading is honest, not a fake zero, and a disabled button that drops both the accent and the price says "not ready" without an error message.
   - **Where it stops working:** the button stays lime and enabled even when the balance in the account menu can't cover the price, and nothing near it says so [observed with a low balance; what happens on press was not tested]. The cost is shown, affordability isn't.
   - **For SOCIA:** relevant wherever AI work is metered or limited (Generate Caption, Make This Video, Plan These Posts). Show the cost or remaining allowance on the action itself, use "—" with a reason when it's unknown, and also say before the click when the remaining allowance doesn't cover it, which Higgsfield doesn't. This matches Noah's real-data rule.
2. **The chosen preset decides the form.** Selecting a preset reconfigures the panel [observed]:
   - "General" on Seedance shows reference upload (image, video or audio), a References / Extend Video segment, and duration, ratio, resolution and bitrate controls.
   - "Face Punch" on Higgsfield DoP collapses this to one image slot, the prompt, an enhance toggle and the model.
   - The cost changes with it.
   - **Why it works:** progressive disclosure driven by the person's own choice. The form only ever asks for what this output can use, so there are no dead or irrelevant fields.
   - **For SOCIA:** strong. The Create Post composer should show only the fields that apply to the chosen platform and format (Reel vs Carousel vs Short vs Trial Reel). Content Studio's Look & sound controls should follow the chosen template.
3. **Settings as "label over value" tiles.** Every setting shows its name and its current value: `Model / Seedance 2.5`, `Bitrate / High`, `Camera / Auto`, `Lighting / Auto`, `References / 0/50` [measured].
   - **Why it works:** the whole configuration can be read at a glance without opening anything. "Auto" names the smart default instead of leaving a blank, so the person knows a decision was made for them and can override it. Counters like 0/50 show the limit before it's hit.
   - **For SOCIA:** directly applicable to the composer's settings row (platform, publish time with "Auto: best time …", collaborators, first comment) and to Make This Video. A default is never an empty field; it's a named value.
4. **Pick from previews, beside the form it fills.** "Change" opens the preset picker in place of the results area while the control panel stays visible [observed]:
   - a row of model tabs with NEW/TOP badges
   - category chips (All, New, Trending, Effects, camera-control groups)
   - search
   - a masonry grid of preview cards (uppercase name on a bottom scrim, a "Top Choice" or "Mixed" badge, a static poster that crossfades to a looping muted video in 0.5s with `preload="none"`)

   Picker state is in the URL (`?select=preset&for=motion`) [measured]. "Load more" pages the grid instead of infinite scroll [measured].
   - **Why it works:** a visual style is chosen by seeing it move, not by reading a name. Keeping the form visible keeps context. Lazy video (poster first, video on demand, inferred) keeps a 30-card grid cheap. The URL state makes back and refresh behave.
   - **For SOCIA:** Content Studio look and template pickers, and caption tone or voice presets (a short before/after sample instead of a looping video). Use SOCIA tokens and lucide, not the scrim-and-uppercase styling.
5. **Options that carry their specs.** Each row in the model popover is a 52px row [measured]:
   - a 40px icon tile
   - a 12px name
   - 10px spec chips (`720p`, `4s–15s`) on a white-5% fill with a 4px radius
   - TOP/NEW badges

   The rows are grouped into "Featured models" and "All models", and the "All models" groups are families with a one-line description [measured].
   - **Why it works:** comparison happens inside the picker, at the moment of choosing. The person never selects an option only to learn it can't do 30 seconds.
   - **Signed in, the picker is half-done** [observed]. The video picker shows specs but doesn't mark which models the plan excludes: choosing one opened an "Upgrade required" sheet. The image picker does the opposite: a lime italic PREMIUM badge on gated models, but no spec chips. The Quality menu marks its gated option inline ("4K · Premium"). So the hard limits are visible in one picker and the plan limits in the other, never both.
   - **For SOCIA:** the platform/format chooser and any model or voice choice. Show the hard limits (max duration, aspect, hashtag cap, collaborator cap) as chips on each option.
6. **Every gallery item shows its recipe.** The community shot viewer is deep-linked (`?shot=<id>`) [measured]:
   - the media centred on a 64px-blurred copy of itself
   - a right inspector with uppercase 12px section labels (PROMPT with a Copy button, a palette of hex values, DETAILS key/value rows for model, quality, size and created date)
   - a hierarchy of one full-width primary action ("Turn to video") over two half-width secondary actions ("Recreate", "Download")

   The phone Explore screen leads its community section with "Recreate with one tap" [observed].
   - **Why it works:** showing inputs next to outputs turns inspiration into a starting point. The person learns what produced the result and can reuse it in one action.
   - **For SOCIA:** "Worth posting again", top posts in Analytics and Competitors. Show what produced a result (caption, format, posting time, hashtags, length) next to its metrics, with "Use as starting point" as the primary action. This reinforces the existing copy-then-draft flow.
7. **The plan recommender works from the person's needs.** Pricing has a three-step block [measured]:
   1. what you make (multi-select chips)
   2. how many per month (sliders, with each unit's credit cost shown as "≈ 14 credits each")
   3. features

   It produces "We recommend Plus" with an expected-usage meter (`820/1,200 credits`). Plan cards translate credits into outputs ("= 600 … generations", "~ 80 … videos") [measured].
   - **Why it works:** it converts an abstract unit (credits) into the person's own output, and shows headroom, not just a price.
   - **For SOCIA:** the Pricing page and upgrade prompts. Ask for brands, platforms and posts per week, recommend the plan, and show expected use against the plan's limits. Only use real limits from `FEATURE_MIN_PLAN`.

## Best components
- **Video control panel (318px column)** [measured]:
  - a preset card with a video thumbnail and a `Change` pill
  - a segmented control (40px)
  - a dropzone showing accepted types as three small icons
  - a prompt box with an example placeholder and `@` references
  - label/value setting rows
  - three equal 40px tiles for duration, ratio and resolution
  - a full-width 48px Generate button with its cost

  It reads top to bottom as "what, from what, how, go".
- **Floating composer bar (image generator):** 880px wide, 20px radius, docked at the bottom of the canvas [measured]:
  - icon buttons for references and elements
  - a horizontally scrolling chip row (model, aspect, quality, resolution, batch stepper `1/4`) with scroll arrows when it overflows
  - a tall 120×80 Generate block with its cost
- **Model popover:** grouped list with spec chips (see quality 5) [measured].
- **Mega menu (header "Video"):** two columns, Features and Models. Each row is 64px: a 48px icon tile, a 14/500 title and a 14/400 grey one-line description [measured]. Every destination explains itself in one line.
- **Shot inspector:** see quality 6.
- **Badges over media:** 28px, 14/500 type, `rgba(11,11,11,.3)` fill with a 1px white-10% border and an 8px radius [measured]. They're legible on any thumbnail without a heavy plate.

## Best interactions
- **Selecting a preset** closes the picker, rewrites the form and updates the cost in one step [observed].
- **Model popover** slides in from the panel's edge (`popover-in-right 0.2s`), anchored to the right of the 318px column so it never covers the form it edits [measured].
- **Poster-to-video crossfade** on preset and gallery cards (0.5s opacity), with video loaded on demand [measured: transition and `preload="none"`; inferred: triggered by hover or visibility].
- **History controls:** the person chooses the density [measured signed in]. *Correction:* there is no List/Grid toggle. The generator history's View menu is a single 5-step "Card size" slider; the Assets library's View menu adds Layout (Square or Masonry) and a "Split by date" switch. See "Logged-in app".
- **URL-backed overlays** (`?select=preset`, `?shot=`): back closes them and links can be shared [measured].

## Best UX patterns
- **The empty state is the tutorial.** Signed out, the results area shows three numbered steps (add image, choose preset, get video), each with a real example visual, under a one-line headline [observed]. The empty canvas teaches the flow it will later display. Signed in with no videos or audio yet, the History tab falls back to the same How-it-works content [observed], and once items exist the canvas becomes the person's own history (see "Logged-in app").
- **Smart defaults stated as "Auto"** (Cinema Studio camera, lighting, palette, film setup) [measured].
- **Example-first prompts.** Placeholders are concrete requests, not "Enter prompt", and `@` pulls in saved characters, locations or products [measured].
- **Counters show limits early:** `References 0/50`, batch `1/4` [measured].
- **On phones, one composer.** Phone visitors get a single chat-style composer [measured]:
  - the input is 16px, which avoids iOS zoom
  - a `+` button for references
  - a model chip and a settings icon
  - a lime send pill that shows the cost

  The full panel is replaced instead of squeezed.

## Logged-in app (2026-10-19)
Signed in by Noah; inspected look-only (no generations, uploads, purchases or settings changes). Account data (names, balances, plan, generations, prompts) is deliberately left out; only UI structure is recorded.

### Header and account menu
- **What:** the signed-in header's right cluster is Search, Pricing (with a discount tag), Enterprise, Assets (folder icon) and the avatar [measured]. There's no credit balance in the header [observed]. Clicking the avatar opens the public profile; *hovering* it opens the account menu [observed]. The menu is 288px wide, 20px radius, `#1c1e21` fill with a 1px white-5% border, entering with `header-popover-in 0.28s` [measured]. Top to bottom:
  - an identity row with the plan name under the username
  - a Credits block on a white-5% fill (16px radius): label, an info tooltip explaining what drives cost, "N left", and a meter drawn as ~34 dots of 6px (lime for remaining, white-5% for used) [measured]
  - a "Go Premium" row with a small lime Upgrade pill (10px/600)
  - plain 12px/500 rows on a 32px pitch: View profile, Manage Account, Affiliate program, Join Community, Language (current value right-aligned in grey), Sign out [measured]
- **Why it works:** the balance lives one hover away, not in the header, so the generator chrome stays quiet; the explanation of cost sits next to the balance, the only place a person asks "why did that cost so much?". Showing the current language value in the row ("Language … English") is the label-over-value idea again.
- **SOCIA:** the account menu is the right home for plan + AI allowance: plan name, a compact meter of this month's AI uses with a one-line "what counts" tooltip, then the usual rows. Use a plain bar in SOCIA tokens, not the dot meter. Don't open menus on hover only; SOCIA should open on click and keep hover as a preview at most.

### Credits, gating and the plan sheet
- **What:** clicking the credits block, when the current plan can't top up, opens a full-screen plan sheet titled "Upgrade plan to buy credits" [observed]. Choosing a gated option opens the *same* sheet with a headline naming what was attempted: picking a gated image option gave "Unlock <model>", picking a gated video model gave "Upgrade required … with a Plus or higher-tier plan" [observed]. Closing it leaves the previous selection in place, so the gated choice is never half-applied [observed]. A low-balance toast (bold title, grey "% already used", lime Upgrade, small close) appeared bottom-right on first load and didn't return after it was dismissed [observed]. Plan-gated options are marked inline in some menus ("4K · Premium", PREMIUM badges in the image model list) and not in others (video models) [observed].
- **Why it works:** the paywall is contextual. The person sees exactly which thing needs which plan at the moment they reach for it, and their form isn't corrupted. The toast warns at a threshold before the wall instead of at it.
- **Where it fails:** gating that is only discovered on selection feels like a trap; the one-sheet-for-everything plan modal is a full-screen interruption for a menu choice.
- **SOCIA:** this is SOCIA's `upgradeFor` rule made visible. Mark gated options *before* selection (a small "Growth" tag on the option, as the Quality menu does), and when one is chosen, open SOCIA's upgrade sheet titled with the feature ("Unlock competitor tracking: Growth and above"), leaving the current state untouched. Warn once at about 80–90% of a limit (brands, AI uses) with one action; never stack a banner, toast and modal for the same message.

### Assets library
- **What:** `/asset/*` is a two-column page: a 214px left list (Assets, Projects, Favourites, Elements, Trash, then a "Tools" group: Images, Video, Audio, Enhanced), each row 36px, 12px radius, 14/500, active row on a white-5% fill, with a count at the right [measured]. The main area has a 20/600 title, Search (with a "search tips" info button and a one-time callout that search now covers date and prompt), Filter and View [measured/observed].
  - Items are grouped under date headers, each with a select-all checkbox; tiles keep their aspect ratio, sit on 4px gutters with square corners, and pop in (`pop-in 0.2s`) [measured].
  - Hover shows a checkbox top-left and a vertical icon column top-right (like, download, two more, more actions) [measured]. Tiles are CSS size containers, and the overlay controls scale with the tile: 18px buttons on ~290px tiles, 32px on ~470px tiles in the generator history [measured; the container-query cause is inferred].
  - Filter is a grouped menu (220px, 12px radius, 8px padding, sentence-case 12/500 group labels at 50% white): Type → All types / All models / Date range (each a submenu), Activity → Liked [measured]. View holds Layout (Square or Masonry), a "Split by date" switch and a card-size stepper [observed].
  - Projects has its own filter chips by source (All, Cinema studio, Marketing Studio, Ads Studio, Contests) [observed].
- **Why it works:** the left list is both navigation and inventory (counts tell you where things are before you click). Date groups match how people remember making things. Filter groups separate "what kind" from "what I did with it". Controls that scale with the tile stay usable at every density.
- **SOCIA:** Content Studio's clips library and any posts library: a left list with counts (All, Drafts, Scheduled, Published, Trash; then by platform), date-grouped grid with per-group select, a Filter menu grouped into "Type" and "Activity", and a View menu for density. Keep SOCIA's radius on tiles; square tiles on 4px gutters suit media but not SOCIA's card system.

### Item viewer: inspect, edit and discuss in one place
- **What:** opening an item gives a deep-linked full-screen viewer (`/asset/all/<id>`) with the media on a blurred copy of itself and a 334px right inspector [measured]. The inspector has three tabs (106×32, 12/500) [measured]:
  - **Info:** author row, PROMPT with Copy and a "See all" expander over a fade, a collapsible DETAILS list (model, size, created), then actions: a full-width lime "Turn to video", half-width Recreate and Reference, then Download plus icon buttons (40px tall, 10px radius) [measured]. No price on these buttons; they lead into a generator [observed].
  - **Edit:** the same screen becomes an editor: a list of edit tools (some tagged New, each with a chevron), a LAYERS section with the base layer, a floating tool palette (36px buttons whose labels include shortcuts such as "Select (V)" and "Hand (H) — or hold Space"), zoom controls, and a prompt bar whose round Generate is disabled at 50% until something is typed [measured].
  - **Comments:** "No comments yet" with an icon, and a composer pinned at the bottom [observed].
  - Switching tabs dimmed the whole viewer for ~2s while the next tab loaded [observed; possibly throttled by the hidden pane].
- **Why it works:** one object, three jobs, no navigation. The person never leaves the thing they're looking at to change it or talk about it. Shortcuts written into the tool labels teach the keyboard without a help page.
- **SOCIA:** a post drawer with Info (what was posted, metrics, details), Edit (draft a new version from it) and Comments (the approval-workflow thread), deep-linked by post id. Put shortcuts in tooltips the same way. Avoid the full-screen dim on tab change; keep the drawer static and swap only the tab body.

### Generators, signed in
- **History is the canvas.** In the image generator the person's own results fill the whole canvas edge to edge (justified rows, 2px gutters, newest first), and the composer floats over them, docked at the bottom with a layered drop shadow [measured]. Hovering a result shows *next steps* along its bottom edge (Reference, Animate ▾, Create 3D scene ▾) plus the icon column [measured]. Cinema Studio's "My generations" shows the same items, so history is shared across tools [observed]. With no history the tab falls back to How it works [observed].
  - **Why it works:** results are not an archive; each one is a starting point for the next action, one hover away.
  - **SOCIA:** every published post in Analytics or "Worth posting again" should carry its next steps on hover or in its row (Repurpose, Use as starting point, Plan again), not only behind a detail page.
- **The form follows the model, signed in too** [observed]: GPT Image 2 shows Aspect (Auto), Quality (High), Resolution (2K) and batch; Nano Banana Pro shows Aspect 3:4, Quality 1K, batch and a "Draw" chip, with no separate Resolution. Switching the video model to Genjutsu rewrote the panel completely: a Motion transfer / Objects swap segment, a reference-video dropzone that states its limit ("4 to 30 seconds"), "up to 30 images" for characters, Style (New) with Apply, Prompt turned into an optional switch, Quality 720p, a "Use free gens" switch with a remaining count, and the results tabs changed to History / Motion Library / Styles / How it works. Marketing Studio's Video mode removed the Avatar slot and changed the placeholder.
- **Optional is labelled, required is implied.** Audio marks optional fields with a small "Optional" tag (10px/500 grey on a white-5% pill) instead of asterisking required ones, keeps a 0/500 counter on the voice description, and holds Generate disabled with `not-allowed` until the script exists [measured].
  - **SOCIA:** tag the optional fields in the composer and settings forms ("Optional"), keep counters on limited fields, and let the primary button lose its colour and its cost until the form is valid.
- **Smart defaults read "Auto"** across Cinema Studio's settings tiles (References 0/50, Film setup, Camera, Color palette, Lighting) [observed], confirming the signed-out finding.

### Empty states
- **What** [observed]: each library section has its own empty state, all with the same skeleton: a short title, one line explaining what belongs there, a preview of the filled state, and one CTA in white (not lime):
  - Projects: "Nothing here yet" over ghosted, fading project cards.
  - Elements: "No elements yet", a three-panel strip (create element → add to prompt box → use for consistency) with small UI illustrations, then "Create element".
  - Videos: stacked preview cards and "Start generating".
  - Profile: one empty block per section (projects, shots, blog), each with its own action.
  - Comments and notifications: icon plus one line.
- **Why it works:** the empty state explains the concept and shows the end state, so it doubles as onboarding for features people haven't met. White is the "create" colour; lime stays reserved for spending and upgrading.
- **SOCIA:** keep one empty-state anatomy everywhere (title, one-line purpose, a preview drawn from SOCIA's own UI, one action). Use the three-step strip only for concepts that need teaching (Brand Workspaces, Plan loop, AI Assistants).

### Settings, usage and subscription
- **Settings shell** [measured/observed]: a left list headed by the workspace name (Personal profile, All sessions, Gifts, Subscription, Usage, Promocode), 200×36 rows with 12px radius; each item has a different coloured icon tile. A rotating card at the bottom offers help ("Answers on billing, credits, and account" → Help Center) or the community. Content is a centred column (~736px) of cards on `#18191c` with a 24px radius.
- **Profile page:** a Credits card (balance, % of the pool, Top-up, Learn more) beside a Usage history card holding a 30-day mini chart: 30 columns, zero days drawn as 4px dots and active days as 4px-wide rounded bars, with "See all" [measured]. Below: stat tiles with an empty state, an "Auto-publish new generations" switch with a one-line explanation of the default visibility, language, and account deletion as its own row [observed].
- **Usage page** (`/me/settings/usage`) [measured]:
  - a header with Refresh and a date-range menu (Today, Last 7 days, Last month, Last 3 months, Last 6 months, Last year, All time, Custom)
  - "Spend overview": four 177×64 tiles (total cost in money, credits spent, features used, total generations) and an 8px share bar split by feature with a legend
  - "Usage history" table with a row count badge: credit amount (underlined, opens the item), feature and action columns whose *headers are the filters* ("All features ▾", "All actions ▾"), date with time, a status pill; 51px rows on 1px white-4% dividers; footer with "Show 25", "Page 1 of 1" and prev/next
- **Subscription page** [observed]: everything billing on one scrolling page: plan card (name, one line, lime Upgrade), credits card ("Monthly credits left N / M", a 4px bar drawn in the promo pink when low, Buy credits), unlimited-models tiles including a "saved in total" money figure, an empty state, unlimited-access history, pending invoices, payment methods and billing information. It loads with skeletons shaped like each card and table [observed].
- **Why it works:** usage is answered at three depths: a glance (the 30-dot chart), a summary (four tiles and a share bar), and the ledger (a filterable, paginated table where every charge links to the thing it bought). Putting money next to credits translates the abstract unit. Column-header filters keep the toolbar empty.
- **SOCIA:** a Settings → Usage page for AI features: tiles for this period (captions generated, videos made, plans generated, % of allowance), a share bar by feature, and a ledger table (what, when, which brand, link to the result) with header filters and the same date presets. SOCIA's Billing page can follow the one-page structure (plan, allowance, invoices, payment method, billing details) on top of Stripe's portal. Zero days as dots, not missing bars, matches the real-data rule. Keep SOCIA's single icon style in the settings list rather than multi-coloured tiles.

### Notifications
- **What:** only the studio shell has a bell (bottom of its sidebar, next to the account row) [observed]. It opens a 400px panel anchored bottom-left (16px radius, `#23262a`, 1px white-6% border, `role=dialog`) that first renders skeleton rows, then a header type menu (All, Collaboration, Social, System), tabs All / Requests / Unread, and "No notifications yet" [measured]. The rest of the app uses toasts in polite live regions; three separate toast regions were mounted at once [measured].
- **Why it works:** two independent filters (type and state) let "Requests", the items that need an answer, be pulled out from the feed.
- **SOCIA:** the bell inbox can split approvals out the same way: a "Requests" tab for items awaiting the person's approval, an "Unread" tab, and a type filter (Alerts, Approvals, System). One toast region only.

### Phone, signed in
- **What** [observed/measured]: the header becomes a sidebar toggle, a centred logo and a lime "Upgrade" pill. The drawer holds 8 destinations at 44px (Create first, highlighted; MCP with a Connect button; Assets last), a "Recent Chats" list ("No chats yet") and an account row at the bottom with the credit count and Upgrade. Assets on a phone shows an honest gate: "Mobile access coming soon", one line saying it's desktop-only for now, a preview of the desktop screen and "Got it".
- **Why it works:** 22 desktop destinations collapse to 8 on the phone; the gate tells the truth instead of rendering a broken grid.
- **SOCIA:** when a screen isn't usable at phone width (complex editors, the Content Studio timeline), say so with a preview and a link back, rather than shipping a cramped version.

### Signed-in tokens (extract-styles on Subscription, Assets and the image generator)
- **Type:** Inter (+ Inter Display 900 loaded). App scale 10/12/14/16/18/24px with 14/20 dominant; weights 400, 500, 600 and 700 only; page titles 20–24px/600 [measured].
- **Surfaces:** page `#0f1113`, cards `#18191c`, tiles and menus `#1c1e20`/`#1c1e21`, panels `#23262a`; fills in white at 5–15% for hover and selected [measured].
- **Radius:** 8px dominates controls (×22–38), 6px on small chips and checkboxes, 12px on nav rows and menus, 16px on tiles and panels, 20px on the account menu, 24px on settings cards [measured]. The growth-with-size rule holds.
- **Motion:** 0.2s `cubic-bezier(.4,0,.2,1)` on almost everything, some 0.3s ease-in-out on size changes, tiles `pop-in 0.2s`, the header promotion reveal 0.3s ease-out, a 0.2s border-radius transition on tiles [measured].
- **Icons:** 14–16px in chrome, 20–24px in headers and empty states [measured].

## What makes it feel premium
- **One accent with one job.** Lime means "act" or "selected"; everything else is greyscale, so the eye always finds Generate [measured].
- **Depth from material, not glow.** In the app chrome, inset 1–2px highlights and fill steps (`#131517` → `#1c1e20` → `#23262a`) do the work of shadows [measured].
- **A real token ladder.** Radius, duration and easing are named steps, and radius grows with the element. Spacing sits on a 4px grid with 4px-aligned line heights [measured].
- **Media does the decorating.** In the app, the content (previews, results) is the only colour and motion. The chrome stays still [observed].
- **Fast, specific feedback:** a 0.1s hover overlay, 0.2s colour, and 0.26s ease-out-quart on indicators [measured].
- **Every result is a starting point (signed in).** Next-step actions sit on each history tile and in each item's inspector, and the viewer switches to an editor in place [observed]. The product never makes a finished item a dead end.
- **Usage answered at three depths:** a 30-day dot chart, four summary tiles with a share bar, and a filterable ledger where each charge links to what it bought [measured].

## Weaknesses
- **Navigation overload.** 22 items sit in a single top bar, with Top/New badges, a "30% OFF" tag on Pricing and a dismissible discount banner above it [measured]. Destinations mix product modes (Image, Video), models (Genjutsu), studios and marketing (Contests, Originals). There's no clear primary path.
- **Hype everywhere outside the app** [measured]:
  - all-caps Space Grotesk headlines up to 56px with gradient-clipped text
  - a lime glow shadow (`0 0 60px -12px` at 45%)
  - a promo stack about 11,700px long
  - five different discount badges on one pricing page
- **Four different composers** for the same job [observed]:
  - left panel (video)
  - bottom floating bar (image)
  - centred bar with format carousel (Marketing Studio)
  - chat (phone)

  What's learned on one screen doesn't carry over. Signed in there are also two app shells [observed]: the top-nav shell (generators, Assets, Settings) and a studio shell for Cinema Studio and Marketing Studio with its own left sidebar, product switcher, projects list, account row and notifications bell. Notifications exist only in the studio shell.
- **Ambiguous controls.**
  - The prompt-enhance toggle shows only an icon and "On"; its meaning is only in the field name `enhancePrompt` [measured].
  - The cost number has no unit, just a sparkle icon [observed]. Signed in, the only explanation is an info tooltip on "Credits" inside the account menu (it says the cost depends on model and settings and is shown before generating, and links to a how-credits-work page) [observed].
  - Preset names are truncated in uppercase ("BUILDING EXPLOS…") [observed].
- **Expert jargon as the main choice.** 40+ model names (Seedance, Kling, Wan, MiniMax…) sit in the primary picker [measured]. Newcomers must choose a vendor model before a goal.
- **Loading is inconsistent.** Generator and Assets routes show a blank screen with a lone spinner (2–3s signed out, often 5–10s signed in, though the hidden browser pane may have throttled it) instead of a skeleton of the panel [observed]. Elsewhere it gets it right: the phone Explore grid, the Settings and Subscription pages, the Cinema Studio composer and the notifications panel all render skeletons shaped like the final content [observed].
- **Accessibility gaps.** Only about 6 `:focus-visible` rules were found in readable stylesheets [measured], so keyboard focus is likely weak (inferred, not tab-tested). Phone composer icons are 32–36px, below 44px [measured]; the signed-in phone drawer rows are 44px [measured]. Reduced-motion handling is partial [measured]. The plan sheet's close button has no accessible name and Escape doesn't close it [measured/observed]. Hover actions on Assets tiles are 18px icon buttons, two of five unlabeled [measured].
- **Promotion inside the working app** [observed, signed in]: a promo banner above the header, a "30% OFF" tag on Pricing, "Go Premium" in the account menu, a low-credit toast, a promo card in the Cinema Studio sidebar, a "free generations" banner across the top of the image history, and a feature-announcement modal that interrupted the form after switching to a model ("New in …"). Each is reasonable alone; together they compete with the work.
- **Three readouts for one balance** [observed]: a dot meter with "N left" in the account menu, "N credits left · N% of maximum credit pool" on the profile card, and "Monthly credits left N / M" with a bar on Subscription (plus "N credits" in the phone drawer). Different units and framings for the same number.
- **Inconsistent validation** [measured]: the image composer's Generate is enabled with an empty prompt, while the item editor's Generate is disabled at 50% opacity until a prompt is typed.
- **Token sprawl.** Three parallel token namespaces hold duplicate values [measured], the same drift SOCIA has between its marketing site and app.

## Patterns relevant to SOCIA
| Pattern | Tag | SOCIA screen | Adaptation idea |
|---|---|---|---|
| Cost or allowance shown on the commit button, live, "—" when unknown | AI-INTERACTION, BILLING | Generate Caption, Make This Video, Plan These Posts | If AI use is metered, show "Uses 1 of 20 this month" (or the cost) inside or next to the primary button, updated as options change. Use "—" with a reason when it can't be known. Purple stays the only action colour. |
| Preset or format decides which fields appear | EDITOR, FORMS | Create Post composer, Content Studio | The platform and format choice (Reel, Carousel, Short, Trial Reel) drives the form. Hide fields that don't apply instead of disabling them, and keep limits visible (IG 5-hashtag cap, collaborator cap). |
| Label-over-value setting tiles; defaults named "Auto" | FORMS, AI-INTERACTION | Composer settings row, Make This Video, Look & sound | A compact grid of 40–48px tiles: 11px label in `--text-muted`, 13px value in `--text-primary`. "Auto · Tue 6:00 pm" for the history-backed best time, and a labelled placeholder when there's no history. |
| Visual picker opens in place of results, with the form still visible; state in the URL | EDITOR, NAVIGATION | Content Studio template and look picker; caption tone presets | Swap the preview area for the picker instead of a modal. Use `?pick=look`, so Back closes it. Show a short preview per option on hover, loaded lazily. |
| Option rows carry spec chips | FORMS | Platform/format chooser, model or voice choice | 10.5–11px chips on `--surface-muted` (for example "≤ 90s", "9:16", "5 tags") inside each option, so it's compared before it's picked. |
| Inspector: inputs beside outputs, then "use as starting point" | AI-INTERACTION, ANALYTICS | Worth posting again, Analytics top posts, Competitors | A side panel per post with uppercase section labels (WHAT WAS POSTED, DETAILS), key/value rows (format, time, length, hashtags) and one primary action, "Use as starting point", above the secondary actions. |
| Needs-based plan recommender with expected-usage meter | PRICING, BILLING | Pricing page, upgrade prompts | Ask for brands, platforms and posts per week, then recommend a plan and show usage against its real limits ("3 of 5 brands"). Translate limits into outcomes. Never invent numbers. |
| Empty state as a 3-step how-it-works with real examples | EMPTY-STATES, ONBOARDING | Content Studio, Calendar, Plan loop first run | Three numbered steps describing SOCIA's real flow, with small real previews where they exist. Text-first, no illustrations. |
| One composer on phones instead of a squeezed panel | MOBILE | Create Post and Generate Caption at phone width | Collapse to one input with a chip row (platform, time, media) and a send button. Keep the 16px input and 44px targets, which Higgsfield misses. |
| Named duration and easing tokens; radius grows with size | MOTION, ICONS | System-wide (globals.css) | Replace SOCIA's 0.15/0.18/0.2s mix with named fast/normal/slow tokens on the existing ease-out-quint. Set a radius rule: chips 6, controls 8, cards 12, popovers 14. |
| Icon tiles sized to their row (48px tile/24px icon in big menus, 40/16 in lists) | ICONS, NAVIGATION | Settings lists, AI Assistants, integrations list, "New" menus | Keep `.ai-s-ico` (30px/8px) for dense lists. Use a larger tile only for menu rows that carry a one-line description. Always lucide. |
| User-controlled density (card-size slider; layout and "split by date" in the library) | TABLES | Content Studio clips library, Analytics posts grid | A View menu on media-heavy collections: layout (grid or list, which SOCIA needs for data even though Higgsfield has no list), group by date, and a size step only if the grid is large. |
| Skeletons shaped like the final grid | LOADING | Analytics posts, Content Studio library | Masonry or grid skeletons sized like the real tiles. Avoid Higgsfield's full-page spinner on app routes; copy its settings pages, which skeleton every card and table. |
| Contextual upgrade: gated options marked before choice; choosing one opens an upgrade sheet titled with that feature, selection left untouched | BILLING, PRICING | Every `upgradeFor` CTA, plan-gated options in forms and menus | A small plan tag on the option ("Growth"), then SOCIA's upgrade sheet headed "Unlock <feature>" with the minimum plan from `FEATURE_MIN_PLAN`. Never apply half a gated choice. Fix Higgsfield's gap by marking every gated option, not some. |
| Allowance in the account menu: plan, meter, "what counts" tooltip; one threshold warning | BILLING, NAVIGATION | Account menu, AI features | Plan name, a thin bar of this month's AI uses, an info tooltip explaining what uses it, and one warning at ~80–90% with a single action. One readout and one unit everywhere (Higgsfield has three). |
| Usage page: date presets, summary tiles + share bar, ledger table with header filters and links to each result | ANALYTICS, TABLES, SETTINGS, CHARTS | Settings → Usage (AI usage), Billing | Tiles for the period, a share bar by feature, a table of every AI action (what, brand, when, link to result) with "All features ▾" style header filters, "Show 25" pagination. Zero days as dots in the mini chart. |
| One-page billing: plan, allowance, invoices, payment method, billing details | BILLING, SETTINGS | Settings → Billing | Sections in that order, each with its own empty state, loaded with shaped skeletons, Stripe portal links where SOCIA can't render the data itself. |
| Next-step actions on every result | AI-INTERACTION, ANALYTICS | Analytics top posts, Worth posting again, Content Studio outputs | On hover or in the row: Repurpose, Use as starting point, Plan again. A finished item is never a dead end. |
| Item drawer with Info / Edit / Comments tabs, deep-linked | EDITOR, AI-INTERACTION | Post detail, approvals | Info (what was posted, metrics, details), Edit (draft a new version), Comments (approval thread) in one drawer at `?post=<id>`. Swap only the tab body; no full-screen dim. |
| Library: left list with counts, date-grouped grid with per-group select, grouped Filter (Type / Activity), View menu for density | TABLES, NAVIGATION | Content Studio library, drafts, Calendar list view | Counts on the left list, date headers with select-all, Filter split into "what kind" and "what I did", a density control. Keep SOCIA's card radius. |
| "Optional" tags instead of asterisks; disabled primary loses its colour and cost until valid | FORMS | Composer, Settings forms, Make This Video | 10.5–11px "Optional" chip on `--surface-muted`; primary button greys and drops the usage figure until required fields are filled. |
| Notifications with a type filter and All / Requests / Unread tabs | NAVIGATION, MICROINTERACTIONS | Bell inbox (alerts + approvals) | "Requests" holds approvals waiting on this person; a type filter for Alerts, Approvals, System; one toast region, not three. |
| Honest phone gate for desktop-only screens | MOBILE, EMPTY-STATES | Content Studio editor, complex Settings at phone width | "Best on a larger screen" with a preview and a link back, instead of a cramped layout. |
| One empty-state anatomy across a library | EMPTY-STATES, ONBOARDING | Every SOCIA list | Title, one-line purpose, a preview of the filled state from SOCIA's own UI, one action. Use a 3-step strip only for concepts that need teaching. |

## Patterns NOT relevant to SOCIA
- **Vendor model pickers** (40+ named third-party models as the main choice). SOCIA's users pick goals and platforms, not model vendors. Any model choice belongs in settings, behind a sensible default.
- **Credits as a currency with promotions and discounts at the button.** SOCIA bills monthly plans ($19/$49/$99). Struck-through prices on actions would add noise unless SOCIA ever sells usage.
- **The community, contests and creator-ratings layer.** SOCIA isn't a social network for its users.
- **Custom SVG cursors over the sidebar.** A novelty that adds nothing to SOCIA's job.
- **Promo-first homepage sections** (giant uppercase titles, feature carousels, discount cards).
- **Promotion layered into the working app** (promo banner, sidebar promo card, "free generations" banner over the history, announcement modals on model switch). SOCIA's upgrade prompts stay contextual and single.
- **Gifts, promocodes, affiliate and karma/collab economies** in settings. SOCIA has no such economy.
- **A second app shell** for some studios. SOCIA keeps one shell and one navy sidebar.

## Do not copy
- Higgsfield's lime-on-near-black identity and pink discount badges.
- Uppercase Space Grotesk display type and gradient-clipped headline text.
- Glow shadows on CTAs, and the olive inset "pressable" edge on the lime button.
- Their custom icon set, logo and badge styles (slanted TOP/NEW tags).
- Their preset names, copy and taglines.
- The blurred-media backdrop of the shot viewer as a visual signature.
- Community media and any thumbnails.
- Layouts pixel for pixel (the 318px panel, the 120×80 Generate block, the 334px inspector, the 288px account menu).
- The dot-matrix credit meter as a visual signature, and the multi-coloured icon tiles in the settings list.
- Their plan sheet layout, plan names, promo copy and announcement modals.

SOCIA takes the mechanisms: cost at commit, preset-driven forms, label/value settings, previews in pickers, inputs beside outputs, a needs-based plan recommender, and from the signed-in app: contextual upgrade sheets, a usage page with a ledger, next steps on every result, an Info/Edit/Comments drawer, and Requests in the inbox. It renders them in its own tokens: Inter, purple used only as the action colour, lucide icons and the navy sidebar.
