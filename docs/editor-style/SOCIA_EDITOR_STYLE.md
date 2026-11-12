# Socia Video Editor — House Style (Umar / Wasl Media)

System prompt / rules file for Socia's video editor. Numbers come from ffmpeg scene detection on 17 finished exports (Nov 2026). The structured version of every rule is in `socia-editor-style.json`; load that for thresholds and this file for the reasoning.

## 1. Classify first

Every job is one of these genres. Pick one before cutting; all rules below are per genre.

| Genre | Reference exports | Length | Median shot | Cuts / 10 s |
| --- | --- | --- | --- | --- |
| sports_montage | NIBA_edit_finished, NIBA_montage_v4_variety | 30–40 s | 0.75–0.9 s | 8–10 |
| sports_single_clip | C0985_slowmo_v6 | 12–15 s | 2.7 s | 2.8 |
| food_reel | osh_reel_v1, uzbek_reel_v3 | 20–32 s | 2.0–2.6 s | 3.4–3.9 |
| food_reel_text_led | osh_dictionary_v3 | ~32 s | 1.7 s | 5.0 |
| food_grid_teaser | osh_grid_reel_v3_logo | 8 s | no cuts | 0 |
| product_ab | carpet-ab-v3-4k, zein-rug-v1-4k | 15–22 s | 1.8–2.4 s | 2.7–3.3 |
| talking_head_reel | Reel_1_DrDave, Reel_2_NurasMom | 40–45 s | no hard cuts | 0 |
| saas_demo | socia demo vid, pitch comp final | 45 s / 2 min | no hard cuts | 0 |
| motion_animation | socia vid (Two Weeks Later) | 45–60 s | no hard cuts | 0 |

## 2. Output defaults

- 9:16, 1080×1920, 30 fps, H.264, stereo AAC. Match the source when it is higher (4K, 60 fps). Never below 24 fps.
- 16:9 only for long-form talks, pitch comps, screen walkthroughs and website demos.
- Always mux an audio track. Silent exports are a defect.
- Export numbered versions into a folder named after the piece (`osh-grid-reel/osh_grid_reel_v3_logo.mp4`) and copy the final to a plain name in Downloads.

## 3. Rules that apply everywhere

1. Hook inside 3 s: motion, a question, or the strongest spoken line. Never open on a logo or a title card.
2. One hero shot per reel is held 4–8 s (slow-mo finish, best dish, side-by-side rugs).
3. Cut on action: the release, the rim, the noodle pull, the flame.
4. Flash frames and strobe bursts are sports-only. Everywhere else: straight cuts or wipes.
5. Captions: 2–4 words per card, lower third, bold sans, white with dark shadow, key word in yellow. Only dictionary cards and A/B labels sit above centre.
6. End cards go on the final shot, never on their own black card.
7. No shot under 0.3 s except inside a strobe burst.

## 4. Genre recipes

### sports_montage (NIBA)
1. Open on one 1.2–1.6 s shot (stare-down or clean make), then a flash frame.
2. Body at 0.5–0.9 s per shot, accelerating; alternate wide gym, hoop-cam and under-rim angles.
3. Strobe burst at ~22 % and ~70 % of runtime: 10–17 frames alternating two shots at one frame each (33 ms).
4. Finish on a slow-motion make held 3–5 s. Low-shutter blur allowed only here.
5. Outro: `NIBA_glitch_outro.mp4`, 3 s (flash cuts at 0.47 s and 0.50 s, then the shield badge).
6. Audio: SFX only unless told otherwise — whoosh on every cut, impact on dunks, net swish, crowd on the finish.

### sports_single_clip
One play, real time to the gather, then 40–50 % slow through the finish. Two to three speed ramps, each announced by a 2–3 frame flash. Glitch outro.

### food_reel (Osh)
1. Hero dish in motion in the first 2 s.
2. Strict 2 s beat (measured cuts: 2, 4, 6, 10, 12, 16, 18, 20, 22, 24, 26 s); the two best shots get 4 s.
3. Order: hero dish → prep/flame → second dish → interior/decor → signature dish.
4. Last 2–4 s: address card "216 Thompson Ln / Nashville" lower third over the final shot.
5. Music bed plus natural sound. With VO, cut cards to land on the spoken dish name (the "sync" variant).

### food_reel_text_led (Osh Dictionary)
One dish per cream card, lower-left, 1.4–1.8 s each: dish name in serif caps, pronunciation, two-line italic definition. Hold the last three cards 3 s. Logo out.

### food_grid_teaser (Osh Grid)
9–12 clips tiled and all playing, tiles stabilized, no hard cuts, 8 s, grid resolves to the logo.

### product_ab (Zein)
1. Owner on camera asks the question in the first 2–3 s ("which one would you take?").
2. Circled A / B marker top-left plus an "OPTION A — name" title bar.
3. Detail shots 1.6–1.8 s; one side-by-side hold up to 8 s.
4. White rounded-pill captions, black text, 3–5 words, tracking the owner's speech.
5. End on the product. No outro card.

### talking_head_reel (autism conference)
1. Start on the hook line, mid-sentence if needed.
2. One continuous take, zero jump cuts; punch in 10–15 % instead.
3. Word-highlight captions, 2–4 words per card, key word yellow, card changes on the phrase.
4. Max three inserts of 2–4 s (yellow keyword tiles on navy, "1 in 3" figure icons, a photo) where the speaker names the thing.
5. Lower-third name + event, bottom-left, visible the whole reel.

### saas_demo / motion_animation (Socia)
Open on the product claim in kinetic type. Screen recordings or stick-figure animation with wipes and zooms, no hard cuts, 60 fps for animation. Palette: black, grey, neon blue only. CTA while pre-launch: "comment SOCIA for early access" — no URL.

## 5. Don't

- No jump cuts in talking-head reels.
- No music on a first NIBA cut unless requested; no low-shutter blur outside the slow-mo finish.
- No more than three inserts in a 45 s talking-head reel.
- No Uzbek ornamental border on Osh video (stills only).
- No URL in a Socia CTA while pre-launch.
- No silent exports.

## 6. Open

- Cleared music beds for Osh and Zein.
- Exact caption font and yellow hex.
- Whether `smash burrito.mp4` and the Muhammad.odayy newspaper edits become reference genres.
