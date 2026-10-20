# Analysis checklist

Use the sections that apply to the product. Skip what the product doesn't have; don't pad. For every point, record **what** it does, **why it works** (the mechanism), and **whether it transfers to SOCIA**. Mark each as `measured` (from extract-styles.js or the DOM), `observed` (seen on screen) or `inferred` (reasoned).

## Visual system
- **Typography:** families, the type scale (how many steps, the ratio between them), weights in use, line heights, letter-spacing on labels and headings, tabular numbers for data.
- **Spacing:** the base unit (4 or 8), section rhythm, and the density of lists and tables (row height).
- **Colour:** neutrals and their hue bias, how many accents, what the accent is reserved for, how status colours are used, light vs dark theming, contrast.
- **Borders, shadows, radii:** what separates surfaces (border vs fill vs shadow), the elevation levels, and the radius scale (does radius grow with element size?).
- **Iconography:** see "Icons and components" below.
- **Imagery:** product screenshots, illustration or photography; how it's framed.
- **Density and hierarchy:** what the eye lands on first, second and third, and how emphasis is created (size, weight, colour, position, whitespace).

## Layout
- **Navigation:** structure (top bar, sidebar, both), grouping, how the active state looks, collapsed state, how a workspace or account switcher works.
- **Page structure:** header pattern, page-level actions, breadcrumbs, the content width.
- **Grids and cards:** when content is a card and when it isn't, and the card anatomy (header, body, footer, actions).
- **Dashboards:** KPI placement, how charts and tables share space, the filter bar.
- **Forms, modals, tables, settings:** their structure and how complexity is split up.
- **Responsive behaviour:** what collapses, what reorders, what gets hidden, and touch targets on phones.

## Interaction
- Hover, focus, pressed and disabled states; how visible the keyboard focus is.
- Transitions between states (open, close, expand, select).
- Menus, dropdowns, tabs and selectors: how they open, where they anchor, keyboard support.
- Scrolling: sticky headers, scroll-linked effects, virtualised lists.
- Loading (skeletons, spinners, optimistic UI), empty states, error states.
- Feedback after actions: toasts, inline confirmation, undo.
- Progressive disclosure: what's hidden by default, and how it's revealed.

## UX
- Information hierarchy: what the product thinks matters most on each screen.
- How complex features are made simple: defaults, presets, wizards, inline help.
- Onboarding: the first-run experience and time to first value.
- Calls to action: how many per screen, how primary and secondary actions differ.
- Feature discovery: how new or advanced features are surfaced without clutter.
- Error prevention: confirmations, validation timing, safe defaults, undo.
- User feedback and system status: does the person always know what's happening?

## Product design (where present)
Dashboards, analytics, editors and composers, publishing flows, calendars, search and command palettes, AI interactions (how AI output is presented, edited and trusted), settings, billing and pricing, integrations and connections.

## Icons and components
- **Icons:** library or style, stroke weight, sizes per context (nav, buttons, inline text, empty states), optical alignment with text, filled vs outline for active states, containers (bare, square tile, circle), icon-to-label spacing.
- **Buttons:** sizes, padding, radius, the primary/secondary/ghost/destructive variants, icon buttons.
- **Inputs, selects, toggles, checkboxes:** height, border, focus ring.
- **Tooltips, badges, status indicators:** shape, colour use, when they appear.
- **Cards, charts, menus:** anatomy, chart styling (gridlines, axes, tooltips, legends).

## Motion
- What moves, and why (does it communicate a change of state, a relationship or a direction, or is it decoration?).
- Durations and easing (measured where possible). Enter vs exit.
- State transitions: layout animation, cross-fades, shared elements.
- Reduced-motion handling.

## Always close the entry with
- What makes it feel premium (the specific mechanisms).
- Weaknesses (be concrete).
- Patterns relevant to SOCIA, with where in SOCIA they'd apply.
- Patterns not relevant to SOCIA, and why.
- What must not be copied (identity, assets, illustration style, copy, signature visuals).
