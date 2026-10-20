# Higgsfield

- **URL(s):** https://higgsfield.ai/ (home), /ai/video, /ai/image, /marketing-studio, /generate (Cinema Studio), /community, /community/generations (shot viewer), /pricing, /explore and /start/agent (phone)
- **Category:** AI creative tool (video and image generation) with a community gallery; consumer/prosumer web app, dark UI only
- **Studied:** 2026-10-19
- **Tags:** AI-INTERACTION, EDITOR, FORMS, PRICING, BILLING, NAVIGATION, EMPTY-STATES, ONBOARDING, LOADING, MOTION, MOBILE, ICONS, TABLES, ANALYTICS

## Coverage
| Area | Inspected? | How | Notes |
|---|---|---|---|
| Marketing homepage | yes | browser 1440px (screenshots + DOM) and 375px (screenshot) | Desktop page is about 11,700px of promo sections. At 375px the homepage redirects to `/explore`, a different "Creation Hub" layout. |
| Video generator (`/ai/video`) | yes | browser 1440px, screenshots + DOM; preset picker, model popover and preset selection exercised | Public without sign-in. Nothing was generated; Generate was never pressed. |
| Image generator (`/ai/image`) | partly | DOM only | The browser pane was hidden for part of the session, so there's no screenshot and the aspect-ratio menu couldn't be opened. |
| Marketing Studio, Cinema Studio | partly | DOM only | Structure and control anatomy only. `/gallery/all` (Library) redirects signed-out visitors to Cinema Studio. |
| Community feed + shot viewer | yes (DOM) | DOM, shot modal opened | Prompt, details and actions are all public. No screenshot. |
| Pricing | yes (DOM) | DOM + extract-styles | Includes the plan recommender. No screenshot. |
| Phone width | yes | 375px screenshots + DOM | `/ai/video` redirects to a chat-style `/start/agent` composer. |
| States (hover, menus, focus) | partly | Mega-menu hover (screenshot), model popover (DOM), preset picker (screenshot) | Keyboard focus not tab-tested; focus CSS read from stylesheets. Hover-to-play previews couldn't be confirmed because the page reported `visibilityState: hidden`. |
| Motion | measured, not watched | extract-styles + root tokens | Durations, easings and keyframe names are measured. Live playback not observed. |
| Signed-in product | no | needs sign-in and credits | Not seen: generation progress/queue, finished result view, History list with filters, Library/Assets, credit balance and top-up, settings, billing management, error states (failed generation, out of credits). |
| Light theme | n/a | | Dark only. No theme toggle found. |

**Screenshots from Noah would fill:** a generation in progress (queued, then progress) and its finished result with actions; the History list and grid with Filter open; Library/Assets; the credit balance, top-up and billing screens; an "insufficient credits" or failed-generation error.

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
1. **Cost on the commit button, before the commit.** The Generate button carries the credit price of the current configuration (`Generate ✦ 80`). The price updates as settings change: picking a cheaper preset dropped it from 80 to 10 [observed]. When it can't be computed yet, it shows a dash (Marketing Studio: `GENERATE —`) [measured]. A discount shows as a struck-through old price next to the new one (8.5 → 6.5) [measured].
   - **Why it works:** the price sits exactly where the decision is made, so there's no surprise and no hunting for a pricing page. Live recalculation teaches which settings are expensive without any explanation. The dash for "not computable yet" is honest, not a fake zero.
   - **For SOCIA:** relevant wherever AI work is metered or limited (Generate Caption, Make This Video, Plan These Posts). Show the cost or remaining allowance on the action itself, and use "—" with a reason when it's unknown. This matches Noah's real-data rule.
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
- **History controls:** a thumbnail-size slider and a List/Grid toggle, so the person chooses the density [measured: controls exist; signed-in behaviour not seen].
- **URL-backed overlays** (`?select=preset`, `?shot=`): back closes them and links can be shared [measured].

## Best UX patterns
- **The empty state is the tutorial.** Signed out, the results area shows three numbered steps (add image, choose preset, get video), each with a real example visual, under a one-line headline [observed]. The empty canvas teaches the flow it will later display.
- **Smart defaults stated as "Auto"** (Cinema Studio camera, lighting, palette, film setup) [measured].
- **Example-first prompts.** Placeholders are concrete requests, not "Enter prompt", and `@` pulls in saved characters, locations or products [measured].
- **Counters show limits early:** `References 0/50`, batch `1/4` [measured].
- **On phones, one composer.** Phone visitors get a single chat-style composer [measured]:
  - the input is 16px, which avoids iOS zoom
  - a `+` button for references
  - a model chip and a settings icon
  - a lime send pill that shows the cost

  The full panel is replaced instead of squeezed.

## What makes it feel premium
- **One accent with one job.** Lime means "act" or "selected"; everything else is greyscale, so the eye always finds Generate [measured].
- **Depth from material, not glow.** In the app chrome, inset 1–2px highlights and fill steps (`#131517` → `#1c1e20` → `#23262a`) do the work of shadows [measured].
- **A real token ladder.** Radius, duration and easing are named steps, and radius grows with the element. Spacing sits on a 4px grid with 4px-aligned line heights [measured].
- **Media does the decorating.** In the app, the content (previews, results) is the only colour and motion. The chrome stays still [observed].
- **Fast, specific feedback:** a 0.1s hover overlay, 0.2s colour, and 0.26s ease-out-quart on indicators [measured].

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

  What's learned on one screen doesn't carry over.
- **Ambiguous controls.**
  - The prompt-enhance toggle shows only an icon and "On"; its meaning is only in the field name `enhancePrompt` [measured].
  - The cost number has no unit, just a sparkle icon [observed].
  - Preset names are truncated in uppercase ("BUILDING EXPLOS…") [observed].
- **Expert jargon as the main choice.** 40+ model names (Seedance, Kling, Wan, MiniMax…) sit in the primary picker [measured]. Newcomers must choose a vendor model before a goal.
- **Loading.** Generator routes show a blank screen with a lone spinner for about 2–3s instead of a skeleton of the panel [observed]. The phone Explore grid does use masonry-shaped skeletons [observed].
- **Accessibility gaps.** Only about 6 `:focus-visible` rules were found in readable stylesheets [measured], so keyboard focus is likely weak (inferred, not tab-tested). Phone composer icons and the menu button are 32–36px, below 44px [measured]. Reduced-motion handling is partial [measured].
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
| User-controlled density (size slider, List/Grid) | TABLES | Content Studio clips library, Analytics posts grid | A List/Grid toggle on media-heavy collections. A slider only if the grid is large. |
| Skeletons shaped like the final grid | LOADING | Analytics posts, Content Studio library | Masonry or grid skeletons sized like the real tiles. Avoid Higgsfield's full-page spinner on app routes. |

## Patterns NOT relevant to SOCIA
- **Vendor model pickers** (40+ named third-party models as the main choice). SOCIA's users pick goals and platforms, not model vendors. Any model choice belongs in settings, behind a sensible default.
- **Credits as a currency with promotions and discounts at the button.** SOCIA bills monthly plans ($19/$49/$99). Struck-through prices on actions would add noise unless SOCIA ever sells usage.
- **The community, contests and creator-ratings layer.** SOCIA isn't a social network for its users.
- **Custom SVG cursors over the sidebar.** A novelty that adds nothing to SOCIA's job.
- **Promo-first homepage sections** (giant uppercase titles, feature carousels, discount cards).

## Do not copy
- Higgsfield's lime-on-near-black identity and pink discount badges.
- Uppercase Space Grotesk display type and gradient-clipped headline text.
- Glow shadows on CTAs, and the olive inset "pressable" edge on the lime button.
- Their custom icon set, logo and badge styles (slanted TOP/NEW tags).
- Their preset names, copy and taglines.
- The blurred-media backdrop of the shot viewer as a visual signature.
- Community media and any thumbnails.
- Layouts pixel for pixel (the 318px panel, the 120×80 Generate block).

SOCIA takes the mechanisms: cost at commit, preset-driven forms, label/value settings, previews in pickers, inputs beside outputs, and a needs-based plan recommender. It renders them in its own tokens: Inter, purple used only as the action colour, lucide icons and the navy sidebar.
