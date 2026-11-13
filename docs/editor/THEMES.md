# Themes: how a look is defined, applied and extended

A theme is one declarative object that fully describes an edit: typography, colour and look, motion, overlays, audio and pacing. Everything a themed cut does is derived from that object by `lib/studioClips/themes/apply.ts` and `autoEdit.ts`; the renderer (`components/studio/remotion/ClipComposition.tsx`) reads the resolved theme off the cut. Adding a theme is adding a JSON file. No rendering code changes.

## Files

| Path | What |
| --- | --- |
| `lib/studioClips/themes/schema.ts` | The `Theme` zod schema (the single source of truth for every field and its bounds), `parseTheme`, `deepMerge`, `deepDiff`, `withOverrides` |
| `lib/studioClips/themes/*.json` | The eight shipped themes |
| `lib/studioClips/themes/index.ts` | The registry (`THEMES`, `themeById`, `isThemeId`) |
| `lib/studioClips/themes/apply.ts` | `applyTheme`, `setThemeOverride`, `resetToTheme`, `resolveTheme`, `styleFromTheme` |
| `lib/studioClips/themes/autoEdit.ts` | The edit a theme makes from the raw footage (captions, dead air, hook, B-roll pacing and overlay, beat) |
| `lib/studioClips/motion.ts` | Keyframed motion inside a cut: zoom and pan with easing, punch-ins, shake, speed pieces |
| `lib/studioClips/look.ts` | The theme's grade as a plan of WebGL effects (colour, vignette, grain, chroma, scanlines) and letterbox |
| `components/studio/ThemesPanel.tsx` | The picker strip (cards on the person's own footage) and the compare grid |
| `components/studio/EffectsPanel.tsx` | Per-cut motion, stabilization, and the look sliders as theme overrides |
| `docs/editor-style/` | The house style every theme keeps to |

## The schema, briefly

```jsonc
{
  "id": "clean-minimal", "name": "Clean Minimal", "description": "...", "bestFor": "Any business.", "tags": ["clean"],
  "sample": { "title": "made fresh\nevery morning", "caption": "we start at 5am" },   // what the card shows
  "typography": { "font": "montserrat", "weight": 800, "sizeScale": 1, "letterSpacing": 0, "transform": "none",
                  "captionPosition": "lower", "align": "center", "maxWords": 4, "captionPreset": "classic",
                  "captionAnimation": "fade", "textBox": "none", "pill": false, "highlight": "#ffd400", "titlePreset": "hook_pair", "titleAnimation": "settle" },
  "color": { "primary": "#000000", "accent": "#ffd400", "text": "#ffffff", "captionBg": "#000000",
             "grade": { "contrast": 1, "saturation": 1, "warmth": 0, "vignette": 0, "grain": 0, "chroma": 0, "scanlines": 0, "letterbox": 0 } },
  "motion": { "zoom": { "kind": "in", "from": 1, "to": 1.05, "ease": "inOut" }, "punchIn": 0, "shake": 0,
              "transition": "fade", "transitionFrames": 8, "brollSec": 2.5, "beatSync": false, "alternateZoom": false },
  "layout": { "lowerThird": "none", "progressBar": false, "watermark": false, "intro": "title", "outro": "none", "frame": "none", "dateStamp": false },
  "audio": { "mood": "none", "duck": 0.4, "sfx": false },
  "pacing": { "hook": true, "maxClipSec": 6, "silenceSec": 0.7 }
}
```

Every field is bounded in `schema.ts` (fonts to the registered faces, colours to `#rrggbb`, numbers to sane ranges). `lib/studioClips/themes/themes.test.ts` parses every file, so a bad theme fails the test run, never the editor.

## What applying a theme changes, and what it keeps

`applyTheme(edl, theme, { words })`:

- Sets `edl.style` from the theme (font, accent, text background, caption position, size, pill, case, caption style, highlight, animation).
- Sets every join to the theme's transition (`cut` removes the transition) and its length (`transitionFrames`, read by `lib/studioClips/timeline.ts`).
- Gives every unlocked cut its `motion` (the slow move, alternating in and out on the fast themes, with the cut's reframe focus as the origin; punch-ins where the emphasised caption words are said; shake). A cut whose motion the person set by hand has `motion.locked` and is left alone.
- On the talking-head themes, sets `punches` at sentence ends so the frame steps in and out as the speaker moves on.
- Gives the opening line the theme's title look (`titlePreset`), words unchanged.
- Turns music ducking on when `audio.duck < 1`.
- Writes `edl.theme = { id }`.

It keeps: the trims and order of every cut, the words of every line, captions on or off, the end card's words, the lower third's words, the music and voiceover, the measured per-clip corrections (`edl.finish`).

`autoEdit(edl, theme, { clips, words, beat })` runs after `applyTheme` when a theme is picked in the editor:

1. Captions on where there is speech.
2. Dead air trimmed out of speech at `pacing.silenceSec` (a breath kept either side; text lines move with the footage).
3. When `pacing.hook` is on, the strongest spoken line (a short sentence with a number, a question or a hook word, else the first short sentence) becomes the opener as its own cut, and the opening line takes its words unless the person already wrote one. Never invented: it is a sentence that was said.
4. On the talking-head themes (`motion.alternateZoom`), silent shots leave the main track and become `edl.broll` over the speech, so the voice runs unbroken.
5. Silent shots trimmed to `motion.brollSec` (never below a usable cut).
6. Cuts moved onto the music's beat when `motion.beatSync` and a beat is known.
7. Jump cuts (two pieces of one clip back to back) alternate a small punch-in.

Everything it decides is ordinary EDL data: cuts, text lines, B-roll items, motion. The timeline and the tabs edit all of it.

## Overrides

A person's change on top of a theme (Captions, Effects look, Transitions, Adjust) goes through `setThemeOverride(edl, patch)`: the patch is merged into the theme, bounded by the schema, the cut is re-styled from the result, and only the difference from the shipped theme is stored as `edl.theme.overrides`. `resetToTheme` drops the overrides and unlocks every cut's motion. `resolveTheme(edl)` is the theme the renderer uses: the shipped one with the overrides laid over it.

A cut without `edl.theme` (made before themes existed) keeps its own `edl.style`; the Captions and Adjust tabs then write to `style` directly, as before.

## Rendering

The composition reads `resolveTheme(edl)` once and:

- adds the look (`lookPlan`) as `@remotion/effects` passes on every video: `colorCorrection` (contrast, saturation, warmth), `vignette`, `noise` (grain, re-rolled every other frame), `chromaticAberration`, `scanlines`; these run in the Player and in the browser render alike;
- draws letterbox bars, the progress bar, the lower third (`tag`, `pill` or `bar` in the theme's accent), the camcorder corner (REC and the running time, never an invented date), the brand mark in the watermark slot when one is given;
- brings text lines in the theme's way (`typography.titleAnimation`: pop, rise, wipe or the soft settle), keeps captions above a lower third and hides the camcorder stamp while a title is up;
- animates caption pages per `style.captions.animation` (`none`, `pop`, `rise`, `fade`, `typewriter`, `bounce`) and colours the key word of each page;
- plays a cut sound on every join when `audio.sfx` is on (`public/editor-sfx/whoosh.m4a`, synthesized with ffmpeg);
- applies each cut's motion as one CSS transform (`motionAt` + `transformCss`), its speed as constant-rate pieces (`speedPieces`), and the stabilized copy when the cut asks for one and it exists.

The export uses the same composition and the same props builder (`lib/studioClips/renderProps.ts`); `lib/studioClips/parity.test.ts` compares the preview's and the export's plan frame by frame.

## Adding a theme

1. Copy `lib/studioClips/themes/clean-minimal.json` to `lib/studioClips/themes/<id>.json`, change `id`, `name`, `description`, `bestFor`, `tags`, `sample`, and the values you want. Keep to `docs/editor-style/SOCIA_EDITOR_STYLE.md`: captions 2 to 4 words, a key-word highlight, a line on screen from the first second, cuts by default outside sports.
2. Import it in `lib/studioClips/themes/index.ts` and add it to `THEMES`.
3. Run `npx vitest run lib/studioClips/themes` (the schema test parses it) and open `/dev/studio-lab?screen=editor&theme=<id>` to see it on the sample clip.

A new font needs its face in `public/fonts/editor` (`scripts/fetch-editor-fonts.mjs` adds a family to the manifest) and its id in `FONTS` (`lib/studioClips/style.ts`). A new caption animation is a case in `CaptionPage`; a new overlay is a layer in the composition keyed off a new `layout` field in the schema.

## Decisions made on the way

- Fonts are self-hosted woff2 files under the SIL Open Font License, loaded with the FontFace API, instead of `@remotion/google-fonts`, so an export never waits on Google Fonts (the intro film still uses the Google loaders).
- The watermark slot shows SOCIA's own mark on the SOCIA Brand theme only. An account's logo is not stored anywhere the editor can read yet, so other themes leave the slot empty rather than show a placeholder.
- The Retro theme's date stamp is REC plus the running time, not a date: a fabricated date would be invented data.
- Stabilization is a server job (`lib/studioClips/stabilize.ts`, ffmpeg vidstab) because the browser's ffmpeg.wasm core ships without vidstab and the export runs in the browser; the preview and the export both play the stabilized copy, so they match.
- A speed ramp is rendered as constant-rate pieces (ramp in, body, ramp out), since the media tag plays one rate per sequence; the ramp is a two-step ease rather than a continuous curve.
