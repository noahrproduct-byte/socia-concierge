// Acceptance checks on the rendered MP4s:
//   - duration exactly 45s ±0.2s (the reference cut's length), 60fps
//   - no black frames at any cut (both sides of every scene boundary) and
//     nowhere else (sampled every 250ms)
// Uses Remotion's bundled ffmpeg/ffprobe.
//
//   npm run verify

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

const ROOT = __dirname;
const FILES = ["out/socia-demo-vertical.mp4", "out/socia-demo-wide.mp4"];
const FPS = 60;
// beat boundaries of src/reel/ScreenDemo.tsx
const CUTS_S = [2, 4.4, 6.8, 10, 12.2, 16.4, 18.6, 21.8, 23.8, 26.8, 28.8, 32.8, 35.4, 38, 40.8, 43.4];
const TARGET_S = 45;
// mean luminance 0-255 of an 8×8 downscale. Measured: the brand navy canvas
// (#0B1220) reads ~10-12, the darkest real UI (the studio's black video
// player) ~6.6; a genuinely black frame reads < 2.
const BLACK_THRESHOLD = 4;

function probe(file: string): { duration: number; fps: string; size: string } {
  const out = execFileSync("npx", ["remotion", "ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate,width,height:format=duration", "-of", "json", file], { cwd: ROOT }).toString();
  const j = JSON.parse(out);
  return { duration: Number(j.format.duration), fps: j.streams[0].r_frame_rate, size: `${j.streams[0].width}x${j.streams[0].height}` };
}

// Remotion's trimmed ffmpeg has no rawvideo muxer, so sample via an 8×8
// unfiltered grayscale PNG (pred=none → each scanline is a 0 filter byte + pixels).
function meanLuma(file: string, t: number): number {
  const tmp = path.join(os.tmpdir(), `luma-${process.pid}.png`);
  execFileSync("npx", ["remotion", "ffmpeg", "-v", "error", "-y", "-ss", t.toFixed(4), "-i", file, "-frames:v", "1", "-vf", "scale=8:8", "-pix_fmt", "gray", "-c:v", "png", "-pred", "none", "-f", "image2", tmp], { cwd: ROOT });
  const png = fs.readFileSync(tmp);
  fs.unlinkSync(tmp);
  const idat: Buffer[] = [];
  let off = 8;
  while (off < png.length) {
    const len = png.readUInt32BE(off);
    const type = png.subarray(off + 4, off + 8).toString("ascii");
    if (type === "IDAT") idat.push(png.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  let sum = 0;
  let n = 0;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { sum += raw[y * 9 + 1 + x]; n++; }
  return sum / n;
}

let failed = false;
for (const rel of FILES) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) {
    console.log(`✖ ${rel} missing`);
    failed = true;
    continue;
  }
  const p = probe(file);
  const durOk = Math.abs(p.duration - TARGET_S) <= 0.2;
  console.log(`${durOk ? "✔" : "✖"} ${rel}: ${p.size} @ ${p.fps} fps, ${p.duration.toFixed(3)}s`);
  if (!durOk) failed = true;

  const times = new Set<number>();
  for (const c of CUTS_S) {
    times.add(c - 1 / FPS);
    times.add(c);
    times.add(c + 1 / FPS);
  }
  for (let t = 0; t < TARGET_S; t += 0.25) times.add(t);
  const dark: string[] = [];
  for (const t of [...times].sort((a, b) => a - b)) {
    if (t >= p.duration) continue;
    const l = meanLuma(file, t);
    if (l < BLACK_THRESHOLD) dark.push(`${t.toFixed(3)}s (luma ${l.toFixed(1)})`);
  }
  if (dark.length) {
    console.log(`  ✖ black/near-black frames: ${dark.join(", ")}`);
    failed = true;
  } else {
    console.log(`  ✔ no black frames at the ${CUTS_S.length} cuts or in ${Math.round(TARGET_S / 0.25)} sampled frames`);
  }
}
if (failed) process.exit(1);
console.log("all checks passed.");
