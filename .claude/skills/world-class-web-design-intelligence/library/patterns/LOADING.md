# LOADING

## Approaches seen
- **Higgsfield** [observed]:
  - The phone Explore grid uses masonry-shaped skeletons.
  - **Cost:** generator routes show a blank screen with a lone spinner for 2–3s.
- **ElevenLabs** [measured]:
  - A restrained shimmer on AI status text (a 2s sweep with a 0.5s pause), only while visible.
  - A 2s pulse for skeletons.
- **Framer** [measured]: chrome that depends on a slow lookup fades in once resolved instead of flashing a default.

## Recommendation for SOCIA
- **Skeletons shaped like the final layout:** tiles, rows and grids.
- **No full-page spinners on app routes.** SOCIA's `(app)` skeletons already follow this.
- **AI status:** a low-contrast text sweep on the status label only (no glow, no colour), paused off-screen and under reduced motion.
- **Real step text** for long jobs (see AI-INTERACTION.md).

## Added from the logged-in apps (2026-10-19)
- **Metricool:**
  - Every full page load shows "Loading, please wait…" on a grey screen, with no skeleton. [observed]
  - KPI cards each carry a 2px loading bar along their top edge, so each card shows its own state. [measured]
- **Higgsfield:** mixed. Generators and Assets use spinners; Settings, Subscription and notifications use skeletons shaped like their cards and rows. [observed]
- **ElevenLabs:** full navigations showed a blank page for a few seconds; the breadcrumb shimmers "…" until its data arrives; images load blurred first. [observed in a background pane, so the timing is unreliable]

**Confirms:** SOCIA's route skeletons are already better than all three. The useful addition is a **per-card** loading indicator for cards that refresh on their own (KPI tiles that re-sync).
