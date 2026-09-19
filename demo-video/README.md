# SOCIA demo video

Product demo built entirely in code, cut to match the reference reel (a demo
playing on a MacBook filmed in a dark room, ~45s): Playwright records the **live**
app at socia-concierge.vercel.app (no mocked UI — every frame of product
footage is a real capture), Remotion composites the captures with callouts,
scan-sweep transitions and the end card.

```
npm install
cp .env.example .env         # DEMO_EMAIL + DEMO_PASSWORD (never committed)
npm run capture              # → captures/*.webm, captures/url-bar.png, captures/stills/*.jpg
npm run render               # → out/socia-demo-vertical.mp4 (1080×1920) + out/socia-demo-wide.mp4 (1920×1080)
npm run verify               # duration 30s ±0.2, no black frames at cuts
npm run studio               # Remotion Studio to scrub the timeline
```

## How capture works

`capture.ts` logs in, sets **Dark** in Settings (the account-level preference
wins over the device one, so it is saved via the same `/api/profile` call the
toggle makes), then records each clip with a CDP screencast — real Chrome,
1920×1080, every compositor frame with its timestamp. Frames are encoded to
60fps VP9 `.webm` with Remotion's bundled ffmpeg, and each clip's `meta.json`
keeps the timestamps plus event markers (`score-visible`, `fix-click`,
`send`, `answer-done`…). The Remotion comp addresses footage by source time
through those timestamps, so speed-ramps are exact rather than approximate.

Clips: `competitors-load`, `competitors-click` (falls back to a trajectory
toggle + scroll when only one competitor is tracked), `scorer` (`/scorer` →
Content Studio: upload `assets/sample.mp4`, extraction, analysis, score, one
"Jump to" fix), `dashboard`, `chat` (Ask SOCIA drawer), `url-bar.png`.

`--only=a,b` re-captures selected clips; `--smoke` records the public landing
page without logging in (pipeline test); `--stills-only` re-derives stills.

## Composition

- `src/reel/ScreenDemo.tsx` — the demo that plays on the laptop screen:
  kinetic title cards alternating with cropped, tilted UI cards from the real
  captures, a cursor hand clicking the real controls, tagline end card.
  `beats[]` at the bottom is the storyboard.
- `src/reel/Laptop.tsx` — the vertical master: a procedural CSS-3D MacBook
  in a dark room (warm LED strip, screen glow on the keys, handheld drift)
  with the screen demo perspective-mapped onto the panel, plus the
  TikTok-style caption (`caption` prop on the `SociaDemoVertical` comp).
- `SociaDemoWide` renders the screen demo full-frame at 1920×1080.
- `SociaDemoVerticalV1` / `SociaDemoWideV1` keep the earlier 30s
  storyboard cut (`src/Demo.tsx`).

`AUDIO_SRC` in `src/timeline.ts` is the audio slot (a file under `captures/`).
