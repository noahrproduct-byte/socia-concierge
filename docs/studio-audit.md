# Studio audit

Written 2026-11-03 on branch `studio-overhaul`, before anything was changed. It covers the whole Studio section: the Rate workspace, Build from Clips, the Video editor (Make this video and the person's own edit), the Audio mode, Plan a post (the production guide), every API route behind them, the Supabase tables and policies, and the tests. Phases 2 to 5 of the overhaul act on the findings here; the pull request description says which ones were done.

Sizes at the start: 24 files and 5,741 lines under `components/studio`, 9,199 lines under `lib/studioClips`, `lib/studio*.ts`, `lib/audio`, `lib/music`, `lib/transcribe` and `lib/text*`, 1,910 lines of API routes under `app/api/studio`, 265 lines of SQL, and 34 test files. All Studio CSS lives in `app/globals.css` (about 900 lines between lines 9,940 and 11,720), outside the design budget.

## 1. What Studio is, screen by screen

The page is `app/(app)/studio/page.tsx`. The mode is in the URL (`?mode=`) and `components/studio/StudioMode.tsx` draws the four tabs (Rate, Build, Video editor, Audio); Plan a post (`?mode=guide`) is reached from a planned post and has no tab.

### 1.1 Rate (`mode` absent): `components/studio/ContentStudio.tsx`, `StudioPanels.tsx`, `StudioPlayer.tsx`, `ImproveWalkthrough.tsx`

| Control | What it does | Where |
|---|---|---|
| Upload content / drop zone / Choose draft | Loads a video (MP4, MOV, up to 3 min, 250 MB) or images; drafts with media come from `scheduled_posts` | `ContentStudio.tsx` `onFiles`, `openDraft`; `page.tsx` reads drafts |
| Frame sampling | 10 JPEG frames (front-loaded: 0, 0.7, 1.5, 2.5 s, then evenly) from the visible `<video>` | `lib/studio.ts` `extractFrames` |
| Listening | Decodes the sound to 16 kHz mono (mediabunny, Web Audio fallback), measures level, pauses, BPM, uploads a WAV under `<uid>/quick/` and transcribes it (AssemblyAI) | `lib/audio/decode.ts`, `lib/audio/quick.ts`, `app/api/studio/transcribe` |
| Analyze | One model call with frames, measured sound, transcript, caption, goal, the account's top posts and their cover frames, niche content, and the planned post when there is one; returns the creative readiness score, nine category scores, strengths, three top fixes, structure segments, markers, hooks, CTAs, on-screen lines, cuts, audio direction, platform fit, winners comparison, niche patterns, a caption | `app/api/studio/analyze/route.ts` (251 lines), `lib/studio.ts` types |
| Player | Custom vertical player with structure bar, markers, frame strip (double-click sets the cover), text overlay preview, dev-only safe-zone guide | `StudioPlayer.tsx`, `TextOverlay.tsx` |
| Transcript box | Editable; auto-filled from the transcription; Re-analyze as a new version | `ContentStudio.tsx` |
| Analyze tab | Score ring, nine category bars (expand for explanation, evidence, fix), "How is this scored?", planned-post fit, what works, highest-priority edits (Use this hook / Use CTA / Use text / Jump to), structure, timeline insights, platform fit, compare with winners, compare with niche | `StudioPanels.tsx` `AnalyzePanel` |
| Improve tab | A guided walkthrough of moments SOCIA can fix (text line in a preset, noise, pauses, colour, music, captions, caption); each with a visual (before/after, level meter, cut bar, music line) and one button that opens the Video editor with the fix queued | `ImproveWalkthrough.tsx`, `lib/studioFixes.ts`, `lib/studioClips/handoff.ts` |
| Caption tab | Caption editor, SOCIA's suggestion, eight rewrite modes (one model call each) | `StudioPanels.tsx` `CaptionPanel`, `app/api/studio/improve` |
| Audio tab | "Add music to this video" (hands the file to the Audio mode), measured sound cells, observed/direction/alternative, an "I've picked a track" checkbox, the account-wide "What sound has worked for you" panel, a static "Trending audio: on Discover" note | `StudioPanels.tsx` `AudioPanel`, `components/studio/AudioPanel.tsx` (named `AudioInsights` on import) |
| Prepare tab | Goal chips, platform chips, a seven-item readiness checklist, Add to Content Plan, Save draft, Publish or schedule (hands to Create Post with a session-storage handoff), Create variations (five text briefs), score history | `StudioPanels.tsx` `PreparePanel`, `lib/studio.ts` `checklist`, `lib/studioHandoff.ts` |
| Ask SOCIA button | Opens the assistant with the analysis as context; proposals apply a hook/CTA/caption | `components/AskSocia.tsx` |

### 1.2 Build (`?mode=clips`): `ClipsStudio.tsx`, `ClipsViews.tsx`, `BatchPanel.tsx`, `BriefPanel.tsx`, `ClipLibrary.tsx`, `LearnCard.tsx`

| Control | What it does | Where |
|---|---|---|
| Add clips / drop zone | Registers each file (fingerprint, probe, plan limits checked server-side), measures frames, scene cuts, picture and sound facts on the device, uploads source, keyframes and a WAV, two at a time | `ClipsStudio.tsx` `registerFile`/`uploadFile`, `lib/studioClips/ingest.ts`, `facts.ts`, `app/api/studio/clips` |
| Clip grid | One card per clip with thumbnail, duration, phase progress, flags (dark, quiet), remove | `ClipsViews.tsx` `ClipGrid` |
| Understand this footage | Starts the job: transcription, one card per clip (pass 1), batch grouping (pass 2), yield validation; polled every 2.5 s; starts on its own the first time clips are in | `app/api/studio/projects/[id]/understand`, `lib/studioClips/job.ts`, `analysis.ts`, `yield.ts` |
| Content Yield | Headline, summary, posts found (strong/possible badge, evidence line, clip thumbs, Guide ready, Learn result chip), ideas that didn't make the cut | `ClipsViews.tsx` `YieldView`, `lib/studioClips/yield.ts` |
| Make and schedule | Pick ideas and single clips, posts a day, start date, destinations, YouTube kids answer; makes every video in the browser (cut, music, colour, render, upload, caption), then schedules them | `BatchPanel.tsx`, `lib/studioClips/batch.ts`, `renderBuild.ts` |
| Edit guide (one post) | Builds the EDL (pass 3) and renders it as numbered steps with frames, notes, caption; Make this video opens the editor | `ClipsViews.tsx` `OpportunityView`, `app/api/studio/projects/[id]/opportunities/[idx]`, `lib/studioClips/edl.ts` |
| Edit them yourself | The project's own edit: every clip end to end, no AI, nothing counted | `app/api/studio/projects/[id]/edit`, `server.ts` `manualBuild` |
| Make a video your way | Prompt and/or a reference video (read in the browser: cuts, frames, timed speech) → a new cut over every understood clip | `BriefPanel.tsx`, `app/api/studio/projects/[id]/brief`, `lib/studioClips/reference.ts` |
| Your clip projects / Your clips | Reopen or delete a project; the library of every clip ever uploaded, post one again or make a new video from several | `ClipsViews.tsx` `ProjectList`, `ClipLibrary.tsx`, `app/api/studio/library`, `from-library` |
| What your Studio posts did | Learn: results of published Studio posts against the account's median, lessons once three have settled | `LearnCard.tsx`, `lib/studioClips/learn.ts`, `learnLoad.ts` |

### 1.3 Video editor (`?mode=edit`) and Audio (`?mode=audio`): `ClipsStudio.tsx` variants

The same component with a different front page: the editor shows "Clips for this video", the prompt/reference panel, "Or edit them yourself", Your videos and Your clips; the Audio mode drops one video and opens the editor on the Music tab. Handoffs from Rate (the file, proposed lines, a queued fix) arrive through `lib/studioClips/handoff.ts`.

### 1.4 The editor: `ClipBuilder.tsx` (767 lines), `Timeline.tsx`, `TextLayersPanel.tsx`, `FinishPanel.tsx`, `MusicPlaylist.tsx`, `remotion/ClipComposition.tsx`

| Control | What it does | Where |
|---|---|---|
| Header | Back, Undo, Redo, Save changes | `ClipBuilder.tsx` |
| Player | Remotion Player on the EDL; title, length, cut count, size; Before/After for measured corrections; safe-zone guide (dev) | `ClipBuilder.tsx`, `ClipComposition.tsx` |
| Make the video | Checks WebCodecs, saves, counts the build (server), cleans sound, renders in the browser, uploads, saves a draft post; High/Standard quality; progress list and bar; Cancel | `ClipBuilder.tsx` `exportVideo`, `app/api/studio/builds/[id]/export`, `draft` |
| Cut tab | "At the playhead: Start here / End here / Split here"; a list of cuts with thumbnail, role, ± 0.5 s trim buttons on in and out, mute and volume, "Comes in with" transition select, Move up / down, Replace (hidden select), Remove; a hint line | `ClipBuilder.tsx` |
| Frame tab | Aspect ratio (9:16, 4:5, 1:1, 16:9); per cut zoom, left/right, top/bottom sliders | `ClipBuilder.tsx`, `lib/studioClips/timeline.ts` `videoBox` |
| Style tab | Font, brand colour, text background (five), caption position/size/box/capitals, brand style and templates (save, apply, delete) | `ClipBuilder.tsx`, `lib/studioClips/style.ts`, `styleStore.ts` |
| Text & captions tab | Captions on/off (from the transcript), text lines as six locked presets (add, style picker with thumbnails, words with a fit check, slot, timing ± 0.5 s, start at the playhead, up/down, remove), "Different hook" (a regenerate), the post caption | `TextLayersPanel.tsx`, `lib/textPresets.ts`, `textRender.ts` |
| Look & sound tab | Reduce background noise (ffmpeg.wasm in the browser), measured Look (Off / Auto enhance / Match clips) with per-clip reasons, Clean up audio (gain curve), cut long pauses, "Not done automatically" notes | `FinishPanel.tsx`, `lib/studioClips/measure.ts`, `grade.ts`, `sound.ts`, `cleanSound.ts` |
| Music tab | Music added on its own (once per cut, from the taste), the brand's auto setting, the playlist (six made tracks), levels, remove, library-search suggestions, the account-wide audio insights panel | `MusicPlaylist.tsx`, `AudioPanel.tsx`, `lib/music/*`, `app/api/studio/builds/[id]/music/*` |
| Regenerate tab | Six directives, up to eight per build | `ClipBuilder.tsx`, `app/api/studio/builds/[id]/regenerate` |
| Timeline | Ruler, video track (drag edges to trim, drag body to move, click to select), text track (drag, resize, keyboard), captions track, playhead, Play, Split, Delete, Undo, Redo, zoom; keyboard shortcuts | `Timeline.tsx`, `lib/studioClips/tracks.ts` |

### 1.5 Plan a post (`?mode=guide`): `GuideStudio.tsx`, `lib/studioGuide.ts`, `studioGuideLoad.ts`, `app/api/studio/guide`

Concept from a planned post, a Discover format or a typed idea; one model call writes hooks, structure, script, shots, filming, editing, caption and CTAs; editable; saved back onto the planned post.

### 1.6 Server, storage, data

- Tables: `studio_projects`, `studio_clips`, `studio_builds` (`supabase/studio.sql`), `audio_media` (`studio-audio.sql`); Phase B columns (`studio-phase-b.sql`); `cut_counted_at` and the server-only grant on `studio_builds` (`studio-cut-meter.sql`); the nightly purge job that now only clears old expiry dates (`studio-purge-cron.sql`, `app/api/jobs/studio-purge`).
- Policies: owner-only RLS on the three studio tables and `audio_media`; the private `studio-sources` bucket with uploader-prefixed object policies; signed URLs for every read (`lib/studioClips/storage.ts`); `clipOwnsPath` keeps every path inside the clip's own folder.
- Billing and plan gates: `content_build` (Understand), `video_builds` counted once when SOCIA's cut is handed over (`lib/studioClips/cutMeter.ts`), `music_tracks`, `content_studio` (Rate), `content_generation` (Improve, guide); plan features `build_from_clips`, `auto_build`, `scheduling`; `guideOnly` keeps the cut off plans without Make this video; the export path is HMAC-signed (`exportToken.ts`).
- Models: pass 1 and pass 3 on the fast model, pass 2 on the default model (`lib/anthropic.ts` `modelFor`); every call is structured output except Rate, whose schema is too large and is parsed tolerantly.

## 2. Unused, duplicated, confusing, half-finished or dead

### 2.1 Dead code (no references outside tests)

| Item | Where | Note |
|---|---|---|
| `planPosts`, `freeDays`, `moveTo` and the whole "Plan These Posts" distributor | `lib/studioClips/distribute.ts` (164 lines) and `distribute.test.ts` | Phase D's UI was replaced by Make and schedule; only `similar` and two types are still used (by `batch.ts`) |
| `cutAt` | `lib/studioClips/tracks.ts` | never called |
| `takeFiles` | `lib/studioClips/handoff.ts` | superseded by `takeHandoff` |
| `fmtT1` | `lib/studio.ts` | never called |
| `sizeFor`, `EdlText.size` | `lib/studioClips/overlay.ts`, `types.ts` | the pre-preset size hint; the renderer ignores it |
| `textColors` | `lib/studioClips/style.ts` | text lines are presets now; nothing reads the style's colours for them |
| CSS: `.st-puttext`, `.cbb-lines`, `.cbb-line-head`, `.cbp-list`, `.cbp-when`, `.cbp-chips`, `.cbp-unplaced`, `.imw-note`, `.imw-scrub`, `.imw-track`, `.imw-mark`, `.imw-head`, `.cb-understand {}` | `app/globals.css` | rules for removed UI (the old text-lines list, the Phase D plan list, the deleted `ImproveWalkthroughPreview`) |

### 2.2 Duplicates

- **Undo and Redo twice**: in the editor header and in the timeline toolbar, wired to the same functions.
- **Split twice**: "Split here" in the Cut tab's "At the playhead" row and the timeline's Split button.
- **Reorder and trim twice**: Move up / Move down and the ± 0.5 s buttons on every cut in the Cut tab, beside drag-to-move and drag-to-trim on the timeline. The list is the only keyboard route, so it cannot simply go, but four buttons per cut for trimming is the clunkiest part of the editor.
- **"Different hook" twice**: a button in the Text tab and a card in the Regenerate tab, both sending the same directive.
- **Rendering twice**: `ClipBuilder.exportVideo` and `renderBuild.ts` carry the same `renderMediaOnWeb` setup (composition id, bitrate, cleaned sound); Make and schedule uses the latter.
- **Measuring twice**: the automatic colour pass (`autoLook`) measures every clip when the cut opens; the Look & sound tab measures them all again when it opens.
- **Two things called `AudioPanel`**: Rate's tab (`StudioPanels.tsx`) and the account-wide insights (`components/studio/AudioPanel.tsx`, imported as `AudioInsights`).
- **Two noise controls with similar names** in Look & sound: "Reduce background noise" (ffmpeg.wasm) and "Clean up audio" (a measured gain curve). Different jobs, one confusing pair.

### 2.3 Confusing or half-finished

- **"I've picked a track for this piece"** (Rate › Audio) is a self-reported checkbox whose only effect is ticking the Prepare checklist. Not information.
- **"Trending audio: on Discover"** (Rate › Audio) is a paragraph that says there is nothing here.
- **Create variations** (Rate › Prepare) returns five text briefs and says "SOCIA does not render video". Half a feature; Build does the real thing.
- **The Replace control** is an icon with an invisible `<select>` stretched over it: there is no sign it is a menu.
- **Score ring without fill**: `ScoreRing` draws the final value at mount (its CSS transition never runs), and the category bars jump in.
- **Export blocked for up to a minute**: Make this video is disabled while music is being added and while colour is being measured ("Adding music first (about a minute)"), with no progress for either.
- **`st-progress` spinner dots** loop forever (`animation: st-spin ... infinite`) in every progress list; the only looping animation the standard allows is the spinner itself, so this one is in the baseline but should be the system spinner.
- Sparkles icons on Understand, the privacy line, Regenerate, the cut hint and Add to Content Plan (four files in the anti-slop baseline).
- `renderBuild.ts` exports `renderBlocker` and `spokenText` that only Make and schedule uses; fine, but it lives in `components/`.
- `lib/studioClips/server.ts` is 730 lines holding projects, clips, builds, library, videos and briefs together.

## 3. Timing problems

### 3.1 Cut lengths and pacing (`lib/studioClips/edl.ts`, `analysis.ts`)

- The validator enforces only a floor of 0.8 s per cut and the target maximum. A cut the model makes 9 s long with no speech in it stays 9 s; the opener has no length rule at all, so "a strong first 1 to 2 seconds" rests entirely on the prompt.
- The opener's in-point is snapped off the middle of a word and onto a pause boundary within 0.35 s, but nothing moves it past a silent lead-in: a clip that starts with 1.5 s of nothing before the person speaks opens the video with that nothing.
- The ending has no minimum; validation trims body cuts from the end to fit the target, so the last shot can be cut to 0.8 s, too short to land.
- Text lines: the minimum is 0.5 s (`MIN_TEXT_SEC`), whatever the words. A 40-character Hook Title can be on screen for half a second and cannot be read.
- `fillCut` (brief cuts) adds missing clips as 1.2 to 2.5 s beats; fine, but it lengthens the last cuts up to the floor without the same readability check.
- Nothing in the pipeline is tested against pacing rules; `edl.test.ts` checks snapping and trimming to the target only.

### 3.2 Transitions and beats

- Every transition overlaps exactly 8 frames (0.27 s) and lands wherever the cut falls. When a soundtrack is in the cut, its tempo is known (`TrackBrief.bpm`, chosen by SOCIA and requested from the music model at that tempo), yet cut boundaries are never moved onto the beat. The same is true for a measured beat in a clip's own sound (`lib/audio/features.ts` estimates BPM for Rate, but Build's facts carry none).
- The soundtrack fades in over 0.2 s and out over 0.8 s with no relation to the cut's beats.

### 3.3 Audio and caption sync

- `edgeEnvelope` fades every cut's sound over 0.15 s at both ends, including hard cuts. On a spoken clip the last 150 ms of a word ducks at every cut; it sounds like the voice dips, not like a clean cut. Two frames are enough to avoid a click.
- Caption pages: `createTikTokStyleCaptions` groups tokens within 1.2 s of a page's start, so a page's last word can end after start + 1.2 s. `ClipComposition` ends the page at `start + 1.2 s` anyway, so that word disappears before it is finished, and nothing is on screen until the next page. Visible as a flicker on long words at page ends.
- With transitions the overlap shifts `startSec`; `captionsForEdl` uses it correctly, but the text-line timings (`EdlText.at`) are output seconds written before transitions existed and are not re-mapped when a transition is added (a line placed at a cut boundary lands 0.27 s late per transition before it).
- Rate's transcript, measured sound and frame sampling run one after another (`extractFrames` → `listen` → `analyze`), though the first two are independent; the person waits for both in series.

### 3.4 Clips that start or end awkwardly

- In-points snap only within 0.35 s of a pause; a cut that starts 0.6 s into a silence keeps the silence.
- `replace()` in the editor picks the first non-weak moment and runs it for up to 6 s with no regard to speech boundaries or the cut it replaces.
- The manual edit starts every clip at 0 and ends at its full length, with `cleanSound` on by default, so opening the editor on three raw clips starts a three-clip ffmpeg job at once.

### 3.5 Slow loading, previewing, rendering, exporting

- **Opening a cut** starts three jobs at once: music on its own (a model call plus a music render, up to a minute), colour on its own (every clip decoded and measured in the browser) and background-noise reduction (ffmpeg.wasm downloaded, then every clip's audio re-encoded). The preview plays the original sound until the cleaned track lands, then switches. "Make the video" is disabled until the first two finish.
- **Look & sound** measures every clip again when the tab opens (`FinishPanel` `measure` on mount) even though `autoLook` just did.
- **The timeline** sets React state on every `frameupdate` (30 a second) and re-renders every track; with many cuts and lines the playhead stutters.
- **Rate** is sequential (see 3.3) and the transcription polls for up to 75 s before the analysis call (20 to 40 s) starts.
- **Export** shows a step list and a percentage; upload shows a percentage; nothing estimates time and the celebration is a single line.
- **Understanding** polls at 2.5 s and shows a stage list; the per-clip count only moves for pass 1.
- **Make and schedule** is serial per video (cut, music, colour, render, upload, caption); unavoidable in one tab, but it shows no overall progress bar.

## 4. Where the raters are weak, vague or inconsistent

- **Rate (the analysis)**: one unstructured model call with the shape in the prompt, parsed tolerantly. Scores are the model's judgement with "be harsh"; the same input can score differently on two runs, and there is no cache, so re-analysing the same draft costs another unit and may say something else. Categories do carry explanation, evidence and fix, which is good; the overall has no formula beyond "weighted judgement".
- **Clip cards (pass 1)** rate moments strong/good/weak with a `why`, but nothing turns the measured facts (brightness, contrast, clipped highlights, level, silence share, scene-change density) into a per-clip score the person can see. The grid shows only "dark" and "quiet audio" flags.
- **Content Yield (pass 2)** is validated arithmetically (good), but its explanation is an evidence line of stats ("2 clips · 11 sec usable footage · strong opening · 3 distinct moments"), not a sentence; strength is a threshold, and order among equals is "the model's order", which is not stable between runs.
- **The cut (pass 3)** returns a `note` per segment that the UI shows in small type; there is no rating of the cut's pacing anywhere, so the person cannot tell a good cut from a lazy one without playing it.
- **Replace clip** picks the first non-weak moment; **fillCut** picks strongest-then-longest; **Make and schedule** orders strong, possible, clip. None of these says why.
- **Music** picks are explained per track (`why`) and the taste lines are plain, which is the model to copy.
- **Learn** is careful (sample sizes, settled results) and already explains itself.

## 5. Where the editor feels clunky

- Trimming by ± 0.5 s buttons, four per cut, next to a timeline that already trims by dragging.
- Reordering by Move up / Move down, next to drag-to-move.
- Swapping a clip through an unlabelled icon that hides a `<select>`.
- Changing a transition through a native `<select>` called "Comes in with" with no preview of what Fade, Zoom blur or Whip blur look like.
- Editing a text line: select it on the timeline, then find and expand its row in the Text tab; the two are not linked.
- Seven tabs (Cut, Frame, Style, Text & captions, Look & sound, Music, Regenerate) for a 9:16 phone edit, with Style mostly about captions now that text lines are presets.
- The main action, Make the video, sits in a card under the player; the header has Undo, Redo and Save.
- Undo exists but says nothing about what it will undo.
- No empty state in the editor's start screens beyond a dashed drop zone and a paragraph; Your videos and Your clips show "Loading…" lines.
- Nothing in Studio uses the Overview's motion (`components/dashboard/motion.tsx`); cards appear at once, rings do not fill, progress bars jump, and the only animations are the looping spinner dots and a few CSS transitions in the Improve walkthrough.
- On a phone the Cut tab's row of buttons wraps into three lines per cut; the timeline's drag handles are 14 px wide.

## 6. Tests

34 Studio test files cover the pure parts well (EDL snapping, timeline, tracks, transitions, yield, grade, sound, finish, batch, reference, facts, cut meter, style, overlay, learn, library, videos, auto look, guide-only, workspace scope, text render, studio fixes, review, guide). Missing: any test of pacing rules (opener, drag, readability, ending), beat alignment, caption page ends, the sound edge fade length, and the ordering of yield posts. `distribute.test.ts` tests code nothing uses.
