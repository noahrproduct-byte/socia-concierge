# SOCIA — 30-Second Demo Video: Master Prompt

Use this with a motion designer or AI video tool. The video is built from **real screen recordings of the live product at socia-concierge.vercel.app** — no invented UI, no mockups. Motion graphics are the treatment (camera moves, highlights, text callouts) layered ON TOP of actual screen captures.

---

## THE PROMPT

Create a **30-second demo video** for **SOCIA**, an AI social media strategist web app. Format: 9:16 vertical (1080×1920) master + 16:9 recut. The raw material is screen recordings captured from the real website (dark mode on): the Dashboard, the Competitors page, the Video Scorer, and the AI chat. The job is to edit these recordings into a fast, premium product demo — think **Linear / Vercel / Arc launch video**: smooth simulated camera pushes and pans across the UI, speed-ramped cursor actions, clean text callouts. Not a video game, no neon, no glitch effects.

### CAPTURE LIST (record these on the live site, dark mode, real data on screen)
1. **Dashboard** loading — the numbers count up and charts draw in on their own (the app animates natively; capture at 60fps and let the UI do the work).
2. **Competitors page** — full load: the intelligence strip counting up, clicking a competitor chip (the whole page re-animates), the trajectory chart, gap bars, donut, heatmap, score ring filling.
3. **Video Scorer** — uploading a clip, the frame filmstrip, the score appearing, the retention curve drawing, clicking a fix to seek the video.
4. **AI chat** — typing a short question, the answer streaming in.
5. Browser bar visible for one beat at the end showing **socia-concierge.vercel.app**.

### BRAND / TREATMENT
- Keep the app's own palette (deep navy, violet `#7B6CF6`); callout text in near-white, one accent only.
- Callouts: tiny uppercase micro-labels (10–12px style, letterspaced), max 4 words each, animating on with a 150ms slide+fade. Never paragraph text.
- Motion: simulated camera pushes (105–115% scale) toward the element being talked about; everything eased `cubic-bezier(0.22,0.9,0.3,1)`; speed-ramp boring moments (typing, loading) to 2–4×, hold on payoffs at 100%.
- A thin violet **scan-sweep** transition between scenes (matches the app's own animation language).
- Sound: minimal electronic pulse, soft ticks synced to the app's counters, one warm chime at the CTA. No corporate stock music.

### TIMELINE (30s)

**0:00–0:03 — HOOK.** Hard open, already inside the Competitors page mid-load: numbers counting up, scan line sweeping.
Callout: `AN AI JUST SCANNED YOUR MARKET`
VO: *"What if an AI watched your whole market for you?"*

**0:03–0:09 — COMPETITORS.** Push in on the intelligence strip (`#2 of 6`, score counting to 74), then a quick cursor click on a competitor chip — the entire page morphs. Snap-pan to the gap bars: green "you lead", coral "they lead".
Callout: `WHO'S WINNING — AND WHY`
VO: *"SOCIA shows who's beating you, where, and why — on real data."*

**0:09–0:16 — VIDEO SCORER.** Cut to the scorer: clip drops in (speed-ramped), filmstrip fans out, score lands, retention curve draws, camera pushes to the coral drop marker at 0:03, cursor clicks a fix and the video seeks there.
Callout: `SCORED BEFORE YOU POST`
VO: *"It scores your videos before you post — and tells you what to fix, down to the second."*

**0:16–0:21 — DASHBOARD + CHAT.** Fast split: dashboard numbers counting up and charts drawing (2 beats), then the chat — question typed at 3× speed, answer streaming.
Callout: `ASK ANYTHING · YOUR DATA`
VO: *"Your analytics, your best posting times — and a strategist you can just ask."*

**0:21–0:26 — THE PAYOFF.** Push in slowly on the "Your next move" recommendation card in Competitors. Music drops to a pulse. Hold.
Callout: none — let the card speak.
VO: *"From data… to your exact next move."*

**0:26–0:30 — CTA.** Zoom out to the full page, browser bar visible with the URL, then cut to navy end-card: SOCIA wordmark + waveform pulse.
On-screen: **"Stop guessing."** → **socia-concierge.vercel.app** · `EARLY ACCESS`
VO: *"SOCIA. Early access — socia-concierge dot vercel dot app."*

### HARD RULES
- Only real screen recordings — if a feature can't be captured live, cut it, don't fake it.
- Max 4 words per callout; the UI's own animated numbers are the star.
- No growth guarantees in copy; the product "shows / scores / recommends".
- Deliver: 30s 9:16 master, 16:9 recut, versions with and without VO, captions burned-in variant for social.
