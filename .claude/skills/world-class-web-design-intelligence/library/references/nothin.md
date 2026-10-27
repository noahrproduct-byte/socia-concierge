# Nothin' (noth.in)

- **Category:** creative studio portfolio (Paris), Webflow-built
- **Studied:** 2026-10-26, desktop 1440×900 and phone 375×812, `extract-styles.js` run on the home page
- **Coverage:** home page in full (16,683px tall), the opening sequence frame by frame, scroll behaviour, hover on the hero wordmark area, one phone pass. Not seen: inner project pages, the "ASK US" widget's behaviour, the "Site of the Day" badge's destination, hover on the work cards (the pane's synthetic pointer doesn't fire their hover). The cookie banner was declined.
- **Why it's here:** Noah named it the creative-quality benchmark for SOCIA's landing page (2026-10-26).

## Measured (extract-styles.js, home page, desktop)

- **Fonts loaded:** PP Neue Montreal 400 / 500 / 700 (one family), IBM Plex Mono 400 for small labels.
- **Type scale (text elements):** 10.8px ×19, 16.2px ×19, 22.5px ×15, 12.6px ×14, 14.4px ×8, 72px ×6, 27px ×4, 36px ×3. Body is 14px/15.4px at 500.
- **Weights:** 500 ×54, 400 ×27, 700 ×8. The h2 is **500 at 72px**, tracking -0.72px (-0.01em): the big statements are medium weight, not bold.
- **Tracking:** small labels are tracked out (10.8px at +0.324px, i.e. +0.03em); 72px headlines pulled in -0.01em.
- **Colours:** text white ×74, black ×11, grey `rgb(142,142,142)` ×7. Backgrounds black ×9, white ×6, white at 50% ×4. **Three colours total.** No accent hue anywhere in the chrome.
- **Radii:** 3.6px (tiny, on images) ×11, 32px/90px/100px/50% on pills and the round "ASK US" button. Buttons are hairline-bordered pills.
- **Motion:** `opacity 0.3s ease` ×25 (the dominant transition), `border-color 0.4s ease`, and two choreographed ones: `opacity, transform 0.5s, 0.6s cubic-bezier(0.22, 1, 0.36, 1)` and `width, height, border-radius 0.62s cubic-bezier(0.22, 1, 0.36, 1)`. **One easing curve for everything that moves: ease-out-quint (0.22, 1, 0.36, 1)**, the same curve SOCIA already uses as `--ease-out`.
- **Stack:** Webflow, jQuery, GSAP-style timelines via Webflow interactions (main.js). GTM.

## Observed

### Opening sequence (about 4 seconds, black screen)
1. Black. Nothing for ~0.4s.
2. The letters **N'** appear at the centre, white, bold, tight.
3. N and ' drift apart, leaving a gap.
4. A monochrome 3D object (a knitted heart) appears in the gap.
5. The object is swapped for another (a glossy ring), then presumably more (two swaps seen in 3s).
6. Cut to the page: white background, the giant **NOTHIN'** wordmark filling the viewport width, nav top-left (two-line tagline + "BOOK A CALL →" pill), vertical nav top-right (WORKS STUDIO AWARDS METHOD CONTACT, stacked, 10.8px bold), "Creative studio in Paris" bottom-left, LINKEDIN / INSTAGRAM / EN bottom-right.
- **Mechanism:** the apostrophe is the brand's own punctuation; the gap between N and ' is a stage for the studio's work. The sequence is a story (the name opens up, the work appears, the name closes), not decoration. The objects are the studio's actual portfolio pieces.
- **Transfers to SOCIA:** yes, as a *method*: a mark that opens to reveal the product, then the page. Not the objects (SOCIA has no sculptures; its "work" is the app's screens).

### Page structure (desktop, top to bottom)
1. **Hero:** white, wordmark at ~22vw, two-line statement top-left, pill CTA. Left-aligned everything except the wordmark.
2. **Statement:** "Most brands produce content. We prefer ideas." at 72px/500, left, white on black. Below it, the first case study bleeds in as a full-width image.
3. **WORKS:** a label, then a right-aligned statement ("Good brands communicate. Great brands surprise."), then case studies as **full-bleed images** with a small mono label and one sentence each. Images alternate: landscape fern photo, a tilted poster, a laptop on a stand, a card, a laptop again. **No two consecutive compositions use the same framing.**
4. **Studio:** a photo (people in a waiting room), then "( The Studio )" label with a paragraph, left column empty on the left, text right.
5. **Forms follow perspective.** at 72px, with three small columns under it (We design: / list / Perspective is where strategy meets visual culture) and 3D objects scattered below.
6. A full-bleed video still (a person in a tinsel suit in a lift).
7. **Footer:** black, "Let's start from nothin'" at 36px, two pill buttons, three links, then the wordmark again at full width, cut off by the bottom edge, and a one-line credits row in mono.
- **Scroll:** native. **No scroll-jacking**, no smooth-scroll library detected. Sections are normal-flow; headlines are already at opacity 1 and transform none when scrolled to instantly, so there's no scroll-triggered text reveal (or it has already fired). Images are cropped tall and the eye moves between full-bleed photo and text block.
- **Rhythm:** big statement → full-bleed image → label + one sentence → image. Text blocks are short (one or two lines). Generous black bands between. Never two text blocks in a row.
- **Chrome:** the "N'" logo top-left stays fixed, the vertical nav top-right stays fixed, "ASK US" round button bottom-right stays fixed, a "Site of the Day" badge sits mid-left. Chrome inverts (black ↔ white) with the section behind it.

### Phone (375px)
- The opening is a white screen for several seconds (slow to load on the pane) then the same structure stacked: wordmark, "Most brands produce content." at ~40px over three lines, a black video frame, "( The step aside )" label, a paragraph. Case studies are full-width images with the label above. The "ASK US" button stays bottom-right. Nothing is squeezed; the phone page is a single column with the same pacing.

### Copy
- Short declaratives in pairs: "Not a style, a perspective." / "Most brands produce content. We prefer ideas." / "Good brands communicate. Great brands surprise." / "Forms follow perspective." Each pair is a contrast. Labels in parentheses: "( The Studio )", "( COOKIES )". Lowercase mono for file-like labels ("in_cognita").
- **Transfers:** the pair-of-contrasts form fits SOCIA's brief ("More data. Less direction."). Parentheses labels are a Nothin' signature; SOCIA shouldn't copy the device.

## What works, and why
1. **One family, three weights, two sizes that matter (72 and 16).** Hierarchy comes from size and black/white inversion, never from colour. (Mechanism: fewer variables, each change reads as intent.)
2. **Full-bleed imagery alternating with short text.** The page is paced like a magazine spread, and the image does the talking. (Mechanism: contrast of scale; the reader rests on the text, then is hit by the image.)
3. **The name is the hero and the footer.** It bookends the page at the same size, so the brand is what you arrive at and what you leave with.
4. **Fixed chrome that inverts per section.** The nav never leaves, but it stops competing because it recolours with the background.
5. **One easing for everything** (ease-out-quint). Durations 0.3 for colour/opacity, 0.5 to 0.62 for movement and shape.
6. **Buttons are hairline pills with an arrow**, white on black. (Noah's standard flags arrows on every button; here they appear only on the two real actions.)

## What not to copy
- The 3D sculptures and photography (their work), the "N'" mark, the apostrophe device, the "( label )" punctuation, the exact copy, the vertical stacked nav verbatim.
- The 4-second black intro before any content: Nothin' can afford it (visitors are there to look); a product site shouldn't hold the CTA hostage.
- Scroll-hidden hover reveals on the work cards (unverified anyway).

## Transfer to SOCIA (2026-10-26 brief: monochrome, champagne-gold accent, editorial)
- Replace the cobalt brand field with Nothin's black/off-white inversion. SOCIA's "work" is its screens: show them full-bleed in the dark bands the way Nothin' shows photos.
- Opening: the SOCIA mark opens to reveal a product screen, then the page. Shorter than 4s and skippable.
- Statement pairs at 72px/500: "More data. Less direction." etc. (Noah's copy.)
- Keep the ease-out-quint curve (already `--ease-out`), 0.3s opacity, 0.5 to 0.6s movement.
- Gold only on the few things that need a hand: the active nav item, one line under a statement, the focus ring. Never a background, never a gradient.
