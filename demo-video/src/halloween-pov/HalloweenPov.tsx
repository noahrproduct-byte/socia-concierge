// "POV: you walk into work on Halloween" from Noah's three clips (2026-10-31).
// A reference edit: what SOCIA's editor should be able to make from them.
// v2 (Noah's notes): smooth CapCut-style transitions instead of hard cuts,
// cleaned background audio, and CapCut "Classic" text (Montserrat ExtraBold,
// white with a black outline, no box behind it, pop-up entrance).
import { AbsoluteFill, Easing, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from "remotion";
import { loadFont } from "@remotion/google-fonts/Montserrat";

const { fontFamily } = loadFont("normal", { weights: ["800"], subsets: ["latin"] });
const FPS = 30;
/** Frames two shots overlap during a transition (about 0.27 s). */
const T = 8;

type Kind = "zoom" | "whip";
type Cut = { src: string; from: number; to: number; speed?: number };
// Clip-relative seconds, chosen frame by frame. *_clean files carry the denoised, levelled audio.
const CUTS: Cut[] = [
  { src: "IMG_7789_clean.mp4", from: 0.6, to: 3.1 },             // walking in: the shop, the counter, the kitchen
  { src: "IMG_7788_clean.mp4", from: 0.0, to: 1.5 },             // the ticket rail, a pizza being built
  { src: "IMG_7787_clean.mp4", from: 1.0, to: 3.8, speed: 1.5 }, // the topping line under hanging tickets
  { src: "IMG_7787_clean.mp4", from: 7.1, to: 8.7 },             // hands building two pizzas
  { src: "IMG_7789_clean.mp4", from: 4.9, to: 6.5 },             // oven open: calzones, then pepperoni
  { src: "IMG_7789_clean.mp4", from: 10.0, to: 13.6 },           // the full oven
];
// The transition INTO each shot after the first: zoom on scene changes, whip on the moving shots.
const INTO: Kind[] = ["whip", "whip", "zoom", "whip", "zoom"];

const lenFrames = (c: Cut) => Math.round(((c.to - c.from) / (c.speed ?? 1)) * FPS);
const STARTS = CUTS.reduce<number[]>((acc, c, i) => [...acc, i === 0 ? 0 : acc[i - 1] + lenFrames(CUTS[i - 1]) - T], []);
export const TOTAL_FRAMES = STARTS[STARTS.length - 1] + lenFrames(CUTS[CUTS.length - 1]);

// On-screen lines, in output frames.
const LINES = [
  { text: "POV: you walk into work on Halloween", from: 4, to: STARTS[1] + T },
  { text: "the ticket rail is full", from: STARTS[1] + T, to: STARTS[3] + T / 2 },
  { text: "and the oven's already full", from: STARTS[5] + T + 4, to: TOTAL_FRAMES },
];

const ease = Easing.inOut(Easing.cubic);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

function Shot({ cut, frames, into, out }: { cut: Cut; frames: number; into: Kind | null; out: Kind | null }) {
  const f = useCurrentFrame();
  // Incoming: 1 → 0 over the first T frames; outgoing: 0 → 1 over the last T.
  const inP = into ? interpolate(f, [0, T], [1, 0], { ...clamp, easing: ease }) : 0;
  const outP = out ? interpolate(f, [frames - T, frames], [0, 1], { ...clamp, easing: ease }) : 0;

  let scale = 1 + interpolate(f, [0, frames], [0, 0.04]); // a slow push so nothing sits still
  let x = 0;
  let blur = 0;
  let opacity = 1;
  if (into === "zoom") { scale *= 1 + 0.3 * inP; blur += 16 * inP; opacity = 1 - inP; }
  if (into === "whip") { x += 40 * inP; blur += 20 * inP; opacity = interpolate(inP, [0, 0.6, 1], [1, 1, 0]); }
  if (out === "zoom") { scale *= 1 + 0.3 * outP; blur += 16 * outP; }
  if (out === "whip") { x -= 40 * outP; blur += 20 * outP; }

  // Sound crossfades with the picture.
  const vol = Math.min(into ? 1 - inP : interpolate(f, [0, 4], [0, 1], clamp), out ? 1 - outP : interpolate(f, [frames - 6, frames], [1, 0], clamp));
  return (
    <AbsoluteFill style={{ overflow: "hidden", opacity }}>
      <OffthreadVideo
        src={staticFile(cut.src)}
        startFrom={Math.round(cut.from * FPS)}
        playbackRate={cut.speed ?? 1}
        volume={vol * 0.55}
        style={{ width: "100%", height: "100%", objectFit: "cover", transform: `translateX(${x}%) scale(${scale})`, filter: blur > 0.2 ? `blur(${blur}px)` : undefined }}
      />
    </AbsoluteFill>
  );
}

/** CapCut "Classic": bold sans, white fill, black outline, no box; pops in, fades out. */
function Line({ text, frames }: { text: string; frames: number }) {
  const f = useCurrentFrame();
  const pop = interpolate(f, [0, 5, 9], [0.55, 1.07, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const appear = interpolate(f, [0, 3], [0, 1], clamp);
  const fade = interpolate(f, [frames - 5, frames], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ alignItems: "center", paddingTop: 330 }}>
      <div
        style={{
          fontFamily, fontWeight: 800, fontSize: 76, lineHeight: 1.12, letterSpacing: "-0.5px",
          color: "white", textAlign: "center", maxWidth: 900, textWrap: "balance",
          WebkitTextStroke: "9px black", paintOrder: "stroke fill",
          opacity: appear * fade, transform: `scale(${pop})`,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
}

export function HalloweenPov() {
  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {CUTS.map((c, i) => (
        <Sequence key={i} from={STARTS[i]} durationInFrames={lenFrames(c)}>
          <Shot cut={c} frames={lenFrames(c)} into={i > 0 ? INTO[i - 1] : null} out={i < CUTS.length - 1 ? INTO[i] : null} />
        </Sequence>
      ))}
      {LINES.map((l) => (
        <Sequence key={l.text} from={l.from} durationInFrames={l.to - l.from}>
          <Line text={l.text} frames={l.to - l.from} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
