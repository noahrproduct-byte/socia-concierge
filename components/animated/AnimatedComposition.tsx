// The animated style of "Make it with AI": a vertical video of words on
// screen, drawn in code from an AnimatedSpec (lib/animated/spec.ts). Used by
// the preview (@remotion/player) and by the browser render
// (components/animated/renderAnimated.ts), so both show the same frames.
import { AbsoluteFill, Easing, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";
import { palette, specTimeline, type AnimatedScene, type AnimatedSpec } from "@/lib/animated/spec";
import { CompareScene } from "./CompareScene";

const { fontFamily } = loadFont("normal", { weights: ["500", "700", "800"], subsets: ["latin"] });

type Colors = ReturnType<typeof palette>;

const PAD = 96;
const OUT = 8; // frames each scene takes to leave

const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");

/** Which words of `text` the emphasis covers (consecutive, matched without punctuation). */
function emphasisRange(words: string[], emphasis?: string): [number, number] | null {
  const target = (emphasis ?? "").split(/\s+/).map(norm).filter(Boolean);
  if (!target.length) return null;
  for (let i = 0; i + target.length <= words.length; i++) {
    if (target.every((t, j) => norm(words[i + j]) === t)) return [i, i + target.length - 1];
  }
  return null;
}

/** A word that rises into place, `delay` frames after its scene starts. */
function Word({ text, delay, marked, colors, last }: { text: string; delay: number; marked: boolean; colors: Colors; last: boolean }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: { damping: 200, mass: 0.6 } });
  const mark = marked ? interpolate(frame - delay - 6, [0, 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) }) : 0;
  return (
    <span style={{ display: "inline-block", position: "relative", marginRight: last ? 0 : "0.24em", opacity: p, transform: `translateY(${(1 - p) * 36}px)` }}>
      {marked && (
        <span aria-hidden style={{ position: "absolute", inset: "0.04em -0.12em -0.02em", background: colors.mark, borderRadius: 14, clipPath: `inset(0 ${100 - mark * 100}% 0 0)` }} />
      )}
      <span style={{ position: "relative", color: marked && mark > 0.5 ? colors.markInk : undefined }}>{text}</span>
    </span>
  );
}

function Line({ text, emphasis, start, size, weight, colors, stagger = 2 }: { text: string; emphasis?: string; start: number; size: number; weight: number; colors: Colors; stagger?: number }) {
  const words = text.split(/\s+/).filter(Boolean);
  const range = emphasisRange(words, emphasis);
  return (
    <div style={{ fontSize: size, fontWeight: weight, lineHeight: 1.08, letterSpacing: size > 90 ? "-0.02em" : "-0.01em" }}>
      {words.map((w, i) => (
        <Word key={i} text={w} delay={start + i * stagger} marked={Boolean(range && i >= range[0] && i <= range[1])} colors={colors} last={i === words.length - 1} />
      ))}
    </div>
  );
}

/** One scene, laid out by type. Leaves over its last OUT frames. */
function Scene({ scene, frames, colors }: { scene: AnimatedScene; frames: number; colors: Colors }) {
  const frame = useCurrentFrame();
  const leave = interpolate(frame, [frames - OUT, frames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.cubic) });
  const wrap = { opacity: 1 - leave, transform: `translateY(${-leave * 40}px)` };
  let body: React.ReactNode;
  if (scene.type === "hook") {
    body = <Line text={scene.text} emphasis={scene.emphasis} start={2} size={124} weight={800} colors={colors} />;
  } else if (scene.type === "point") {
    body = <Line text={scene.text} emphasis={scene.emphasis} start={2} size={84} weight={700} colors={colors} stagger={1.5} />;
  } else if (scene.type === "list") {
    body = (
      <div style={{ display: "flex", flexDirection: "column", gap: 44 }}>
        <div style={{ color: colors.dim, fontSize: 56, fontWeight: 600 }}><Line text={scene.title} start={0} size={56} weight={600} colors={colors} /></div>
        {scene.items.map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 30 }}>
            <Dot delay={10 + i * 9} colors={colors} />
            <Line text={item} start={10 + i * 9} size={78} weight={700} colors={colors} stagger={1.5} />
          </div>
        ))}
      </div>
    );
  } else if (scene.type === "quote") {
    body = (
      <div>
        <div style={{ fontSize: 220, lineHeight: 0.7, fontWeight: 800, color: colors.mark, opacity: interpolate(frame, [0, 8], [0, 1], { extrapolateRight: "clamp" }) }}>&ldquo;</div>
        <Line text={scene.text} start={4} size={76} weight={600} colors={colors} stagger={1.5} />
      </div>
    );
  } else {
    body = (
      <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
        <Line text={scene.text} start={2} size={104} weight={800} colors={colors} />
        <Bar delay={12} colors={colors} />
        {scene.sub && <div style={{ color: colors.dim }}><Line text={scene.sub} start={16} size={50} weight={500} colors={colors} stagger={1.5} /></div>}
      </div>
    );
  }
  return <AbsoluteFill style={{ justifyContent: "center", padding: `0 ${PAD}px`, paddingBottom: 140, ...wrap }}>{body}</AbsoluteFill>;
}

function Dot({ delay, colors }: { delay: number; colors: Colors }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  return <span style={{ flex: "none", width: 22, height: 22, borderRadius: 6, background: colors.mark, transform: `scale(${p})`, alignSelf: "center" }} />;
}

function Bar({ delay, colors }: { delay: number; colors: Colors }) {
  const frame = useCurrentFrame();
  const w = interpolate(frame - delay, [0, 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return <div style={{ width: 220 * w, height: 12, borderRadius: 6, background: colors.mark }} />;
}

/** Thin segments at the top: which scene this is, like a story's progress. */
function Progress({ starts, frames, colors }: { starts: number[]; frames: number[]; colors: Colors }) {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: "absolute", top: 84, left: PAD, right: PAD, display: "flex", gap: 10 }}>
      {starts.map((s, i) => {
        const p = Math.min(1, Math.max(0, (frame - s) / frames[i]));
        return (
          <div key={i} style={{ flex: 1, height: 6, borderRadius: 3, background: colors.dim, opacity: 0.35, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", inset: 0, width: `${p * 100}%`, background: colors.fg, opacity: 1 }} />
          </div>
        );
      })}
    </div>
  );
}

function Signoff({ text, colors }: { text: string; colors: Colors }) {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", gap: 28, opacity: p }}>
      <div style={{ fontSize: 76, fontWeight: 800, letterSpacing: "-0.01em", transform: `translateY(${(1 - p) * 20}px)` }}>{text}</div>
      <div style={{ width: 120 * p, height: 10, borderRadius: 5, background: colors.mark }} />
    </AbsoluteFill>
  );
}

export function AnimatedComposition({ spec }: { spec: AnimatedSpec }) {
  const colors = palette(spec);
  if (spec.compare) {
    return <CompareScene compare={spec.compare} signoff={spec.signoff} colors={{ bg: colors.bg, fg: colors.fg, dim: colors.dim, accent: spec.accent, light: spec.theme === "light" }} />;
  }
  const t = specTimeline(spec);
  return (
    <AbsoluteFill style={{ background: colors.bg, color: colors.fg, fontFamily }}>
      {spec.scenes.map((s, i) => (
        <Sequence key={i} from={t.starts[i]} durationInFrames={t.frames[i]} layout="none">
          <Scene scene={s} frames={t.frames[i]} colors={colors} />
        </Sequence>
      ))}
      {spec.signoff && (
        <Sequence from={t.total - t.end} durationInFrames={t.end} layout="none">
          <Signoff text={spec.signoff} colors={colors} />
        </Sequence>
      )}
      <Sequence from={0} durationInFrames={t.total - t.end} layout="none">
        <Progress starts={t.starts} frames={t.frames} colors={colors} />
      </Sequence>
    </AbsoluteFill>
  );
}
