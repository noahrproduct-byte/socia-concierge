# Calendar week brief (SOCIA workspace, week of 2026-11-02)

Noah asked for a video for every post on the Socia workspace's SOCIA Calendar this week.
Each builder makes its share, renders, checks and reports back. Nothing is posted, sent on
Telegram or committed.

## How to build (same pipeline as the reel bot)

Read `.claude/skills/reel-remake/SKILL.md` sections 3 (Build) and 4 (Check) and follow
them, except: there is no reference reel, so the fidelity rule doesn't apply. Template to copy the
structure from: `demo-video/src/daily-2026-11-01-pm/` (story.ts holds copy, timings and data;
Reel.tsx holds scenes; index.ts registers the composition). SOCIA tokens and fonts are at the
top of that Reel.tsx. Reusable pieces: `src/method/ui.tsx`, `src/method/audio/sfx/`,
`src/brand/socia-mark.png`, a Claude chat look in `src/claude-connect/` and
`src/laptop-connect/`.

- Folder: `demo-video/src/cal-<mmdd>-<slug>/`, composition id `Cal<MMDD><Slug>`.
- Render WITHOUT touching package.json (other builders run at the same time):
  `cd /Users/noah/my-project/demo-video && npx remotion render src/cal-<mmdd>-<slug>/index.ts <Id> out/cal-<mmdd>-<slug>.mp4 --concurrency=3`
  then `sh src/method/audio/master.sh out/cal-<mmdd>-<slug>.mp4 out/cal-<mmdd>-<slug>-final.mp4`.
- 1080×1920, 30 fps, 20 to 45 s. No music (Noah adds it in the app). Sound effects are fine.
- Voice: ElevenLabs `creative_generate_speech`, model `eleven_v4`, voice Declan Sage
  `kqVT88a5QfII1HNAEPTJ`, 2 takes, keep the one with fewer pauses (poll
  `creative_get_flow_run_status`, then get the audio URL from `creative_get_generations` and curl it).
  Process: silenceremove (stop_duration 0.2) → atempo to about 3.3 to 3.7 words/s → loudnorm. Time
  captions from `whisper-cli -m /Users/noah/Downloads/Projects/reels/bin/whisper.cpp/models/ggml-base.en.bin -f x.wav -ml 1 -oj` on a 16 kHz mono wav.
- Captions: each word eases in over about 0.3 s (rise, fade, light blur), no ghost words; a
  finished line fades out before the next. Nothing important below y 1390 or under the right-side
  buttons.
- Hook on screen in the first second. Each video should look different from the others (layout,
  colour moment, motion idea) while staying on SOCIA's brand.
- Check: tile frames from every scene and look at them; step through frames around caption
  changes. Fix and re-render. Never report a video you haven't looked at.

## Honesty (release gate)

- Only real numbers, from the facts below or from the SOCIA MCP tools (workspace_id
  `76cbbf46-2622-4864-9515-650d2974edd3`). Show the source on screen when a number appears, e.g.
  "SOCIA Analytics · @socia.appmedia · Nov 2".
- Anything illustrative (other accounts, a "before" calendar, competitor rows) carries an EXAMPLE
  label that nothing covers.
- When the video shows "Claude's answer", it must be a real answer: you are Claude, so call the
  SOCIA MCP tools yourself, answer the exact on-screen question from those results only, and show
  that answer faithfully (shortened is fine, changed meaning is not).
- Never say SOCIA builds the videos (Noah's rule: SOCIA is the data: it reads your posts and what's
  trending, rates, publishes when you approve, tracks results; Claude builds the video).
- Never claim a SOCIA feature that doesn't exist. True features are listed in
  `demo-video/reel-bot/daily-ideas.md`. If unsure, check the app code, don't guess.
- Say "coming soon", never sociaos.com or "link in bio". The calendar drafts mention sociaos.com;
  replace it. No em dashes in on-screen text or captions; sentence case.
- No waitlist counts or follower promises.

## Real facts (SOCIA MCP, 2026-11-03 00:41 UTC; Instagram @socia.appmedia, the only connected account)

- 26 followers. Last 30 days: 9 Reels, 3,610 views, 2,906 reach, 304 interactions, median post
  20 interactions, engagement rate 10.6% of reached accounts.
- Breakout: "Connect Claude to your Instagram in 60 seconds" (published Nov 1, 7:22 PM CST):
  1,826 views, 1,550 reach, 40 likes, 19 comments, 41 saves, 18 shares, 118 interactions,
  5.9× the median. More saves (41) than likes (40).
- "One reel went viral. The other flopped..." (Nov 1, 10:45 PM CST, about 3 h 20 min after the
  breakout, same evening): 245 views, 207 reach, 9 likes, 1 comment, 2 saves, 1 share,
  13 interactions, 0.65× median. Its caption opens with a story and names SOCIA early.
- "Stop guessing what to post." (Oct 27): 513 views, 23 likes, 20 comments, 5 saves, 27 shares,
  75 interactions, 3.75×. Repeats of that opener: Oct 28 "I stopped guessing..." 241 views / 27;
  Oct 31 "Stop guessing..." 152 / 21; Oct 28 "I stopped guessing..." 150 / 10; Oct 29 "Stop
  guessing..." 144 / 9. (6 of 9 Reels reuse that opener.)
- "3 tools" listicle (Oct 30): 163 views, 11 interactions. "Connect Claude... Comment CLAUDE"
  (Oct 29): 176 views, 20 interactions.
- Best time to post: SOCIA says the 9 posts don't show a time window with clearly higher median
  engagement yet (not enough history). It does not invent one.
- The weekly Content Plan (generated Nov 2): headline "Health 34/100"; top fix 1: build every
  Reel on the breakout's formula (named tool + specific outcome + time box, proof on screen, name
  SOCIA after the result) and retire "stop guessing"; fix 2: at most one post a day, 5 a week;
  fix 3: end with a CTA you can answer in comments, and cross-post to TikTok, YouTube Shorts and
  Facebook Reels. Read it in full with `get_content_plan`.
- Instagram's API doesn't give SOCIA per-day views for this account yet.

## Report back

For each video: the file path of the -final.mp4, its length, the calendar post it's for, a
proposed caption (no em dashes, no sociaos.com), what's real vs EXAMPLE in it, and anything you
couldn't do. Don't edit package.json, the reel-bot files, or anything outside your own
`src/cal-*` folders and `out/cal-*` files.
