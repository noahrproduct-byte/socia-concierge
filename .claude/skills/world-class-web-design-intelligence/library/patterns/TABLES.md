# TABLES

## The problem
SOCIA's comparison and breakdown tables must stay readable when dense and on phones: All brands, Competitors, post lists, spec-like detail lists.

## Approaches seen
- **Apple Compare** [measured]:
  - Self-labelling cells (value over caption), so there's no label column; 2 columns fit at 375px.
  - A headline band first.
  - An aligned dash plus screen-reader text for absence.
  - Sticky column pickers.
  - The selection lives in the URL and the tab title.
  - **Cost:** no "only differences" filter.
- **EnduroSat spec rows** [measured]:
  - Label and value at the same size: the label light and grey, the value weighted and right-aligned.
  - Rows grouped under uppercase micro-headings.
  - On phones, label and value stack.
  - **Cost:** no tabular numbers.
- **Framer** [measured]:
  - The winner row at full contrast, the others muted, with a small "Best" label.
  - Ranked rows with a bar inside each.
- **Metricool** [observed]:
  - A competitor row expands in place into KPIs and a trend.
  - A chart/table toggle per block.
  - Columns and CSV controls on lists.
- **Higgsfield** [measured]: user-controlled density (a thumbnail-size slider, a List/Grid toggle).

## Comparison
- **Apple's self-labelling cells** solve the phone problem without dropping comparison. That makes them better for SOCIA's comparison tasks than the one-column switchers seen elsewhere.
- **EnduroSat's single-size rows** suit detail lists, not comparisons.
- **Framer's contrast ranking** suits results tables (Trial Reels, the plan loop).

## SOCIA today
- All brands (Pro), Competitors, and post lists in Analytics.
- **Check:** current mobile behaviour and whether figures are tabular.

## Recommendation
- **Comparisons:** self-labelling cells with sticky column identity and state in the URL.
- **Detail lists:** same-size label and value rows, tabular numbers, grouped headings.
- **Results:** winner at full contrast, others muted but kept.
- **Lists:** expand rows in place, and offer a chart/table toggle where a chart exists.
- **Everywhere:** "—" with reason text, never 0.
