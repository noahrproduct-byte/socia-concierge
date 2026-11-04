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

## The method reel (`SociaMethod`)

A 63 s, 9:16 motion-graphics reel in eight chapters (hook, Meet SOCIA, five
steps, call to action) in the visual language of a reference creator reel:
blur-dissolve chapter transitions, two-beat titles, element-by-element builds,
one takeaway line per chapter. A deep narrator (ElevenLabs) tells the whole
product: connect, see what stands out (MCP as an option), the content plan,
Content Studio with the clip bin and the rater, scheduling that posts for you,
and the call to action. No music, by choice. It needs no captures.

```
npm run render:method        # → out/socia-method.mp4 (1080×1920, 30fps, 63.5s, voice + effects, week-free ending)
sh src/method/audio/master.sh out/socia-method.mp4 out/socia-method-final.mp4   # -14 LUFS, -1 dBTP
npx remotion studio src/method/index.ts
```

Every word and number lives in `src/method/script.ts`; the components in
`src/method/Method.tsx` and `src/method/ui.tsx` only lay them out. The numbers
are real: they were read from SOCIA's own MCP tools for the Salvo's Pizza
workspace (@salvoshermitage) on 2026-10-27 (30-day views and reach, top posts
vs the account's median, the weekly Content Plan). Re-read them before
publishing a new cut, and keep the source line under the hook cards.

## The agent reel (`SociaAgent`)

A 43 s, 9:16 reel in the style of Noah's second reference (the "Harvey" reel,
~/Downloads/Video-1457.mp4): one continuous narration take (Declan Sage), captions
that light up word by word, a persistent SOCIA dock whose badges climb, corner
chapter tags and counters, stamps on the key beats, and a blue middle act. Copy,
timings and data live in `src/agent/story.ts`; scenes in `src/agent/Agent.tsx`.
The creator in it (posts, draft, rater, best-time grid, the cat avatar in
`src/agent/avatar.png`) is an illustrative example and every panel says EXAMPLE;
the site reads "coming soon" (`SITE` in story.ts) until it is ready.

```
npm run render:agent         # → out/socia-agent.mp4
sh src/method/audio/master.sh out/socia-agent.mp4 out/socia-agent-final.mp4
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
