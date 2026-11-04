# Soundtrack sources

Cues live in `../sound.ts`; files are imported in `../audioFiles.ts`.

## Voice (`vo/`)

ElevenLabs Eleven v4, voice "Declan Sage - Wise, Deliberate, Captivating" (library voice `kqVT88a5QfII1HNAEPTJ`), Noah's pick on 2026-10-27 (option 11 of the samples in `out/voice-options/`), with a shorter script so the reel runs about a minute at roughly the reference's pace. Generated through Noah's ElevenLabs connector, one clip per chapter. Raw takes are in `vo/raw/voNN.mp3`; `process-vo.sh` trims silence, speeds them to 1.2x (pitch kept), normalises to about -16 LUFS with a -1.5 dBTP ceiling, and writes `vo/NN.mp3`. Word timings for the on-screen beats came from whisper-cli (base.en) on the processed clips. Earlier voices are kept for reference: Grady (the 54 s cut) in `vo-grady/`, K. V. Hagen and James (the 103 to 105 s cuts) in `vo-hagen/` and `vo-james/`.

Lines (the number is the clip; the chapter it opens is in brackets):

00 [hook] How to go from twelve to fifty thousand monthly views, without guessing what to post.
01 [meet] Meet SOCIA. It reads your accounts, plans your week, makes your videos, posts for you, and learns what works.
02 [step 01] Step one. Connect Instagram, Facebook, YouTube and TikTok, once. SOCIA reads your account, your niche, your audience, your competitors and every Reel.
03 [step 02] Step two. It ranks every post against your own median, so the winners jump out. Live in Claude? Connect it through MCP.
04 [step 03] Step three. This is where the magic happens. Your winners become a full week of posts. Thirty-five decisions, made for you.
05 [step 04] Step four. Drop in clips as you film, and Content Studio keeps building videos. Then the rater grades the hook, pacing, clarity, visuals, call to action and audio, and tells you what to fix.
06 [step 05] Step five. Schedule the week and SOCIA posts it for you. Then double down on what worked.
07 [cta] Follow, then comment early access, and I'll send you the link. The first fifty get a week free.

Claims and what backs them: "ranks every post against your own median" and the top-post panel are the app's Reels tracking (real numbers for @salvoshermitage); "connect it through MCP" is the Settings > AI assistants connector with its read-only tools; the content plan is the account's real 7-day plan; "keeps building videos" is Content Studio > Build from clips; the rater is Content Studio's analysis (its scores on screen are a labelled example); "posts it for you" is scheduling + publishing; "a week free" matches the 7-day trial checkout gives every first subscription.

## Effects (`sfx/`)

Pixabay Content License, bundled with the HyperFrames media-use skill; see `sfx/CREDITS.md`. One sound per visible action: a short whoosh on each chapter seam, a soft click as each verb, spoke, row, clip and rater line lands, a pop when the multipliers flip, the MCP option appears, the winning cells light and a cut is built, a riser into the call to action and a bass impact when the mark lands.

## Mastering

After `npm run render:method`, `sh src/method/audio/master.sh out/socia-method.mp4 out/socia-method-final.mp4` measures the mix, applies a fixed gain to -14 LUFS integrated and limits the true peak at -1 dBTP.

## Music

None. Noah asked for the bed to be removed (2026-10-27); `BED` in `../sound.ts` stays null.
