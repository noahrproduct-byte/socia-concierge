# ICONS

## The problem
SOCIA's lucide icons should stay one consistent family, with sizes and meanings that never vary by page.

## Approaches seen
- **Apple** [observed and measured]:
  - On cards, a chevron means "navigates away" and a plus means "opens in place".
  - Icons sit in 36px circles on cards.
  - Strokes are uniform and light.
- **Higgsfield** [measured]:
  - A custom set on a 24px grid at 1.5 stroke.
  - Icon tiles sized to the row: 48px tile with a 24px icon in descriptive menus, 40px with 16px in lists.
  - Icon-to-label gap: 12px in rows, 6px in chips.
- **ElevenLabs** [measured]:
  - The component kit uses lucide at 16px with stroke 2, the same family as SOCIA.
  - A 44px hit area around a 12px remove icon.
- **Framer** [measured]: duotone sprites; the active rail icon is at opacity 1, inactive ones at 0.5.
- **Metricool** [observed]: calendar cards pair the network mark with a post-format glyph. **Cost:** it's on Font Awesome.

## Comparison
- **Every strong reference keeps one icon family and one stroke weight.**
- The transferable ideas aren't styles but rules:
  - icons mean the same thing everywhere (chevron vs plus);
  - tile size follows the row's density;
  - hit area is independent of icon size;
  - the active state is shown by opacity or colour, not by a different icon style.

## SOCIA today
- lucide everywhere (110 files): mostly 12–15px, 17px with stroke 2 in the sidebar; `.ai-s-ico` tiles are 30px with an 8px radius.

## Recommendation
- Stay on lucide.
- `ChevronRight` = navigates; `Plus` / `Maximize2` = opens in place.
- Icon tiles: 30px in dense lists, about 40px only in rows with a description line.
- Format glyphs at 12px beside platform marks.
- Hit areas of 44px or more around small icons.
- One stroke per size class (2 at 17px or more; keep lucide's default at smaller sizes).

## Added from the logged-in apps (2026-10-19)
- **Correction (ElevenLabs):** the signed-in app uses its own icon set at 18px in the sidebar, not lucide. Only the open-source component kit uses lucide. [measured]
- **Framer app:** 12px icons at stroke 1.5 in rows (`#888` when inactive, white when active), 20px icon boxes in toolbars, 8px dropdown chevrons. [measured]
- **Metricool app:** Font Awesome light and regular at 12/14/16px in controls, and a 64px light icon in empty states. [measured]
- **Higgsfield settings:** each settings item has a different coloured icon tile. Don't adopt this; it breaks the "colour means data or action" rule. [measured]

**Confirms:** every app keeps one icon family, at a **fixed size per context** (row, toolbar, empty state). SOCIA's lucide sizes already fit this; write the per-context sizes down as tokens.
