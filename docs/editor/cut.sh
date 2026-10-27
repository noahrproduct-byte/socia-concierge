#!/bin/zsh
# Render docs/editor EDL (cut.json) to cut.mp4 with ffmpeg. Local training
# tooling only; the product renders with Remotion in the browser.
# Usage: cut.sh <sample-dir>
set -e; setopt null_glob
d="$1"; [ -f "$d/cut.json" ] || { echo "no $d/cut.json" >&2; exit 1; }
cd "$d"
font="/System/Library/Fonts/Helvetica.ttc"
node - <<'JS' > .cut.args
const fs = require("fs");
const e = JSON.parse(fs.readFileSync("cut.json", "utf8"));
const W = e.width || 1080, H = e.height || 1920, fps = e.fps || 30;
const segs = e.segments || [];
if (!segs.length) { console.error("no segments"); process.exit(1); }
const inputs = [...new Set(segs.map((s) => s.src))];
const idx = (src) => inputs.indexOf(src);
let f = [], v = [], a = [], t = 0, timeline = [];
segs.forEach((s, i) => {
  const n = idx(s.src), dur = s.out - s.in;
  f.push(`[${n}:v]trim=start=${s.in}:end=${s.out},setpts=PTS-STARTPTS,scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${fps},format=yuv420p[v${i}]`);
  f.push(`[${n}:a]atrim=start=${s.in}:end=${s.out},asetpts=PTS-STARTPTS,aresample=48000[a${i}]`);
  v.push(`[v${i}]`); a.push(`[a${i}]`);
  timeline.push({ i, at: t, end: t + dur, note: s.note || "" }); t += dur;
});
f.push(`${v.join("")}concat=n=${segs.length}:v=1:a=0[vc]`);
f.push(`${a.join("")}concat=n=${segs.length}:v=0:a=1[ac]`);
const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/'/g, "\u2019").replace(/:/g, "\\:").replace(/%/g, "\\%");
let last = "[vc]";
(e.text || []).forEach((x, i) => {
  const y = x.role === "cta" ? "h*0.78" : x.role === "mid" ? "h*0.5-th/2" : "h*0.16";
  f.push(`${last}drawtext=fontfile=${process.env.FONT || "/System/Library/Fonts/Helvetica.ttc"}:text='${esc(x.text)}':fontsize=${Math.round(W * 0.052)}:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=22:x=(w-tw)/2:y=${y}:enable='between(t,${x.at},${x.end})'[t${i}]`);
  last = `[t${i}]`;
});
const args = [];
inputs.forEach((src) => args.push("-i", src));
args.push("-filter_complex", f.join(";"), "-map", last);
if (e.mute) args.push("-an"); else args.push("-map", "[ac]");
args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "-y", "cut.mp4");
fs.writeFileSync(".cut.timeline.json", JSON.stringify({ durationSec: t, segments: timeline }, null, 2));
process.stdout.write(args.map((x) => JSON.stringify(x)).join("\n"));
JS
args=()
while IFS= read -r line; do args+=("$(node -e 'process.stdout.write(JSON.parse(process.argv[1]))' "$line")"); done < .cut.args
FONT="$font" ffmpeg -hide_banner -loglevel error "${args[@]}"
rm -f .cut.args
echo "wrote $d/cut.mp4 ($(sed -n 's/.*"durationSec": \([0-9.]*\).*/\1/p' .cut.timeline.json | head -1)s)"
