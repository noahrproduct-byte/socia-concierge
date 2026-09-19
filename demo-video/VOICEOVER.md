# SOCIA demo — two-voice VO script (45s)

Timed to `out/socia-demo-wide-4k30.mp4`. **A** = you, **B** = partner.
Conversational, not "announcer". ~115 words total — that's a relaxed pace,
so don't rush; the pauses are part of it. Record each line separately so
they're easy to drop on the timeline.

| Time | On screen | Who | Line |
|---|---|---|---|
| 0:00 | Logo blasts in | — | *(silence — let the logo hit)* |
| 0:02 | Cards float around the SOCIA wordmark | **A** | Every creator asks the same question. |
| 0:04 | "The intelligence engine for creators & brands." | **B** | *What do I post next?* |
| 0:07 | Competitors page, cursor clicks Views → Followers | **A** | SOCIA starts with your market. It tracks the accounts you're up against… |
| 0:10 | "See who's winning — and why." | **B** | …and tells you who's winning — and *why*. |
| 0:12 | Upload → frames extract → score ring draws in | **A** | Then, before you post anything, you drop it in. |
| 0:15 | *(score lands at ~0:15)* | **B** | It gets scored. Hook, pacing, clarity, CTA. |
| 0:16 | "Scored before you post." | **A** | Forty-nine out of a hundred. Ouch. |
| 0:19 | Top 3 fixes, cursor hits "Jump to 0:00" | **B** | But look — it tells you exactly what to fix, and jumps you to the second it's talking about. |
| 0:22 | "Top 3 fixes, ranked." | **A** | Ranked. Biggest win first. |
| 0:24 | Dashboard cards (audience / formats / competitors) | **B** | Your audience, every format's numbers, your competitors — one screen. |
| 0:27 | "Ask anything. Your data." | **A** | And when you've got a question… |
| 0:29 | Ask SOCIA — typing "why did my reach drop this week?" | **B** | *(reading the screen)* "Why did my reach drop this week?" |
| 0:31 | Answer streams in | **A** | It answers from *your* numbers. Not generic advice. |
| 0:33 | "Answers with receipts." + structured answer card | **B** | Observed, derived, recommended. Receipts every time. |
| 0:35 | "Then it builds the plan." + action buttons | **A** | Then it builds this week's plan — and schedules it. |
| 0:38 | "All in one engine." + checklist | **B** | Competitors, scoring, answers, plan, calendar. |
| 0:41 | Three icons + "and it keeps learning." | **A** | And it keeps learning every time you post. |
| 0:43 | End card — "Know what to post *before* you post it." | **B** | SOCIA. |
| 0:44 | | **A** | Know what to post — *before* you post it. |

## Recording notes

- **Tempo:** land each line at its timestamp; if a line runs long, cut words, don't speed up. The 0:19 line is the longest — say it quick and casual.
- **Energy:** A is the setup voice (curious, calm). B is the payoff voice (a little more punch). Swap if that's not you two.
- **Handoffs:** 0:07→0:10 and 0:27→0:29 are true hand-offs — A trails off, B finishes the thought. Leave a beat of air, don't overlap.
- **The "Ouch" (0:16)** and **"Ranked." (0:22)** are the comedic beats — dry, not big.
- **Mic:** same room, same distance for both of you, phone voice memos are fine. Record 3 takes of each line, back to back, pick later.
- **Deliver:** one file per speaker (or one mixed file), 48 kHz WAV or MP3.

## Dropping it into the render

Put the final mix at `demo-video/captures/vo.mp3`, set `AUDIO_SRC = "vo.mp3"`
in `demo-video/src/timeline.ts`, then:

```bash
cd ~/Documents/GitHub/socia-concierge/demo-video && REMOTION_FPS=30 npx remotion render src/index.ts SociaDemoWide out/socia-demo-wide-4k30-vo.mp4 --scale=2 --crf=17
```

If the lines land a little off the beats, send me the audio — I'll nudge
the beat timings in `ScreenDemo.tsx` to match your read rather than the
other way round.

---

# Version B — "showing a friend" (conversational)

Same timings. A is showing the app; B is a bit skeptical and gets won over.
Don't perform surprise — react. Slight overlaps are fine here.

| Time | On screen | Who | Line |
|---|---|---|---|
| 0:00 | Logo | — | *(silence)* |
| 0:02 | Cards around wordmark | **A** | Okay so you know how we used to just… post and pray? |
| 0:04 | "The intelligence engine…" | **B** | Yeah. Don't remind me. |
| 0:07 | Competitors, cursor clicks | **A** | This is what we use now. First thing it does — it scans everyone in your niche. |
| 0:10 | "See who's winning — and why." | **B** | Not just who's big. Who's actually *winning* right now, and why. |
| 0:12 | Upload → score ring | **A** | Then you take a video you were about to post… and drop it in. |
| 0:15 | Score lands | **B** | Oh it's scoring it? |
| 0:16 | "Scored before you post." | **A** | Before you post. Forty-nine. |
| 0:19 | Fixes, "Jump to 0:00" | **B** | Wait — it's telling you the first three seconds are dead and *jumping* you there? |
| 0:22 | "Top 3 fixes, ranked." | **A** | Three fixes, in order. Fix the top one, the score moves. |
| 0:24 | Dashboard cards | **B** | And this is all your accounts — audience, formats, competitors? |
| 0:27 | "Ask anything. Your data." | **A** | All of it. Now watch this. |
| 0:29 | Typing the question | **A** | "Why did my reach drop this week?" |
| 0:31 | Answer streams in | **B** | And it actually answers? From *your* numbers? |
| 0:33 | "Answers with receipts." | **A** | With receipts. What it saw, what it worked out, what to do. |
| 0:35 | "Then it builds the plan." | **B** | And then it just… builds the week for you. |
| 0:38 | "All in one engine." | **A** | Competitors, scoring, answers, plan, calendar. One tab. |
| 0:41 | "and it keeps learning." | **B** | And it gets smarter every time you post. |
| 0:43 | End card | **A** | SOCIA. |
| 0:44 | | **B** | Know what to post before you post it. |

---

# Version C — "the roast" (rapid-fire)

B roasts A's content, the 49/100 proves it, A gets the last laugh.
Straight-faced. Every line under two seconds.

| Time | On screen | Who | Line |
|---|---|---|---|
| 0:00 | Logo | — | *(silence)* |
| 0:02 | Cards around wordmark | **B** | Your last three posts flopped. |
| 0:04 | "The intelligence engine…" | **A** | Okay, rude. But watch. |
| 0:07 | Competitors, cursor clicks | **A** | I pulled up everyone in our niche. |
| 0:10 | "See who's winning — and why." | **B** | Oh — so it shows who's actually beating you. |
| 0:12 | Upload → score ring | **A** | And then I put in the one you *said* was fine. |
| 0:15 | Score lands | **B** | Forty-nine. |
| 0:16 | "Scored before you post." | **A** | …I said watch, not gloat. |
| 0:19 | Fixes, "Jump to 0:00" | **B** | It says your first three seconds are a black frame. |
| 0:22 | "Top 3 fixes, ranked." | **A** | And it tells me how to fix it. In order. |
| 0:24 | Dashboard cards | **B** | Okay that's genuinely useful. |
| 0:27 | "Ask anything. Your data." | **A** | Wait till you see this. |
| 0:29 | Typing the question | **A** | "Why did my reach drop this week?" |
| 0:31 | Answer streams in | **B** | It just… answered you. |
| 0:33 | "Answers with receipts." | **A** | From my numbers. With receipts. |
| 0:35 | "Then it builds the plan." | **B** | And built you a plan. |
| 0:38 | "All in one engine." | **A** | Scan, score, ask, plan. One app. |
| 0:41 | "and it keeps learning." | **B** | So no more flops? |
| 0:43 | End card | **A** | No more guessing. |
| 0:44 | | **B** | SOCIA. Know what to post before you post it. |

---

# Version D — PITCH COMPETITION (use this one)

Two founders, judge-facing. Problem → product → why it matters. Every line
is a claim the screen is proving at that moment. ~135 words — confident
pitch pace, no faster. No traction numbers in the VO unless real; put those
on the slide before/after.

| Time | On screen | Who | Line |
|---|---|---|---|
| 0:00 | Logo | — | *(silence — let the logo land)* |
| 0:02 | Cards around wordmark | **A** | Every small brand on Instagram is guessing. What to post, when, and why it didn't work. |
| 0:04 | "The intelligence engine…" | **B** | We built SOCIA to replace the guessing with evidence. |
| 0:07 | Competitors, cursor clicks | **A** | It starts with the market. SOCIA tracks the accounts you compete with — |
| 0:10 | "See who's winning — and why." | **B** | — and shows you who's winning, and the specific reasons why. |
| 0:12 | Upload → score ring | **A** | Then it moves upstream. Before a post goes live, you drop it in — |
| 0:15 | Score lands | **B** | — and it's scored on hook, pacing, clarity, and call to action. |
| 0:16 | "Scored before you post." | **A** | This one scored forty-nine. |
| 0:19 | Fixes, "Jump to 0:00" | **B** | And instead of a grade, you get the fix — down to the exact second in the video. |
| 0:22 | "Top 3 fixes, ranked." | **A** | Ranked by impact, so you do the one that matters first. |
| 0:24 | Dashboard cards | **B** | Audience, format performance, competitors — one dashboard, all real data. |
| 0:27 | "Ask anything. Your data." | **A** | And when you have a question, you just ask. |
| 0:29 | Typing the question | **B** | "Why did my reach drop this week?" |
| 0:31 | Answer streams in | **A** | It answers from your own numbers — |
| 0:33 | "Answers with receipts." | **B** | — with receipts: what it observed, what it derived, what it recommends. |
| 0:35 | "Then it builds the plan." | **A** | Then it turns that into the week's content plan, ready to schedule. |
| 0:38 | "All in one engine." | **B** | Competitor intelligence, pre-post scoring, and an analyst — in one product. |
| 0:41 | "and it keeps learning." | **A** | And every post makes it smarter about *your* account. |
| 0:43 | End card | **B** | SOCIA. |
| 0:44 | | **A** | Know what to post before you post it. |

Delivery: slow down; cut "specific" (0:10) or "all real data" (0:24) if
running hot. "Forty-nine" is the credibility beat — say it plainly. The
hand-offs (0:07→0:10, 0:12→0:15, 0:31→0:33) should sound like one sentence
shared by two people.

---

# Version E — PITCH COMPETITION, single voice (use this one)

~130 words in 45s, pitch pace. Pause at every dash — that's where the
screen changes. Record one continuous take against the muted video.

| Time | On screen | Line |
|---|---|---|
| 0:00 | Logo | *(silence — let the logo land)* |
| 0:02 | Cards around wordmark | Every small brand on Instagram is guessing — what to post, when, and why it didn't work. |
| 0:04 | "The intelligence engine…" | We built SOCIA to replace the guessing with evidence. |
| 0:07 | Competitors, cursor clicks | It starts with the market. SOCIA tracks the accounts you compete with — |
| 0:10 | "See who's winning — and why." | and shows you who's winning, and why. |
| 0:12 | Upload → score ring | Then it moves upstream. Before a post goes live, you drop it in — |
| 0:15 | Score lands | and it's scored on hook, pacing, clarity, and call to action. |
| 0:16 | "Scored before you post." | This one scored forty-nine. |
| 0:19 | Fixes, "Jump to 0:00" | Instead of a grade, you get the fix — down to the exact second in the video. |
| 0:22 | "Top 3 fixes, ranked." | Ranked by impact, so you do the one that matters first. |
| 0:24 | Dashboard cards | Audience, format performance, competitors — one dashboard. |
| 0:27 | "Ask anything. Your data." | And when you have a question, you just ask. |
| 0:29 | Typing the question | "Why did my reach drop this week?" |
| 0:31 | Answer streams in | It answers from your own numbers — |
| 0:33 | "Answers with receipts." | with receipts: what it observed, what it derived, what it recommends. |
| 0:35 | "Then it builds the plan." | Then it turns that into the week's content plan, ready to schedule. |
| 0:38 | "All in one engine." | Competitor intelligence, pre-post scoring, and an analyst — in one product. |
| 0:41 | "and it keeps learning." | And every post makes it smarter about *your* account. |
| 0:43 | End card | SOCIA. |
| 0:44 | | Know what to post before you post it. |

If running hot, cut "and call to action" (0:15) and "ready to schedule"
(0:35) first. "Forty-nine" flat and plain. Drop on "SOCIA.", lift on the
last line.
