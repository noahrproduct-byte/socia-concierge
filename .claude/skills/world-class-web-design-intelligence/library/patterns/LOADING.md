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
