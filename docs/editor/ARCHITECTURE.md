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

The Video editor path (a person's own edit) runs transcription only: `POST /api/studio/projects/:id/transcribe` submits every clip with sound and no transcript to the provider in `after()` and stores the words as they land; the editor polls its build for them and turns captions on. No clip cards, no grouping, no build credit.


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

How a cut is made (server, `lib/studioClips/server.ts shaped`): takes of one line are set aside first (`lib/studioClips/takes.ts`, only the cleanest take reaches the model) → Anthropic proposes a `RawEdl` → `validateEdl` (snap to words/pauses, trim to target, fit text to presets, speech-aware level balance) → `textForStyle` → `applyHouseStyle` (genre rules from `docs/editor-style`) → `applyPacing` → `teachEdit` → `editSpeech`, `decideJoins`, `settleCut` (repair, check, repair again until clean), `varyJumpCuts` → `pickEmphasis`. A brief's fill pass adds distinct unused clips only while the cut is under its target. A person's own edit goes through `revalidateEdl` on every save, which re-snaps cuts and keeps the person's choices.

## 4. Timeline and editing UI

`ClipBuilder.tsx` owns `edl`, `past`, `future`, `dirty`, the export state and the one-page panel (sections Theme, This cut, Words, Sound, Look, Make it again, with chips that jump and follow the scroll). `commit(next)` pushes one undo step; live drags push once at the start (`beginLive`) and then set state directly. `components/studio/Timeline.tsx` draws video, text, B-roll and caption tracks under the player: scrub, trim by dragging cut edges, move cuts, time text lines, select, zoom. Keyboard: Space, arrows (frame), Shift+arrows (second), S split, Delete, Cmd/Ctrl+Z, Shift+Cmd+Z, + and - zoom.

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

## Tell SOCIA what to change (2026-11-14)

A box at the top of the editor (`components/studio/AskPanel.tsx`) takes a sentence, typed or spoken (the browser's own speech recognition; Chrome, Edge and Safari have it, the microphone says so where it is missing). The sentence and the editor's working copy of the cut go to `POST /api/studio/builds/[id]/instruct`. The route describes the cut in numbered cuts and lines (`describeCut`), asks the fast model for a list of operations and one plain sentence (`lib/studioClips/instructModel.ts`), validates every operation against `opSchema` and applies them with `applyOps` (`lib/studioClips/instruct.ts`): remove, trim, move and swap cuts, sound levels (including "every cut where no one speaks"), speed, zoom, joins, theme, captions on or off and their style, text lines added, changed or removed, the ending, music, the lower third and the brand colour. A cut whose shots changed goes through `settleCut`. A structural request ("make it shorter", "a different hook") comes back as a `regenerate` directive and the editor runs its own Make it again. The changed cut is one undoable step in the editor and is saved with Save (Ctrl+S or Cmd+S). Nothing is written by the route.

Save and Download: the header's Save button is solid when there is something to save and reads Saved otherwise; after an export the finished file can be downloaded straight from the done panel (an object URL of the rendered blob), and a cut rendered earlier offers its public file (`build.renderUrl`).

## Your playlist (2026-11-15)

Music comes from the person, not a model. The Sound section's box (`components/studio/MusicBox.tsx`) takes any audio or video file dropped or chosen (saved from Instagram, YouTube or anywhere to the device first; SOCIA never downloads from a link), decodes it in the browser (Web Audio, with ffmpeg.wasm for a video the browser can't open), shows the waveform, and the person drags the part they want (2 s to 3 min), listens to it and saves it. The part is encoded to AAC in the browser (WAV when ffmpeg.wasm can't load) and uploaded to `studio-sources/<uploader>/library/music/<id>.<ext>`; a row in `studio_tracks` (`supabase/studio-tracks.sql`, `lib/music/tracks.ts`) is registered before the upload and confirmed after it, so a sound never appears half-made. The playlist (`GET/POST /api/studio/tracks`, `PUT/DELETE /api/studio/tracks/[id]`) is the brand's: every sound saved is there for every video; rename and remove live on each row. `PUT /api/studio/builds/[id]/music/[trackId]` puts a sound in the cut at the two levels (low under speech, with ducking on, when the cut talks); `DELETE` takes it out. The cut's `soundtrack` keeps the track's name and storage path, so a sound removed from the playlist still plays in a cut that used it. The generator that made tracks from the account's taste (ElevenLabs, the `music_tracks` meter, "add a track to new videos on their own") is gone.

## The stage (2026-11-15)

The editor is laid out the way CapCut lays out its stage, not as one long page: the preview in the middle (its notes and the Make the video card beside it when there is room), the timeline right under it, and a row of tools under that (Tell SOCIA, Theme, This cut, Words, Sound, Look, Make it again; `SECTIONS` and `TOOL_ICON` in `ClipBuilder.tsx`). One tool is open at a time: its panel sits beside the stage on a wide screen (a two-column grid on `.cbb:has(.sd-tool)`, sticky, scrolling on its own) and rises as a sheet over the bottom of the screen on a phone. Selecting a cut or a line on the timeline opens the tool for it; Escape or the X closes it; none open is the clean stage. The preview is never taller than the screen leaves room for (`calc((100vh - 360px) * 0.5625)` wide). On a phone the order is preview, timeline, tools, then the notes (`.sd-stage` and `.sd-stage-player` become `display: contents` under 900 px so the stage's parts can be ordered).

## Make a video like this (2026-11-16)

On Discover, every Reel in "Reels you can copy" has a Make a video like this button. It hands the Build tab (`/studio?mode=edit`) a brief written from the Reel (the same text as Copy brief, plus "copy its length, pace, order of shots and on-screen text style with my clips") through the in-tab handoff (`lib/studioClips/handoff.ts`, `reference`), and, when official data gives the Reel's file, a link to it signed for the viewer (`lib/studioClips/refToken.ts`, the token on `ProvenReel.refToken`). The Build tab fetches that link through `GET /api/studio/reference/media` (the viewer's signature and Instagram's CDN only, nothing stored) and reads the file exactly as a dropped reference: its cuts, frames and speech, then the breakdown and the brief. The person adds their clips and presses Make the video. A Reel without a file still prefills the brief; the person can drop the Reel as a file.


## Raw footage in, a finished video out (2026-11-18)

The Video editor (`/studio?mode=edit`) opens on a one-drop screen (`components/studio/QuickEdit.tsx`) while no video is open and the full editor has not been chosen. Footage dropped there is made into a finished video without another click. `ClipsStudio` measures and uploads it as any clip (`onFiles(files, { quick: true })`); `QuickEdit` does the rest, one of two ways:

- **One clip of someone talking** (nothing counted on the plan): the clip becomes its own cut (`POST /projects/:id/clip-build`), the build is read until the words are in (every 3 s, five minutes at most; skipped when the server has no transcription service), then `quickCut` (`lib/studioClips/quickEdit.ts`) runs the passes the editor already has, in order: `editSpeech` (pauses, repeated takes, false starts, fillers), `applyTheme` with the look picked on the screen, then `autoEdit`.
- **Several clips, or a clip where no one speaks** (counts one footage analysis and one AI-made video, as in the full editor; needs `auto_build`): `ClipsStudio.ensureUnderstood` runs the Understand job, the fixed brief `PICTURE_BRIEF` is fitted to the clips by the improver (`brief/enhance`, 8 s at most) and `POST /projects/:id/brief` makes the cut from what is in the picture. `quickLook` then puts it in the look: the cut's own look leaves the shots as chosen, another look makes its own edit on top. On a plan without `auto_build` a silent clip plays whole and several clips are refused at the drop with the reason.

Then, both ways: the sound picked from the person's playlist goes in (`PUT /builds/:id/music/:trackId` at `startLevels`, ducked under talking), its beat is measured in the browser (`beatOfTrack`) and the cuts are moved onto it (`alignToBeats`); the graphics the cut's own words support are placed (`findScenes`, below); the cut is saved (`PATCH /builds/:id`) and what renders is the copy the server kept; `renderBuild` renders it in the browser and watches the file.

The steps list shows only what was measured (the footage's size and length, clips uploaded, the words heard, the shots and length of the cut, the render percent); there is no timer and no estimate. The result screen has the video, the counts from `quickStats` (a cut from several clips is counted against all the footage, `rawOf`), the lines SOCIA wrote on screen for a picture cut (to be read before posting), Download, Compare with the raw clip (one clip only), Open in the editor, Save as a draft (the editor's own `export` and `draft` routes, so the plan rules are the same) and Make it again with another look, sound or without graphics (from the same cut, nothing more counted). A handed-over prompt or Reel, or "use the full editor", go to the editor's own start (clips, prompt and reference, edit them yourself), unchanged.

The screen is a dark stage of its own (`components/studio/quick-edit.css`, classes `qe-`): the owner asked for it to read as an editing product rather than as another app card (2026-11-18), so it carries its own sizes and colours instead of the light tokens, with no gradients, glow or blur. Its parts ease in with framer-motion (off when motion is reduced); the big percent is counted from the work itself (share of footage uploaded, steps finished, share of the video rendered), never from a clock.

Seen running in the dev lab (`/dev/studio-lab?screen=edit`, 2026-11-18): the drop, the steps, a real browser render, the result, Make it again, and a figure card in the exported file. The lab answers `clip-build`, `brief` and `brief/enhance` from its fixtures. The three scene cards play on a loop at `/dev/scene-lab`. Not seen yet: a run against the real backend, the one-talking-clip path (the lab's project always has several clips), music and the beat (the lab's playlist is empty), a phone-width screen. Covered by tests: `quickEdit.test.ts`, `scenes.test.ts`, the type check, lint, and the design and anti-slop gates.

## Animated graphics (2026-11-18)

`edl.scenes` (`lib/studioClips/scenes.ts`, pure, `scenes.test.ts`): cards over the top of the picture, timed to what is said. Three kinds, and every word on them was spoken in the cut (found by rule, no model call): `stat` (a figure that was said, with the words it counts), `steps` (a list counted out loud, "first, second, third" or "step one, step two"; each row lands as its line is said) and `line` (a short sentence with a point word or a question). `findScenes` keeps them clear of the opening three seconds, the ending, every text line and each other, six at most.

A scene is anchored to the word it starts on (`captionKey`: the clip and the word's time in it), the way a caption's own style is, so it moves with its words through trims and is simply not shown when they are cut (`sceneSpans`). `revalidateEdl` keeps scenes, bounded (`sanitizeScenes`). `components/studio/remotion/SceneLayer.tsx` draws them from the frame alone, in the cut's accent and face, in the plain styles the lower third uses, so the Player and the browser export match; the card sits lower when captions are at the top. In the editor they are in the Words tool (`components/studio/ScenesPanel.tsx`): retype, remove, Show me, Find them again. They have no track on the timeline and no instruct operation yet.

## Graphics behind the person (2026-11-18)

`edl.scenesBehind` puts the scene cards behind the person talking. The person is found in the browser by MediaPipe's selfie segmenter (`lib/studioClips/matte.ts`, `@mediapipe/tasks-vision`; the runtime is copied to `public/mediapipe/wasm` by `scripts/copy-mediapipe.mjs`, as the ffmpeg core is). `components/studio/remotion/PersonCutout.tsx` mounts a second, headless `@remotion/media` `<Video>` on the same clip frames as the shot under it, and in its `onVideoFrame` (which runs before the frame is shown in the Player or captured in the export) reads the frame at 384 px wide, takes the confidence mask, softens its edge and draws the frame through it onto a canvas above the card. `cutoutSpans` (`scenes.ts`) gives the stretch of each cut a scene runs over; `CutoutFrame` in the composition repeats the cut's own move (slow move, punch-ins, shake) and shows the copy only in the band at the top of the frame where the cards sit. The theme's grade is applied as a canvas filter (the Player's own approximation).

The card stays in front, with nothing drawn, where: no one is found in the frame; the browser can't run the segmenter or its files are missing; the picture's size is unknown or the frame moves on a path (the AI Clipper); the cut's speed was changed; the clip carries a measured colour correction (`edl.finish`), which the cut-out could not match.

**The model file is not in the repository yet.** `public/mediapipe/selfie_segmenter.tflite` (about 250 KB, from MediaPipe's model page) has to be added, or `NEXT_PUBLIC_SEGMENTER_MODEL` set to where it is served. In development, while it is missing, the model is read from Google's own bucket; in production without it the graphics simply stay in front (and the site's `connect-src` does not allow the bucket).

Seen running (2026-11-18) at `/dev/cutout-lab` on a real talking clip (`public/dev-talk.mp4`, kept out of the repository): the same picture in the Player and in a browser render, an 8 s clip rendered in under 4 s. Not seen: a cut with a moving frame, a graded theme in the export, a long clip, a phone.

The one-talking-clip path was also run in the lab (`/dev/studio-lab?screen=edit&fresh=1`: the project starts empty and the clip's words are stand-ins): drop, 8.0 s to 6.8 s, captions on, render, Compare with raw. The lab now answers storage uploads itself whatever the Supabase keys are, so a dropped file completes without an account.
