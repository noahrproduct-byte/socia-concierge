# Editor training

Noah teaches Claude how he cuts short-form video, the same way the rater was
trained: raw clips in, a cut out, corrections back. The product's editor is
pass 3 of Build from Clips (`lib/studioClips/analysis.ts`, `opportunityEdl`);
what is learned here becomes its rubric and its reference cuts.

## The loop

1. Drop a shoot's raw clips into `samples/<name>/` (git ignores media there).
   Add the finished Reel you made from them, if there is one, as `reference.mp4`.
2. Claude samples each clip (`../rater/sample.sh`), writes a cut as an EDL in
   `samples/<name>/cut.json`, renders it with `cut.sh`, and logs it in
   `examples.json`.
3. Noah watches `cut.mp4`, says what is wrong and right, and the corrections go
   into `examples.json` next to the cut. Rules that repeat become `rubric.md`.

## The EDL `cut.sh` renders

```json
{
  "width": 1080, "height": 1920, "fps": 30,
  "segments": [{ "src": "clip1.mp4", "in": 2.4, "out": 5.1, "note": "opener: the pour" }],
  "text": [{ "at": 0, "end": 2.2, "text": "The 6am rush, from the other side", "role": "opening" }],
  "mute": false
}
```

Times are seconds: `in`/`out` inside the source clip, `at`/`end` in the output.
Segments play in order. Each source is scaled and centre-cropped to 9:16.
Text is drawn plainly (white, dark band) so the cut, not the styling, is what
gets judged. `cut.sh <dir>` reads `<dir>/cut.json` and writes `<dir>/cut.mp4`.
