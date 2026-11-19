// Looks at a cut's own footage in the browser to find where the person's head
// is at the moments that matter (lib/studioClips/placement.ts picks them), so
// graphics, lines and captions can be kept off the face. It uses the person
// finder the cut-out already loads (lib/studioClips/matte.ts): each frame is
// drawn small and the rows that hold a person give the band their body fills.
// Nothing leaves the computer. Browser only; any failure means "not looked
// at", never an error.
import { loadSegmenter, MATTE_WIDTH } from "./matte";
import { headOf, type Band, type Look, type Sample } from "./placement";

const ROW_SHARE = 0.06; // a row counts as "person" when this share of it is
const MIN_ROWS = 0.08;  // a person fills at least this share of the frame's height
const BUDGET_MS = 25_000;

const seek = (v: HTMLVideoElement, sec: number) => new Promise<void>((ok, bad) => {
  const done = () => { v.removeEventListener("seeked", done); v.removeEventListener("error", fail); ok(); };
  const fail = () => { v.removeEventListener("seeked", done); v.removeEventListener("error", fail); bad(new Error("seek")); };
  v.addEventListener("seeked", done); v.addEventListener("error", fail);
  v.currentTime = Math.max(0, sec);
});

/** The band of the output frame the source band lands in, for a centred cover fit. */
export function toOutput(band: Band, srcW: number, srcH: number, outW: number, outH: number): Band {
  const srcA = srcW / srcH, outA = outW / outH;
  const h = srcA > outA ? 1 : outA / srcA; // the picture's height as a share of the frame's
  const at = (y: number) => Math.min(1, Math.max(0, y * h - (h - 1) / 2));
  return { top: at(band.top), bottom: at(band.bottom) };
}

export async function lookAtCut(samples: Sample[], sources: { clipId: string; url: string; width?: number | null; height?: number | null }[], out: { width: number; height: number }, signal?: AbortSignal): Promise<Look[]> {
  if (!samples.length || typeof document === "undefined") return [];
  const started = performance.now();
  try {
    const seg = await loadSegmenter();
    if (!seg) return [];
    const looks: Look[] = [];
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return [];
    for (const clipId of [...new Set(samples.map((s) => s.clipId))]) {
      const src = sources.find((s) => s.clipId === clipId);
      if (!src) continue;
      const v = document.createElement("video");
      v.crossOrigin = "anonymous"; v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = src.url;
      try {
        await new Promise<void>((ok, bad) => { v.onloadeddata = () => ok(); v.onerror = () => bad(new Error("load")); });
        const W = MATTE_WIDTH, H = Math.max(1, Math.round((MATTE_WIDTH * v.videoHeight) / Math.max(1, v.videoWidth)));
        canvas.width = W; canvas.height = H;
        for (const s of samples.filter((x) => x.clipId === clipId)) {
          if (signal?.aborted || performance.now() - started > BUDGET_MS) return looks;
          await seek(v, Math.min(s.clipSec, Math.max(0, v.duration - 0.05)));
          ctx.drawImage(v, 0, 0, W, H);
          let body: Band | null = null;
          seg.segment(canvas, (res) => {
            const m = res.confidenceMasks?.[0];
            if (!m) return;
            const conf = m.getAsFloat32Array();
            let first = -1, last = -1, rows = 0;
            for (let y = 0; y < m.height; y++) {
              let on = 0;
              for (let x = 0; x < m.width; x++) if (conf[y * m.width + x] > 0.6) on += 1;
              if (on / m.width >= ROW_SHARE) { if (first < 0) first = y; last = y; rows += 1; }
            }
            if (first >= 0 && rows / m.height >= MIN_ROWS) body = { top: first / m.height, bottom: (last + 1) / m.height };
          });
          looks.push({ sec: s.sec, head: body ? headOf(toOutput(body, v.videoWidth, v.videoHeight, out.width, out.height)) : null });
        }
      } catch { /* this clip could not be read here: not looked at */ } finally { v.removeAttribute("src"); v.load(); }
    }
    return looks;
  } catch {
    return [];
  }
}
