# CHARTS

## The problem
SOCIA's charts must show trends and causes (what was posted, what moved) without decoration and without exaggerating.

## Approaches seen
- **Metricool: output overlaid on outcome.**
  - The follower line is drawn over daily bars of posts, reels and stories, which invites "I posted, followers moved" reading without claiming causation. [observed]
  - **Cost:** a truncated follower axis exaggerates growth; the bars have no scale.
- **Metricool: best-time heat painted into calendar slots** (see CALENDAR.md).
- **EnduroSat: legend inside the KPI label.**
  - A coloured dash before each KPI label matches its line.
  - Markers sit on the curve at the current value; the nearest axis tick turns bold.
  - Highlight one series, mute the rest. [observed]
  - **Cost:** a smooth curve implied continuity over 4 discrete price tiers.
- **Framer: proportional bars inside list rows; sparse axis labels** (start, end, peak). [measured]
  - **Cost:** the mock bars aren't proportional.
- **ElevenLabs: 1.5px series lines,** a very pale area fill, and a tabular hover readout. Colour only for data. [measured]
- **ElevenLabs kit: waveform bars that double as the scrubber** (see EDITOR.md).

## Comparison
- **Agreement:** remove the legend lookup (Metricool and EnduroSat), keep the chrome neutral, and annotate sparsely.
- **The honesty lesson appears three times:** Metricool's truncated axis, Framer's fake bar lengths, EnduroSat's smooth curve over discrete data. SOCIA must guard against all three.

## SOCIA today
- Recharts-style charts with `--chart-grid`, `--chart-axis` and a dark tooltip.
- **Check:** whether any axis is truncated without being marked, and whether series can be toggled from their KPI.

## Recommendation
- **The KPI header is the legend.** Toggle a series by clicking its KPI, and show a hover marker on each series.
- **Highlight one series:** the rest drop to `--chart-axis` grey.
- **Published posts:** shown as a thin neutral band under the audience line, with counts.
- **Axes start at zero, or are visibly marked as truncated.** Bars are linear and zero-based. Discrete data is drawn as steps or points, never as a smooth curve.
- **Labels:** only the endpoints and the peak; exact values in the tooltip.
