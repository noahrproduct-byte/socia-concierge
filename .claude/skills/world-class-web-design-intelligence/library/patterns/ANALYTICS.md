# ANALYTICS

## The problem
SOCIA's Analytics and Dashboard must make a creator's real numbers readable at a glance. Each number needs its reference point (previous period, the account's median, another platform), and anything unknown must stay honest.

## Approaches seen
### Metricool: KPI card = legend = toggle; one comparison rule
- Result cards are filled with their series colour and toggle that series; a hidden series fades but keeps its value. [observed, help docs]
- Every % compares with the previous equal-length period and is omitted when that period doesn't exist; hover shows the absolute change. [observed]
- **Costs:**
  - Comparing against a custom range opens a separate tool.
  - Unconnected networks show "0".
  - Sections with no data hide silently.

### Apple (Compare): headline band first, self-labelling cells
- A "Quick Look" band of value-over-caption metrics comes first, grouped detail after.
- Every cell carries its own caption, so there's no label column.
- Absence is an aligned dash with screen-reader text. [measured]

### Framer (Analytics mock): KPI row + ranked lists with bars inside rows
- A five-KPI row (12px label, 20px/600 value).
- Breakdown panels are lists of 30px rows, each with a proportional bar behind it, and a dimension switcher in the panel header. [measured]
- The winner row is at full contrast, others muted, and the baseline delta is "—".
- **Cost:** their demo bars aren't to scale.

### EnduroSat: the formula sits beside the metric
- A derived number (cost per GB) is shown with its definition and a reference (the "traditional" figure). [observed]
- KPI labels carry the legend dash for their chart line.

### ElevenLabs: colour only in data
- The chrome is colourless, so chart series are the only saturated pixels.
- 1.5px lines over very pale area fills, with a tabular hover readout. [measured]

## Comparison
- **Agreement:** one comparison rule, applied everywhere; numbers paired with a reference point; colour reserved for data; tabular figures.
- **Differences:**
  - Metricool puts comparison in hover, Apple in layout (aligned columns), EnduroSat in a definition line. They complement each other: layout for the main comparison, hover for exact deltas, a definition for derived metrics.
  - Metricool's fragmentation (Analytics vs Studio vs Reports) is the anti-pattern to avoid.

## SOCIA today
- KPI tiles (KpiCard, AnalyticsV3), period comparison on Starter+, an "All brands" tab (Pro), Posting Times and Growth tabs, and "—" for unknowns.
- **Check before changing:** whether every derived metric has a definition, whether deltas show absolute change, and whether all figures are tabular.

## Recommendation
- **Tiles:** each tile shows the value, the delta vs an equal prior period ("—" when there isn't one), and a hover with the absolute change and the compared dates. The tile doubles as its chart's legend and toggle.
- **Definitions:** formulas sit behind an info control on derived metrics.
- **Breakdowns:** ranked lists with linear, zero-based bars inside the rows.
- **All brands and Competitors:** self-labelling cells.
- **Comparison stays in Analytics,** never in a separate tool.
