# Content Studio video editor: architecture

How a video moves from upload to an exported file, as the code stands on
`origin/main` (Nov 2026). Every path is relative to the repo root. Read this
before touching the editor; `docs/editor-style/` is the house style every
edit must follow, and `docs/editor/THEMES.md` describes the theme system
built on top of what is here.

## Stack

| Layer | What |
| --- | --- |
| App | Next.js 15.5 (App Router), React 19, `reactStrictMode: true` |
| State | Plain React state in `components/studio/ClipBuilder.tsx` (no store library); undo/redo is a snapshot stack of whole `Edl` objects |
| Preview | `@remotion/player` playing `components/studio/remotion/ClipComposition.tsx` |
| Export | `@remotion/web-renderer` rendering the **same** composition in the browser (WebCodecs); no server render |
| Media decode | `mediabunny` (probe, scene scan, keyframes, WAV, shrink, render inspection) |
| ffmpeg.wasm | `@ffmpeg/ffmpeg` + self-hosted core in `public/ffmpeg` (`scripts/copy-ffmpeg-core.mjs`); used for noise reduction (`lib/studioClips/cleanSound.ts`) and upload compression |
| Server ffmpeg | `ffmpeg-static` (Node); used by the niche scan and by the stabilization job (`lib/studioClips/stabilize.ts`) |
| Transcription | AssemblyAI (`lib/transcribe/assemblyai.ts`), word-level timestamps, server-side job |
| AI | Anthropic through `lib/studioClips/analysis.ts` (clip cards, grouping, the first cut) |
| Storage | Supabase: bucket `studio-sources` (clips, keyframes, WAV, music, voice), bucket `scheduled-media` (exports), tables `studio_projects`, `studio_clips`, `studio_builds` |

Where heavy work runs:

- **Browser:** fingerprint, probe, scene scan, keyframes, WAV extraction, shrink over 45 MB, noise reduction, colour measurement, the preview, the export, the export inspection.
- **API route (Node):** registering clips, signed URLs, the Understand job (transcription + clip cards + grouping, `after()` with a 280 s budget), the first cut, regenerate, music, voiceover, stabilization.
- **Nothing on the edge.** No external worker.

## 1. Upload and ingest

Entry: `components/studio/ClipsStudio.tsx` (`onFiles`, `registerFile`, `uploadFile`). Several files at once are accepted (`accept="video/*"`, `multiple`); registration happens in order, then measurement and upload two at a time (`UPLOAD_CONCURRENCY`).

1. `fingerprintFile` + `probeClip` (`lib/studioClips/ingest.ts`): SHA-256 of size + three 1 MB samples; duration, width, height via mediabunny or a `<video>` fallback.
2. `POST /api/studio/clips` (`lib/studioClips/server.ts registerClip`): plan limits (`lib/studioClips/limits.ts`), duplicate check, reuse of an identical clip's analysis, inserts a `studio_clips` row (`status: registered`), returns the storage paths `<uid>/<project>/<clip>/source.<ext>`, `frames/<i>.jpg`, `audio.wav`.
3. `ingestClip`: scene scan at 160 px, keyframes at 480 px every 1.5 s (3 to 24), 16 kHz mono WAV, measured `ClipFacts` (luma, contrast, warmth, clipping, audio level, silences).
4. Files over 45 MB are re-encoded on the device to H.264 1080p (`lib/studioClips/shrink.ts`, mediabunny `Conversion`), because storage takes 50 MB a file.
5. `uploadMedia` (`lib/supabase/uploadMedia.ts`): one request up to 6 MB, otherwise TUS in 6 MB chunks with retries.
6. `PATCH /api/studio/clips/:id` (`completeClip`): source path, frames, audio path, facts; status `uploaded`, or `ready` once the clip has a card.

HEVC/.MOV: accepted; an HEVC clip the browser can decode is converted to H.264 on the device before it uploads (whatever its size), so it plays in every browser on the account; one the browser cannot decode fails at probe with a message to export it as H.264. No separate preview proxy is made: the stored file is already at most 1080p and 50 MB (the shrink step), and the editor plays it from a 1 h signed URL that is refreshed before it runs out.

## 2. Understand (transcription + cards + grouping)

`POST /api/studio/projects/:id/understand` starts `runUnderstand` (`lib/studioClips/job.ts`) in `after()`: transcribe every clip's WAV with AssemblyAI (polling), write `studio_clips.transcript`; one Anthropic card per clip (`clipCard`); group into post ideas (`batchGroups`) → `studio_projects.yield`. The UI polls `GET /projects/:id` every 2.5 s. Without a transcription key nothing is transcribed and captions stay off.

## 3. The edit model (EDL)

Everything the editor shows or exports comes from one JSON object: `Edl` in `lib/studioClips/types.ts`, stored in `studio_builds.edl`. Key parts:

- `segments: EdlSegment[]`: clip id, `in`/`out` in clip seconds, `role`, optional `frame` (reframe), `volume`, `transition` (cut, fade, zoom, whip, flash), `punches`, `voiceTail`, and the per-clip `motion` (zoom keyframes, shake, speed) and `stabilize` fields added with the theme system.
- `text: EdlText[]`: on-screen lines as locked presets (`lib/textPresets.ts`), timed in output seconds.
- `captions`: `{ source: "transcript" }` or `null`; the words come from the clips' transcripts at render time.
- `style: EdlStyle` (`lib/studioClips/style.ts`): font, accent, text background, caption style (position, size, box, case, preset, highlight).
- `finish: EdlFinish`: measured colour grades (`GradeParams`, same scale as `@remotion/effects` `colorCorrection`) and sound curves.
- `soundtrack` + `playlist` (server-owned tracks), `voiceover` (server-owned lines), `endCard`, `emphasis`, `editStyle`, `genre`, `theme` (see THEMES.md).

Derived, never stored: `timeline(edl)` (`lib/studioClips/timeline.ts`) lays segments end to end in frames at 30 fps, with transition overlaps of 9 frames; `tracksFor(edl)` (`tracks.ts`) is what the timeline component draws; `captionPages()` builds TikTok-style pages from the transcript words that fall inside each cut.

How a cut is made (server, `lib/studioClips/server.ts shaped`): Anthropic proposes a `RawEdl` → `validateEdl` (snap to words/pauses, trim to target, fit text to presets) → `textForStyle` → `applyHouseStyle` (genre rules from `docs/editor-style`) → `applyPacing` → `teachEdit` → `editSpeech`, `decideJoins`, `repairCut`, `varyJumpCuts` → `pickEmphasis`. A person's own edit goes through `revalidateEdl` on every save, which re-snaps cuts and keeps the person's choices.

## 4. Timeline and editing UI

`ClipBuilder.tsx` owns `edl`, `past`, `future`, `dirty`, the export state and the panel tabs. `commit(next)` pushes one undo step; live drags push once at the start (`beginLive`) and then set state directly. `components/studio/Timeline.tsx` draws video, text, B-roll and caption tracks under the player: scrub, trim by dragging cut edges, move cuts, time text lines, select, zoom. Keyboard: Space, arrows (frame), Shift+arrows (second), S split, Delete, Cmd/Ctrl+Z, Shift+Cmd+Z, + and - zoom.

Saving: `PATCH /api/studio/builds/:id { edl }` → `saveBuildEdl` → `revalidateEdl`, keeps server-owned parts (brief, playlist, voiceover audio), pushes the previous EDL to `edl_history`, re-renders the plain-language guide. There is no autosave; the editor warns before leaving with unsaved changes and keeps an unsaved copy in `localStorage` to offer back after a reload.

## 5. Preview

`<Player component={ClipComposition} inputProps={{ edl, sources, captionsOn, musicUrl, voiceUrls, cleanAudio, finishOn, safeZoneGuide }} />`. Inside the composition:

- Each segment is a `<Sequence>` with `premountFor` and a `<Video>` from `@remotion/media` trimmed at `inFrame`, sized by `videoBox()` (cover + reframe), with `effects` (WebGL: colour correction, transition blurs, the theme look: grain, vignette, chromatic shift, scanlines).
- `SegmentLayer` applies the transition look (`lib/studioClips/transitions.ts`), the punch-in scale, and the keyframed motion (`lib/studioClips/motion.ts`: Ken Burns zoom and pan with easing, handheld shake, emphasis punch-ins) as one CSS transform.
- Audio: per-frame `volume` callbacks combine measured gain, the person's clip volume, edge fades, L-cut tails, transition crossfades, music ducking under speech and under the voiceover.
- Text lines are PNGs from `lib/textRender.ts` (canvas), identical in preview and export; captions and the end card are DOM text styled from `edl.style` and the theme.
- Overlays (progress bar, lower third, watermark slot, letterbox) are plain layers driven by `edl.theme`.

## 6. Export

`exportVideo` in `ClipBuilder.tsx` (and `components/studio/renderBuild.ts` for batch):

1. `canRenderMediaOnWeb` (WebCodecs check; Chrome or Edge on a computer).
2. Save if dirty; the render then uses the revalidated EDL the server returned, so the file matches what is stored.
3. `POST /builds/:id/export` reserves a signed storage path and enforces the plan.
4. Noise-reduced audio is prepared (ffmpeg.wasm) so the file sounds like the preview.
5. `renderMediaOnWeb` renders `ClipComposition` with the same props as the preview, at the EDL's size, to an MP4 blob, with progress and an abort signal.
6. `inspectRender` (`lib/studioClips/inspectRender.ts`) decodes the file and `judgeRender` checks length, size, black frames at joins and silence; a fault gets one re-render, a second fault asks the person.
7. `uploadMedia` to `scheduled-media`, then `POST /builds/:id/draft` creates the draft post. Cancel aborts the render, the inspection and the upload, and gives the plan unit back.

Stabilization is the one step the browser cannot do: it is a server job (`POST /api/studio/clips/:id/stabilize`, `lib/studioClips/stabilize.ts`, ffmpeg `vidstabdetect` + `vidstabtransform`) that writes a stabilized copy next to the source; the preview and the export both play that copy, so they match.

## 7. Dev labs and tests

- `/dev/studio-lab?screen=editor` (`components/studio/StudioLab.tsx`): every Studio screen on fixture data (`labFixtures.ts`), the Studio API answered in the tab, the sample clip from `public/dev-sample.mp4`. No account needed. The export downloads the file instead of saving a draft.
- `/dev/text-lab`: text presets at any aspect plus a real web render.
- Unit tests: `lib/studioClips/*.test.ts`, `lib/textRender.test.ts`, `lib/studioClips/themes/*.test.ts`. The preview/export parity check is `lib/studioClips/parity.test.ts`.
- Gates: `lib/antiSlop.test.ts` (ratchet), `lib/designBudget.test.ts` (tokens), `npx tsc --noEmit`, `npx eslint .`, `next build`.
