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

`edl.scenes` (`lib/studioClips/scenes.ts`, pure, `scenes.test.ts`): cards over the top of the picture, timed to what is said. Four kinds, and every word on them was spoken in the cut (found by rule, no model call): `stat` (a figure that was said, with the words it counts), `change` (two figures said as a change, "from 65 seconds to 38": the old one struck out, the new one landing), `steps` (a list counted out loud, "first, second, third" or "step one, step two"; each row lands as its line is said) and `line` (a short sentence with a point word or a question). `findScenes` keeps them clear of the opening three seconds, the ending, every text line and each other, six at most.

A scene is anchored to the word it starts on (`captionKey`: the clip and the word's time in it), the way a caption's own style is, so it moves with its words through trims and is simply not shown when they are cut (`sceneSpans`). `revalidateEdl` keeps scenes, bounded (`sanitizeScenes`). `components/studio/remotion/SceneLayer.tsx` draws them from the frame alone, in the cut's accent and face, in the plain styles the lower third uses, so the Player and the browser export match; the card sits lower when captions are at the top. In the editor they are in the Words tool (`components/studio/ScenesPanel.tsx`): retype, remove, Show me, Find them again. They have their own Graphics track on the timeline (`tracksFor` → `scenes`; a click shows the scene and opens Words; they are not dragged, because they sit on their words). No instruct operation yet.

## Graphics behind the person (2026-11-18)

`edl.scenesBehind` puts the scene cards behind the person talking. The person is found in the browser by MediaPipe's selfie segmenter (`lib/studioClips/matte.ts`, `@mediapipe/tasks-vision`; the runtime is copied to `public/mediapipe/wasm` by `scripts/copy-mediapipe.mjs`, as the ffmpeg core is). `components/studio/remotion/PersonCutout.tsx` mounts a second, headless `@remotion/media` `<Video>` on the same clip frames as the shot under it, and in its `onVideoFrame` (which runs before the frame is shown in the Player or captured in the export) reads the frame at 384 px wide, takes the confidence mask, softens its edge and draws the frame through it onto a canvas above the card. `cutoutSpans` (`scenes.ts`) gives the stretch of each cut a scene runs over; `CutoutFrame` in the composition repeats the cut's own move (slow move, punch-ins, shake) and shows the copy only in the band at the top of the frame where the cards sit. The theme's grade is applied as a canvas filter (the Player's own approximation).

The card stays in front, with nothing drawn, where: no one is found in the frame; the browser can't run the segmenter or its files are missing; the picture's size is unknown or the frame moves on a path (the AI Clipper); the cut's speed was changed; the clip carries a measured colour correction (`edl.finish`), which the cut-out could not match.

**The model file is in the repository** at `public/mediapipe/selfie_segmenter.tflite` (about 250 KB, MediaPipe's selfie segmenter, added 2026-11-18), so production loads it from the site itself. `NEXT_PUBLIC_SEGMENTER_MODEL` can point somewhere else. Not seen: the model loading on the deployed site.

Seen running (2026-11-18) at `/dev/cutout-lab` on a real talking clip (`public/dev-talk.mp4`, kept out of the repository): the same picture in the Player and in a browser render, an 8 s clip rendered in under 4 s. Not seen: a cut with a moving frame, a graded theme in the export, a long clip, a phone.

## Icons, split screen and the logo (2026-11-18)

Three additions to the graphics, all drawn by the same composition so the Player and the export match.

**Icons.** A figure, a before-and-after or a key line can carry a small line drawing on an accent disc (`lib/studioClips/sceneIcons.ts`: fifteen icons, each a few shapes on a 24 grid, drawn as SVG by `SceneLayer`). `findScenes` picks one by rule from the card's own words (`iconFor`: a currency sign or "price" is money, "seconds" is time, and so on) and picks none when no rule matches. `EdlScene.icon` is kept by `sanitizeScenes` only when it names a known icon. The person changes it or takes it off per card in the Words tool. Lists carry no icon; their rows have numbers.

**Split screen.** `edl.scenesSplit` turns every scene into a panel across the top 40% of the frame (`SPLIT_PANEL`), and the whole picture (shots and b-roll, wrapped in `PictureShift` in `ClipComposition`) moves down 20% of the frame (`SPLIT_SHIFT`) while a panel is up, so the middle of the shot stays in view under it. Panel and picture move on the same curve (`splitShare`). The bottom fifth of the picture is off the frame for those seconds; captions and other overlays do not move. Split screen and behind-the-person are one choice of three (`revalidateEdl` keeps split when both are set). A corner logo is covered by the panel while one is up.

**Logo.** `edl.logo` is `{ src, name?, corner?, ending? }` (`EdlLogo` in `types.ts`). `src` is a PNG data URL made in the browser from the picked image (`lib/studioClips/logoImage.ts`: fitted to 360 px, stepped smaller until under `LOGO_MAX_CHARS`, 150,000 characters), so the logo travels with the cut and needs no storage or upload route. `sanitizeLogo` drops anything that is not a PNG, JPEG or WebP data URL, is over the limit, or shows nowhere. Cost: up to about 150 KB more in that build's `edl` JSON, sent with each save. `corner` shows it top-right for the whole video (it takes the theme watermark's place) and fades before the ending; `ending` lands it above the ending card's lines, or, without an ending card, dims the last 1.5 s and lands it in the middle with the name under it. The controls are the Logo card in the Words tool (`components/studio/LogoPanel.tsx`). The one-drop screen offers the layout (behind, card, split) but not the logo.

Seen running (2026-11-18): icons, split screen and both logo scenes in `/dev/scene-lab`; split screen with an icon, the corner logo and the logo ending in a browser-rendered file at `/dev/cutout-lab`. Not seen: the Logo card or the layout and icon controls used in the real editor (needs a signed-in session), a logo picked from a real file, split screen on a multi-clip cut or with b-roll, a phone.

The one-talking-clip path was also run in the lab (`/dev/studio-lab?screen=edit&fresh=1`: the project starts empty and the clip's words are stand-ins): drop, 8.0 s to 6.8 s, captions on, render, Compare with raw. The lab now answers storage uploads itself whatever the Supabase keys are, so a dropped file completes without an account.

Checked at a phone's width (390 px, 2026-11-18): the one-drop screen's three states stack in one column with no sideways scroll.

## Instructions, picture graphics and placement (2026-11-19)

Asked for by the owner after the first live runs: text landed on faces, the graphics were only type, and there was no way to say how the video should be made.

**Instructions (typed or spoken).** The one-drop screen has a prompt box under the drop zone with the microphone the editor already uses (`useSpeech`, the browser's own speech recognition; Chrome, Edge, Safari). The words are kept in `sessionStorage` (`socia.quickEdit.prompt`) because the screen remounts when the clips land. In `QuickEdit.run` they go three places: into the brief for a several-clip or silent cut (ahead of `PICTURE_BRIEF`), to the pictures step below, and to the existing `/api/studio/builds/[id]/instruct` route, whose operations change the finished cut (look, captions, lines, speed, ending). The instruct call is told that requests for pictures are handled elsewhere. A failed step adds a plain note to the result and the video is still made.

**Picture graphics.** A fifth scene kind, `picture` (`lib/studioClips/scenes.ts`): one to three drawings side by side with a headline, on the word they are about. A drawing (`lib/studioClips/sceneArt.ts`) is either a country outline or a flat drawing of a thing made of up to 16 SVG paths on a 100 grid in five tones (accent, light, mid, dark, none). `POST /api/studio/builds/[id]/visuals` sends the cut's kept words (numbered, with times) and the prompt to the model (`lib/studioClips/visualsModel.ts`, task `studio_edl`, usage recorded as `studio_visuals`, 30 an hour per user). The model names countries and never draws them: `lib/studioClips/countryMap.ts` looks the name up in `lib/studioClips/data/countries.json` (Natural Earth, public domain, 222 outlines simplified to a 100 box, about 135 KB, server only) and the one outline used travels with the scene. `sanitizeArt` accepts only path data made of path letters and numbers, so neither a model nor a stored cut can carry markup; `sanitizeScenes` runs it on every save. `withPictures` puts the pictures in and takes out any rule-found card that would be up with one. At most four pictures a video. `SceneLayer` draws them: outlines draw on, fills come in behind, a map gets a pin. It runs on every one-drop cut that has speech and has graphics on, with or without a prompt.

**Placement.** Before the cut is saved, `lib/studioClips/lookAtCut.ts` looks at the footage in the browser with the person finder the cut-out already loads: up to 14 frames (where each scene and line shows, and the middle of each shot), each drawn small, the rows that hold a person giving the band their body fills, the top third of it taken as the head. `lib/studioClips/placement.ts` then gives each card the first of top, a little lower, under the middle that clears the head (`EdlScene.place`), moves a line with a slot to the slot that clears it, and moves the captions lower when they would cross the face in most of what was seen. Nothing moves where no one is found, as a split screen, or behind the person. The person can set a card's place by hand in the Words tool. Limits: it measures the person's body from a segmentation mask, so raised arms read as head height; it assumes a centred crop (a reframed or moving frame is not followed); captions get one place for the whole video.

Seen running (2026-11-19) in `/dev/studio-lab?screen=edit&fresh=1` on a real talking clip: the prompt typed before the drop reached the run, the person was found in three frames, and a picture scene (stand-in drawing, since the lab asks no model) was in the browser-rendered file. Not seen: the model's own drawings (needs the live keys), the instruct step on a one-drop cut, the microphone on this screen, a clip where something had to move off a face, a phone.

## Effect scenes (2026-11-19)

Asked for by the owner from a reference reel listing 17 effects. A sixth scene kind, `effect` (`EdlScene.fx`, ids in `lib/studioClips/sceneFx.ts`), is a treatment of the whole frame for two to five seconds on a word. Ten are built: magazine cover, glass text, graph rise, news wall, paper cut-out, sketch outline, dolly zoom, phone frame (these eight draw the person again on top, full frame, with the cut-out the graphics behind the person use), frame pop and pull-out reveal (these two scale the picture itself: `pictureFx`, applied by `PictureShift`, which now always renders the same two boxes so shots are not remounted when an effect starts). `components/studio/remotion/EffectLayer.tsx` draws what sits over the picture and under the person. The paper cut-out's white edge and the sketch's wobbling line are drawn by `drawPerson` (`matte.ts`, the `edge` argument): the person's shape in one colour, behind them, shifted to twelve sides. The dolly zoom grows the cut-out person from their feet while the room stays (a true dolly would need the background filled in behind them). An effect that needs the person is left out wherever the cut-out cannot run (unknown size, a moving frame, a measured colour correction, a changed speed), because it would cover them.

Where they come from: the pictures step (`visualsModel.ts`) may also return up to four effects, by name when the person asks, at most two when they did not; `effectsFrom` and `sanitizeScenes` bound them. They are edited in the Words tool like any scene (type, words, lines), and added by hand in the Motion effects tool (below).

Of the reference's 17, three were already here under other names (tick list is the list scene, punch-through cut is the zoom and push-in transitions, interface world is close to the split screen). Not built: sofa wall and orbit spin (several copies of the video on screen at once) and pixel zoom (a pixelating transition).

Seen running (2026-11-19) at `/dev/cutout-lab`: all ten in a browser-rendered file of a real talking clip. Not seen: an effect chosen by the model, an effect in the signed-in editor, an effect across a cut between two shots, a 4K source (the edge is drawn at the source's size), a phone.

## Choosing effects by hand (2026-11-19)

The owner found the editor too much to dig through for this ("press Words, press text, go down") and wanted to pick effects before the drop and while editing.

**In the editor: the Motion effects tool.** Second in the tool row (`ClipBuilder`, panel `motion`, `components/studio/MotionEffectsPanel.tsx`): every effect as a tile with a small drawing of what it does. Pressing one puts it on the video at the playhead: `effectAt` (`scenes.ts`) lands it on the word being said there (the next word if none is) and takes its words from what is said (the longest word that is not a small one for a cover, a glass word or a cut-out; the figure said for a graph; the line for a headline), `addScene` takes out whatever would be on screen with it, and the player jumps to it. The effects on the video are listed under the tiles to retype, see or remove. A cut with no speech cannot take one (they are anchored to words) and the tool says so.

**Before the drop.** The one-drop screen has the same tiles under the prompt, closed by default ("SOCIA picks"). Up to four can be switched on (kept in `localStorage`, `socia.quickEdit.fx`). They go to the pictures step as `wanted`: the model is told to use each exactly once where it fits best and no others, and the route then places any it left out itself on the first free moment (`effectAt` at fixed shares of the video), so a picked effect is always used when the video has room for it.

Seen running (2026-11-19) in `/dev/studio-lab?screen=edit&fresh=1`: two effects picked before the drop reached the pictures step; in the editor, pressing Glass text put the word on the preview with its word from the speech. Not seen: the model placing picked effects, the route's own placement of one the model left out, either screen signed in.

## Ported from Motus: the Ribbon Depth scene (2026-11-19)

The owner asked for the editor from the AI Employee Lab course to be brought into SOCIA. That editor is Motus (github.com/kyleherbel/motus), MIT licensed; its notice is in `THIRD_PARTY_NOTICES.md`. Motus is a local tool (a coding agent plans the edit, a Node and headless-Chrome engine renders it, Apple Vision cuts the person out), so nothing of its engine carries over; what is ported is the look of its styles, one at a time, onto SOCIA's scenes.

First: the signature scene of its Ribbon Depth style, as the effect `ribbon` (`sceneFx.ts`).
- `lib/studioClips/ribbon.ts` is a port of Motus's ribbon renderer: a band wound on a tilted cylinder, projected, depth-sorted, shaded, bloomed by scaling down and up, with sparkles on fixed numbers. Four forms (spiral, sweep, halo, arc), chosen by the scene's place in the video. Colours come from the cut's accent. It is a pure function of a time drawn on a canvas at two thirds of the frame's size (`RibbonCanvas` in `EffectLayer.tsx`, in a layout effect, so the export captures the frame it asked for).
- Behind the person: the room dimmed (a dark layer under the cut-out, so the person stays bright), the ribbon, and a frosted card with a title whose last word is set in the italic serif, and up to three rows that land in turn.
- In front of the person (`EffectFront`, drawn after the cut-out): the line, as Motus sets it: a cream capsule with the first two words, then the rest with its last word in the larger italic serif, and an underline in the accent. Captions step aside while that line is up.
- Fields: `text` the card title, `lines` the rows, `label` the line in front. Pressed by hand it takes a word and the line from what is said there; the pictures step is told to use it on the hook and at most once more.

Ported next (same day), as five more effects in the same glass look, each with the room dimmed and the person in front: `chat` (message bubbles after typing dots, older ones pushed up), `notify` (a notification stack, newest on top), `search` (a search bar that types), `button` (a button in a field of rings that a cursor clicks, with a ripple), `compare` (two tilted cards, the second lighting up). They follow Motus's elements in layout and motion but are written for SOCIA's frame-driven layer, in flat colours, and are timed evenly across the scene instead of on a word each. Not ported from Ribbon Depth: glass stack, orbit, media fan and filmstrip (SOCIA's list, figure and before-and-after cards cover stack, stat and swap in their own look), its camera shake on landings, its sounds, its split and abstract layouts, and its planning rules as a whole. The other six styles (Editorial Proof, Ember Brief, Night Class, Open Canvas, Prop Room, Seamline) are not started.

Seen running (2026-11-19) at `/dev/cutout-lab`: the scene in a browser-rendered file of a real talking clip, made in under 6 s for an 8 s clip. Not seen: chosen by the model, in the signed-in editor, on a phone.

## Motus's split styles as looks for the split screen, and Open Canvas (2026-11-19)

Five of Motus's seven styles are a graphic field over the speaker. SOCIA already had a split screen, so each of those styles is ported as a look the split screen wears (`edl.scenesSkin`, `lib/studioClips/splitSkins.ts`): its ground, ink, accent, pattern and where the speaker sits, taken from that style's tokens. The graphics in the field are still SOCIA's own scenes (figure, before and after, list, key line, picture), drawn in the look's colours.
- `prop` (Prop Room): a pale paper panel, half and half.
- `editorial` (Editorial Proof): a white page above, the speaker in a rounded frame below, red accent.
- `ember` (Ember Brief): a dark dotted field, magenta accent, half and half.
- `night` (Night Class): a black lattice board with a cobalt accent, the speaker in a small rounded panel at the bottom.
`pictureWindow` gives where the picture is at any share of the way in: the box it is clipped to (whole frame to the look's window) and how the full-size picture is moved inside it. `PictureShift` renders three boxes at all times (ground, clip box, picture) so shots are not remounted. `edl.scenesFocus` (set by `placeClear` when the cut is looked at) is where the person's face is, so it stays in the window; without it each look has a guess. The look is chosen beside the layout on the one-drop screen and in the Words tool.

Open Canvas is the effect `canvas`: the picture shrinks onto a drafting grid inside a selection frame with handles, a layer name, a size readout and a cursor.

What this is not: a port of those styles' own elements (about 80 of them: page captures, code windows, props that act a sentence out, logo tiles, price lists and so on), their caption styles on the seam, their hard-cut pacing, or their planning guides. A split look appears while a graphic is up; in Motus the field is there for the whole video. Seamline is not ported at all: it is built on real product footage SOCIA has no way to fetch.

Seen running (2026-11-19) at `/dev/cutout-lab`: the four looks and Open Canvas in browser-rendered files of a real clip. Not seen: chosen on the one-drop screen signed in, the face kept in view from a real look at the footage, a phone.

## Real logos and real pages in a picture scene (2026-11-19)

Two more kinds of drawing (`lib/studioClips/sceneArt.ts`), both of the real thing and both fetched on the server in the pictures step, after the model answers:
- `logo`: the mark of a company or product that is named. The model gives the brand and its website domain; `lib/studioClips/brandLogo.ts` asks Google's favicon service for that domain's icon (the request always goes to Google, the domain is a checked parameter), refuses the 16-pixel placeholder an unknown site gets, and keeps a PNG data URL of at most about 60 KB. Drawn on a white tile.
- `page`: a web page, photographed. A page needs a real browser to photograph it and this server has none, so `lib/studioClips/pageCapture.ts` asks Microlink (api.microlink.io) for a 720 by 860 JPEG of it. Without a key that is 25 to 50 a day for the whole site; `MICROLINK_API_KEY` in the environment lifts it. The page's address must be plain public https (no credentials, no port, a real domain name). The image is made smaller with sharp where the server has it, kept as a data URL of at most about 130 KB, shown alone in its scene in a browser window, drifting up slowly. At most two a video.
A mark or page that cannot be fetched is left out, and a scene left with nothing to show is dropped. Cost to the cut: these images travel inside the cut's JSON, so a video with two pages and four marks can add about half a megabyte to each save.

Seen running (2026-11-19) in `/dev/scene-lab`, with the images loaded straight from the two services in the browser: a real mark and a real page drawn in a scene. Not seen: the server fetching either one (needs the live site), sharp present on the host, the daily limit being hit.

## Eight more pieces from Motus's styles (2026-11-19)

As effects, in the dimmed room with the person in front, after elements of Night Class, Prop Room, Editorial Proof and Ember Brief: `title` (a stacked title with an accent bar and an optional line above), `bars` (value bars; each line is a name and its number, the largest in the accent), `table` (a heading and rows, cells split on "|"), `flow` (steps down a line that draws through them, a tick on the last), `code` (a dark window whose lines type in), `keys` (key caps pressing in turn; the keys are split on "+"), `stamp` (one word slammed on at an angle), `comment` ("Comment" and the keyword, typed into a comment box). That makes 25 effects. The pictures step is told when each fits; pressed by hand they take what they can from the speech and the rest is typed in the Motion effects tool.

Seen running (2026-11-19) at `/dev/cutout-lab`: all eight in browser-rendered files. Not seen: chosen by the model, signed in.

Still not ported from those styles: props that act a sentence out (a printer, a tank draining), the picker, item stacks, file drop, the before-and-after wipe, name reveal, rank and price lists as their own designs, logo grids and chips, the hub, the race and link animations, the demo player, document pages, and every style's own captions, sounds and cut pacing.

## Sounds, the looks' captions, and six more effects (2026-11-19)

- **Sound on graphics.** `edl.scenesSound` plays a short sound as each card or effect lands (`sceneSound` in `sceneFx.ts`: a pop for a figure, a hit for a stamp, a click for a button, keys, a search or code, a ping for a notification or a chat, a low boom when the picture itself moves, a swish for the rest), at 0.42 of full level. The six files in `public/editor-sfx/m-*.m4a` are Motus's own (Editorial Proof and Prop Room packs): synthesised from code, MIT, converted from WAV to AAC. On by default on the one-drop screen; a checkbox there and in the Words tool.
- **The looks' captions.** A split-screen look other than SOCIA's now brings a caption style with it when the one-drop cut is made (`SKIN_CAPTIONS` in `quickEdit.ts`): Prop Room boxed, Editorial Proof and Ember Brief the highlight style in their accent, Night Class one word at a time. The captions do not sit on the seam as Motus's do, because SOCIA's field is only up while a graphic is.
- **Six more effects**: `orbit` (a hub with things circling it), `link` (two things joined by a line with a tick), `picker` (a list whose highlight lands on the one chosen), `filedrop` (a file dropped into an area that ticks), `name` (a name spelled out over a line), `doc` (a page whose key lines are highlighted). 31 effects in all.

Seen running (2026-11-19) at `/dev/cutout-lab`: the six in browser-rendered files, rendered with sound on (the files carry audio; the sounds themselves were not listened to). Not seen: the captions of a look on a one-drop cut, anything signed in.

## The last pieces taken from Motus (2026-11-19)

- `race`: two things on two lanes, the first one named winning. 32 effects in all.
- **Drawings that act.** A model-drawn thing can carry `move` (`sceneArt.ts` `ART_MOVES`: drive, spin, bounce, float, pulse, fill), applied once it has drawn (`acting` in `SceneLayer.tsx`). This is SOCIA's answer to Motus's hand-animated props: one generic motion per drawing, not a prop built for one sentence.
- **Shake on landings.** `ribbon`, `stamp`, `title`, `cover` and `glass` shake the picture for half a second as they land (`landingShake`: 14 px at 7.5 Hz, dying away with a 0.11 s time constant, the picture drawn up to 3% larger meanwhile so its edges do not show). Not while the picture is itself being moved by another effect.
- Several companies named together are asked for as up to three `logo` drawings in one scene.

Left out on purpose: Motus's field staying up for the whole video with a new graphic every two or three seconds (SOCIA places at most six scenes and the field is up only with them); its photo fan and filmstrip (they need the person's own photos, which the one-drop screen does not collect); its demo player and Seamline (real product footage); its props built for one idea each.

Seen running (2026-11-19) at `/dev/cutout-lab`: the race in a browser-rendered file; a file rendered with a shaking landing in it. Not seen: a drawing acting (the lab's stand-in drawing pulses but was not looked at in motion), a shake judged by eye.
