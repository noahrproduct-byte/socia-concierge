# SOCIA design baseline

What SOCIA is today, measured from the code (2026-10-19). Research is adapted onto this system; it's improved deliberately, never replaced at random. Re-measure (the commands at the end) before any large change, because this file can drift.

## Direction
- **Serious professional software for creators and small brand teams:** intelligent, polished, modern, responsive.
- **Slightly futuristic through behaviour:** live previews, responsive state changes, smart defaults, purposeful transitions.
- **Information-dense where it helps:** analytics-terminal, not marketing page. Clean hierarchy.

**Noah's standing rules:**
- Real data over pretty data: unknown is shown as "—" with a reason, never 0.
- Every control does something real.
- No AI-slop decoration: purple gradients, glass, glowing orbs, bento grids, every section in a card, giant heroes or type.
- No em dashes in user-facing copy.
- He doesn't want another cosmetic redesign. Fix structure and real problems.

## Tokens (app/globals.css `:root`, redefined under `[data-theme="dark"]`)
- **Surfaces:** `--background #f5f6fa`, `--surface #fff`, `--surface-muted #eef0f5`, `--surface-hover #f2f3f8`. These are cool, slightly blue-biased neutrals.
- **Sidebar:** dark navy (`--sidebar #0b101d`) in both themes. Its text is white at 64%, and the active item uses `--sidebar-active` (purple at 20%) with `--sidebar-active-text #b6acff`.
- **Text:** `--text-primary #0f1424`, `--text-secondary #5b6477`, `--text-muted #8a93a6`, `--text-disabled`.
- **Lines:** `--border #e3e6ee`, `--border-strong #cdd3df`.
- **Action colour:** `--primary #5b4bd6` (purple). It's for actions and the active state only, never decoration. Also `--primary-subtle` (10%) and `--primary-text`.
- **Status:** success, warning, danger and info, each with `-text`, `-subtle` and `-rgb` variants.
- **Charts:** `--chart-grid`, `--chart-axis`, and a dark tooltip (`--chart-tooltip-bg`).
- **Legacy aliases** (`--cobalt`, `--slate`, `--line`, …) still map onto these tokens. New code uses the semantic names.
- **shadcn names** map onto SOCIA tokens; `components/ui` has avatar, badge, button, card, dropdown-menu, separator and tabs.

## Typography
- **Inter** via next/font (`--font-sans`), with a system fallback.
- **Sizes in use** (count in globals.css): 12.5px ×261, 12px ×184, 13px ×181, 11px ×149, 11.5px ×139, 10.5px ×112, 13.5px ×88, 10px ×82, 14px ×73, 15px ×59, then 9.5, 9, 16 and 17px.
- **Weights in use:** 700 ×239, 750 ×217, 650 ×163, 600 ×151, 800 ×63, 500 ×33, 780 ×26, 550 ×18.
- **Labels:** uppercase section labels around 10.5–11px, weight 750, letter-spacing 0.1em (for example `.ai-s-label`, `.oa-sec h2`).

## Shape, depth and motion
- **Radius:** 999px/99px pills (×250, mostly chips, badges and toggles), 10px ×107, 8px ×97, 12px ×72, 9px ×58, 6px ×46, 14px ×42. `--radius` is 0.625rem.
- **Shadows** are mostly subtle: `0 1px 2px rgba(shadow, .04)`. The focus ring is `0 0 0 3px rgba(primary, .12)`. A few primary-coloured lifts sit on primary buttons.
- **Motion:** 0.15s ×146, 0.2s ×106, 0.18s ×58, 0.25s ×44. The signature easing is `cubic-bezier(0.22, 1, 0.36, 1)` (×96, an ease-out-quint), alongside some ease-in-out and ease-out.

## Icons
- **lucide-react** throughout (110 files). Never mix in another icon family.
- **Sizes:** 13 and 14px (×177 each) inline and in buttons; 12px (×147) in dense chips and labels; 15–16px for prominent actions; 17px with `strokeWidth={2}` in the sidebar.
- Icons sit inline with labels and use a 4–6px gap. Icon tiles (for example `.ai-s-ico`: 30px, 8px radius, `--primary-subtle` fill) mark list items.

## Known inconsistencies (candidates for improvement, not license to restyle)
- **The type scale is fragmented:** ten sizes between 9px and 13.5px, several only 0.5px apart. A tighter scale (around 6 steps) would strengthen hierarchy.
- **Weights are scattered** (500, 550, 600, 650, 700, 750, 780, 800). Fewer steps would make emphasis clearer.
- **The radius scale is loose** (6, 8, 9, 10, 12, 14px). A rule like "radius grows with element size" would make it systematic.
- **Durations vary** (0.15, 0.18 and 0.2s for similar transitions).
- The marketing site and the app are two systems, measured live on sociaos.com on 2026-10-19 with extract-styles.js:
  - **Marketing site:** Geist 500/600 headings (h1 36px, -1.15px tracking), a blue primary CTA (`#2563ff`) as a 999px pill with a blue glow shadow (`0 8px 26px rgba(37,99,255,.32)`), and text down to 8.5px.
  - **App:** Inter, with purple as the action colour.
  - Decide deliberately whether they should share one system before changing either.
- Any change to these must be made system-wide through tokens, never one page at a time.

## Re-measure
```bash
grep -hoE "font-size: *[0-9.]+px" app/globals.css | sed 's/ //g' | sort | uniq -c | sort -rn | head
grep -hoE "font-weight: *[0-9]+" app/globals.css | sed 's/ //g' | sort | uniq -c | sort -rn | head
grep -hoE "border-radius: *[0-9.]+px" app/globals.css | sed 's/ //g' | sort | uniq -c | sort -rn | head
git grep -hoE "size=\{[0-9]+\}" -- components app | sort | uniq -c | sort -rn | head
```
