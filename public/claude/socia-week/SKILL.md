---
name: socia-week
description: Make this week's social media videos from the person's SOCIA Content Plan and hand them in to SOCIA for their review. Use when they say "make my SOCIA videos", "make my week", "do this week's videos", or when a scheduled weekly run asks for it. Needs the SOCIA connector (get_videos_to_make, start_video_upload, submit_video).
---

# Make the week's SOCIA videos

SOCIA plans the person's week; you make the videos the plan gave to you, on this computer, and hand them in. SOCIA keeps every video for the person to review. Nothing is posted until they approve it, so take the time to make each one well.

## 1. Read the week

Call `get_videos_to_make` (pass `workspace_id` when several Brand Workspaces are shared; ask which one if unsure). Make every video whose status is `to_make` or `changes_requested`. For `changes_requested`, the person's `review_note` says what to change: do exactly that.

If the list is empty, say so and stop: either this week's videos are done, or the person hasn't chosen "My Claude makes them" in SOCIA's Growth Profile yet.

## 2. Make each video

Follow the brief: `concept`, `hook`, `direction` (what's on screen, scene by scene), `format` and `size`. Use the brand's `voice`, `font` and `accent_colour`, and never use anything listed under `avoid`. Only make the kinds in `brand.allowed_styles`:

- `animated`: motion graphics, shapes, icons and charts.
- `kinetic_text`: words animated on screen.
- `voiceover`: faceless, with a generated voice reading the script, plus captions.
- `slideshow`: still images with motion.

Never film anyone or use footage or photos of the person. Use only images and sounds you are allowed to use.

Build it in code. Remotion (React) or HyperFrames (HTML) are good choices; use whichever is installed, or set up Remotion with `npx create-video@latest`. Then:

- **Format:** `size` exactly (1080x1920 for Reels), 30 fps, H.264 MP4, usually 10 to 30 seconds. Use the guide's `length_sec` when there is one.
- **First frame:** the hook is readable in the first second. Don't open on a logo or a blank screen.
- **Safe area:** keep text out of the top 250 px and the bottom 400 px, where the app's buttons and caption sit.
- **Text:** large and high-contrast, on screen long enough to read (about 3 words a second), and no more than two type sizes.
- **Ending:** end on the one action the brief asks for.

## 3. Check it before handing it in

Render it, then look at frames from the start, the middle and the end (for example with ffmpeg: `ffmpeg -i video.mp4 -vf fps=1 frame_%02d.png`). Fix anything that isn't right:

- text that's cut off or overlapping;
- typos;
- something the brief didn't ask for;
- unreadable colours;
- a black or frozen frame.

The file must be at most 200 MB.

## 4. Hand it in

1. Call `start_video_upload` with the `item_id`, `mime` ("video/mp4") and `size_bytes`.
2. Upload the file:
   `curl -X PUT -H "Content-Type: video/mp4" --data-binary @video.mp4 "<upload_url>"`
3. Call `submit_video` with the `item_id`, the returned `path` and a caption in the brand's voice: the hook first, then one or two lines, the call to action, and at most five hashtags. Don't put numbers or claims in it that the brief doesn't give.

## 5. Report

Tell the person which videos you handed in, when each will go out once approved (`goes_out_at`), and anything you couldn't make and why. Remind them to review the videos on SOCIA's Calendar.
