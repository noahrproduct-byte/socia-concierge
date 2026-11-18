// The ten caption motion presets (lib/studioClips/captionMotion.ts) drawn
// for one caption page. Everything is a function of the frame: the Player,
// a scrub, a replay and the browser export paint the same picture. The
// shapes (marker, circle, tape, leader line, rules) are inline SVG and CSS,
// no image assets.
//
// The boards' observations are on each preset in captionMotion.ts; the
// timings and easings here are SOCIA's own choices.
import React from "react";
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { TikTokPage } from "@remotion/captions";
import { captionLayout, type EdlStyle } from "@/lib/studioClips/style";
import { CAPTION_MOTIONS, beatBefore, emphasisFrame, emphasisWord, fitPhases, hash01, isPhraseLevel, tornEdge, tornStrip, type CaptionMotion, type CaptionOverride } from "@/lib/studioClips/captionMotion";
import type { Beat } from "@/lib/studioClips/beats";

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
/** Ease out (cubic): quick to start, soft to land. */
const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
/** Ease in and out (cubic). */
const easeInOut = (t: number) => { const x = clamp01(t); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** The luminance of a hex colour, 0..1, to pick dark or light type on it. */
const luma = (hex: string): number => { const h = hex.replace("#", ""); const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h; const n = (i: number) => (parseInt(v.slice(i, i + 2), 16) || 0) / 255; return 0.2126 * n(0) + 0.7152 * n(2) + 0.0722 * n(4); };
const inkOn = (hex: string) => (luma(hex) > 0.55 ? "#141414" : "#ffffff");

export type MotionCaptionProps = {
  page: TikTokPage;
  /** frames this page is on screen */
  durationInFrames: number;
  style: EdlStyle;
  spec: CaptionMotion;
  fontFamily: string;
  /** the person's changes to this caption */
  override?: CaptionOverride;
  /** the cut's highlighted words (lib/studioClips/emphasis.ts), normalised */
  highlighted?: string[];
  /** the measured beat of the cut's track, when it has one (Beat Cutout lands letters on it) */
  beat?: Beat | null;
  /** a lower third is on screen: captions set low move up */
  lowerThird?: boolean;
};

export const captionMotionOf = (id: string): CaptionMotion => CAPTION_MOTIONS.find((m) => m.id === id) ?? CAPTION_MOTIONS[0];

/**
 * One caption page in a motion preset. The phases (entrance, emphasis, exit)
 * are fitted to the page so a short caption still holds still long enough
 * to read; the emphasis lands on the key word's own time, on the beat the
 * person set, or, with phrase timing, part way into the page.
 */
export function MotionCaption({ page, durationInFrames, style, spec, fontFamily, override, highlighted, beat, lowerThird }: MotionCaptionProps) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const tokens = page.tokens.filter((t) => t.text.trim());
  const words = tokens.map((t) => t.text.trim());
  const keyWord = emphasisWord(words, override?.emphasis, highlighted);
  const phases = fitPhases(durationInFrames, spec.timing);
  const at = emphasisFrame({ tokens, startMs: page.startMs, keyWord, beatMs: override?.beatMs, durationInFrames, fps, phases });
  const tIn = phases.in > 0 ? clamp01(frame / phases.in) : 1;
  const tOut = phases.out > 0 ? clamp01((frame - (durationInFrames - phases.out)) / phases.out) : frame >= durationInFrames ? 1 : 0;
  const tEmp = keyWord >= 0 ? clamp01((frame - at) / phases.emphasis) : 0;
  const nowMs = page.startMs + (frame / fps) * 1000;
  const phrase = isPhraseLevel(tokens);
  // Type is sized on the short side of the frame, so a landscape cut gets the same caption height as a vertical one.
  const unit = Math.min(width, height) / 1080;
  const base0 = captionLayout(style.captions);
  const base = lowerThird && base0.bottom && style.captions.position === "bottom" ? { ...base0, bottom: "38%" } : base0;
  const fontSize = Math.round(base.fontSize * unit);
  const hi = style.captions.highlight;
  const upper = style.captions.uppercase;
  const pos: React.CSSProperties = base.top ? { top: base.top } : { bottom: base.bottom! };
  const common = { fontFamily, fontSize, textTransform: upper ? "uppercase" : "none", lineHeight: 1.2 } as const;
  const args = { frame, fps, width, height, unit, tokens, words, keyWord, tIn, tOut, tEmp, at, phases, nowMs, phrase, fontSize, hi, pos, common, durationInFrames, override, beat };
  switch (spec.id) {
    case "editorial": return <Editorial {...args} />;
    case "serif": return <Serif {...args} />;
    case "annotation": return <Annotation {...args} />;
    case "callout": return <Callout {...args} />;
    case "punch": return <Punch {...args} />;
    case "title": return <Title {...args} />;
    case "tape": return <Tape {...args} />;
    case "product": return <Product {...args} />;
    case "cutout": return <Cutout {...args} />;
    case "titlecard": return <TitleCard {...args} />;
    default: return null;
  }
}

type A = {
  frame: number; fps: number; width: number; height: number; unit: number;
  tokens: TikTokPage["tokens"]; words: string[]; keyWord: number;
  tIn: number; tOut: number; tEmp: number; at: number; phases: { in: number; out: number; emphasis: number };
  nowMs: number; phrase: boolean; fontSize: number; hi: string; pos: React.CSSProperties;
  common: { fontFamily: string; fontSize: number; textTransform: "uppercase" | "none"; lineHeight: number };
  durationInFrames: number; override?: CaptionOverride; beat?: Beat | null;
};

/** The words of a page, the key one wrapped so a shape can be drawn round it. */
function Words({ words, keyWord, keyStyle, style, render }: { words: string[]; keyWord: number; keyStyle?: React.CSSProperties; style?: React.CSSProperties; render?: (i: number, word: string) => React.ReactNode }) {
  return (
    <>
      {words.map((w, i) => (
        <React.Fragment key={i}>
          {i > 0 ? " " : null}
          <span style={{ position: "relative", display: "inline-block", whiteSpace: "pre", ...style, ...(i === keyWord ? keyStyle : {}) }}>{render ? render(i, w) : w}</span>
        </React.Fragment>
      ))}
    </>
  );
}

/** A block of caption text placed by the style's position, centred. */
function Block({ pos, children, style }: { pos: React.CSSProperties; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={{ position: "absolute", left: "6%", right: "6%", textAlign: "center", ...pos, ...style }}>{children}</div>
    </AbsoluteFill>
  );
}

// 01 Editorial Highlight (Vox): the caption is fixed; a yellow marker wipes in behind it from the left (skewed a little, the
// way a highlighter lands); on the key word an underline sweeps right; at the end the whole strip tears away up and left.
function Editorial({ words, keyWord, tIn, tOut, tEmp, hi, pos, common, fontSize }: A) {
  const wipe = easeOut(tIn);
  const under = easeOut(tEmp);
  const tear = easeInOut(tOut);
  return (
    <Block pos={pos} style={{ opacity: 1 - clamp01((tOut - 0.7) / 0.3) }}>
      <div style={{ display: "inline-block", position: "relative", padding: `${0.18 * fontSize}px ${0.4 * fontSize}px`, transform: tear > 0 ? `translate(${-tear * 30}%, ${-tear * 40}%) rotate(${-tear * 9}deg)` : undefined, transformOrigin: "left top", clipPath: tear > 0 ? `polygon(${tornEdge(5, "right", 10, 4)}, 0 0, 0 100%)` : undefined }}>
        {/* The marker stroke behind the words: wipes in from the left, slightly skewed, with a soft torn right end. */}
        <span aria-hidden style={{ position: "absolute", left: 0, top: "6%", bottom: "6%", width: `${wipe * 100}%`, background: hi, opacity: 0.92, transform: "skewX(-6deg)", clipPath: `polygon(0 0, 100% 0, ${100 - 1.5 + hash01(3) * 1.5}% 100%, 0 100%)` }} />
        <span style={{ position: "relative", ...common, fontWeight: 800, color: inkOn(hi), opacity: 0.25 + 0.75 * clamp01(tIn * 1.6), letterSpacing: "-0.01em" }}>
          <Words
            words={words}
            keyWord={keyWord}
            render={(i, w) => (
              <>
                {w}
                {i === keyWord && under > 0 ? (
                  <svg aria-hidden viewBox="0 0 100 12" preserveAspectRatio="none" style={{ position: "absolute", left: 0, right: 0, bottom: `${-0.18 * fontSize}px`, width: "100%", height: 0.22 * fontSize, overflow: "visible" }}>
                    <path d="M2 7 C 30 3, 60 9, 98 5" fill="none" stroke={inkOn(hi)} strokeWidth={3.2} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - under} />
                  </svg>
                ) : null}
              </>
            )}
          />
        </span>
      </div>
    </Block>
  );
}

// 02 Cinematic Serif (Iman Gadzhi): a thin white serif fades in on a dark wash; the key word becomes a giant italic and
// pushes forward (the rest dims); the line blurs out.
function Serif({ words, keyWord, tIn, tOut, tEmp, pos, common, fontSize, hi }: A) {
  const grow = easeOut(tEmp);
  const blur = easeInOut(tOut) * 16;
  const rest = words.filter((_, i) => i !== keyWord);
  const twoLines = grow > 0 && rest.length > 0;
  return (
    <Block pos={pos} style={{ opacity: easeOut(tIn) * (1 - easeInOut(tOut)), filter: blur > 0.3 ? `blur(${blur.toFixed(1)}px)` : undefined }}>
      <div style={{ display: "inline-block", padding: `${0.3 * fontSize}px ${0.5 * fontSize}px`, background: "rgba(0,0,0,0.28)", borderRadius: 0.2 * fontSize }}>
        <div style={{ ...common, fontWeight: 600, color: `rgba(255,255,255,${(1 - 0.5 * grow).toFixed(2)})`, letterSpacing: "0.06em", lineHeight: 1.25 }}>
          <Words words={words} keyWord={keyWord} keyStyle={{ display: twoLines ? "none" : "inline-block" }} />
        </div>
        {grow > 0 && keyWord >= 0 ? (
          <div style={{ ...common, fontSize: Math.round(fontSize * lerp(1.1, 2.1, grow)), fontStyle: "italic", fontWeight: 700, color: hi === "#ffffff" ? "#fff" : hi, letterSpacing: "-0.01em", lineHeight: 1, marginTop: twoLines ? 0.1 * fontSize : 0, transform: `scale(${lerp(0.9, 1, grow).toFixed(3)})`, opacity: clamp01(grow * 1.4) }}>
            {words[keyWord]}
          </div>
        ) : null}
      </div>
    </Block>
  );
}

// 03 Documentary Annotation (Johnny Harris): a mono label types onto a paper strip with crop-mark ticks; a rough red
// circle draws round the key word; the strip is carried out by a push (it scales up and fades).
function Annotation({ words, keyWord, tIn, tOut, tEmp, frame, phases, pos, common, fontSize, hi }: A) {
  const text = words.join(" ");
  const typed = Math.min(text.length, Math.floor((frame / Math.max(1, phases.in)) * text.length * 1.05));
  const circle = easeOut(tEmp);
  const push = easeInOut(tOut);
  let seen = 0;
  return (
    <Block pos={pos} style={{ opacity: 1 - push, transform: `scale(${1 + push * 0.5})`, transformOrigin: "center" }}>
      <div style={{ display: "inline-block", position: "relative", padding: `${0.22 * fontSize}px ${0.5 * fontSize}px`, background: "#f1e9d6", color: "#1b1b1b", clipPath: tornStrip(2, 2), transform: "rotate(-1.2deg)", boxShadow: "0 6px 18px rgba(0,0,0,0.35)", opacity: clamp01(tIn * 4) }}>
        <span style={{ ...common, fontWeight: 700, letterSpacing: "0.08em" }}>
          <Words
            words={words}
            keyWord={keyWord}
            render={(i, w) => {
              const start = seen; seen += w.length + 1;
              const show = Math.max(0, Math.min(w.length, typed - start));
              return (
                <>
                  <span style={{ visibility: show > 0 ? "visible" : "hidden" }}>{w.slice(0, show)}<span style={{ visibility: "hidden" }}>{w.slice(show)}</span></span>
                  {i === keyWord && circle > 0 ? (
                    <svg aria-hidden viewBox="0 0 120 60" preserveAspectRatio="none" style={{ position: "absolute", left: "-14%", top: "-22%", width: "128%", height: "150%", overflow: "visible" }}>
                      <path d="M12 30 C 10 8, 60 2, 96 10 C 122 18, 116 48, 70 54 C 30 58, 2 46, 14 24 C 18 16, 30 12, 44 10" fill="none" stroke={hi} strokeWidth={4.5} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - circle} />
                    </svg>
                  ) : null}
                </>
              );
            }}
          />
        </span>
      </div>
    </Block>
  );
}

// 04 Clean Callout (Ali Abdaal): a rounded cream card slides up with soft easing; a pastel pill grows behind the active
// word (absolutely placed, so the sentence never shifts); the card slides down.
function Callout({ words, keyWord, tokens, tIn, tOut, tEmp, nowMs, phrase, pos, common, fontSize, hi }: A) {
  const rise = easeOut(tIn), drop = easeInOut(tOut);
  const y = (1 - rise) * 0.8 * fontSize + drop * 0.8 * fontSize;
  const ink = "#2b2b2b";
  return (
    <Block pos={pos} style={{ opacity: rise * (1 - drop), transform: `translateY(${y.toFixed(1)}px)` }}>
      <div style={{ display: "inline-block", padding: `${0.3 * fontSize}px ${0.55 * fontSize}px`, background: "#f7efe6", color: ink, borderRadius: 0.5 * fontSize, boxShadow: "0 10px 30px rgba(0,0,0,0.25)" }}>
        <span style={{ ...common, fontWeight: 800, lineHeight: 1.3 }}>
          <Words
            words={words}
            keyWord={keyWord}
            render={(i, w) => {
              // With word times the pill follows the spoken word; with phrase timing it grows behind the key word on the beat.
              const t = tokens[i];
              const active = phrase ? i === keyWord && tEmp > 0 : t.fromMs <= nowMs && (t.toMs > nowMs || i === keyWord);
              const grow = phrase ? easeOut(tEmp) : active ? easeOut(clamp01((nowMs - t.fromMs) / 160)) : 0;
              return (
                <>
                  <span aria-hidden style={{ position: "absolute", left: "-0.18em", right: "-0.18em", top: "-0.04em", bottom: "-0.04em", borderRadius: "0.6em", background: hi, transform: `scaleX(${grow.toFixed(3)})`, transformOrigin: "center", opacity: grow > 0 ? 1 : 0, zIndex: -1 }} />
                  <span style={{ position: "relative" }}>{w}</span>
                </>
              );
            }}
            style={{ zIndex: 0 }}
          />
        </span>
      </div>
    </Block>
  );
}

// 05 Punch Captions (MrBeast): heavy outlined capitals pop in; the stressed word jumps forward in the accent colour and
// settles; the next words hard-cut in (no exit).
function Punch({ words, keyWord, frame, fps, tEmp, at, pos, common, fontSize, hi }: A) {
  const pop = spring({ frame, fps, config: { damping: 12, stiffness: 260, mass: 0.6 }, durationInFrames: 8 });
  const jump = keyWord >= 0 && frame >= at ? spring({ frame: frame - at, fps, config: { damping: 9, stiffness: 300, mass: 0.6 }, durationInFrames: 10 }) : 0;
  const keyScale = 1 + 0.32 * (1 - jump) * (tEmp > 0 ? 1 : 0) + 0.12 * (tEmp > 0 ? 1 : 0);
  const stroke = Math.max(6, Math.round(fontSize * 0.16));
  return (
    <Block pos={pos} style={{ transform: `scale(${lerp(0.6, 1, pop).toFixed(3)})`, opacity: clamp01(frame / 2) }}>
      <span style={{ ...common, fontSize: Math.round(fontSize * 1.15), fontWeight: 900, color: "#fff", WebkitTextStroke: `${stroke}px #000`, paintOrder: "stroke fill", letterSpacing: "0.01em", lineHeight: 1.1 }}>
        <Words words={words} keyWord={keyWord} keyStyle={{ color: tEmp > 0 ? hi : "#fff", transform: `scale(${keyScale.toFixed(3)}) rotate(${(-3 * (1 - jump) * (tEmp > 0 ? 1 : 0)).toFixed(2)}deg)`, transformOrigin: "center 70%", zIndex: 1 }} />
      </span>
    </Block>
  );
}

// 06 Cinematic Title (Sam Kolder): thin spaced capitals fade up; the letter spacing keeps opening across the whole page;
// the title dissolves into light (brightens and blurs as it goes).
function Title({ words, keyWord, frame, durationInFrames, tIn, tOut, pos, common, fontSize }: A) {
  const open = clamp01(frame / Math.max(1, durationInFrames));
  const spacing = lerp(0.22, 0.48, open);
  const out = easeInOut(tOut);
  return (
    <Block pos={pos} style={{ opacity: easeOut(tIn) * (1 - out), filter: out > 0 ? `blur(${(out * 10).toFixed(1)}px) brightness(${(1 + out * 1.5).toFixed(2)})` : undefined }}>
      <span style={{ ...common, fontSize: Math.round(fontSize * 0.92), fontWeight: 600, color: "#fff", letterSpacing: `${spacing.toFixed(3)}em`, textTransform: "uppercase", lineHeight: 1.5, textShadow: "0 2px 18px rgba(0,0,0,0.6)" }}>
        <Words words={words} keyWord={keyWord} keyStyle={{ fontWeight: 700 }} />
      </span>
    </Block>
  );
}

// 07 Handwritten Tape (Casey Neistat): a strip of masking tape; the marker lettering is revealed left to right; a rough
// red double underline draws under the key word; the strip peels away from its top-right corner.
function Tape({ words, keyWord, tIn, tOut, tEmp, pos, common, fontSize, hi }: A) {
  const write = easeOut(tIn);
  const under = easeOut(tEmp);
  const peel = easeInOut(tOut);
  return (
    <Block pos={pos} style={{ opacity: 1 - clamp01((peel - 0.75) / 0.25) }}>
      <div style={{ display: "inline-block", position: "relative", padding: `${0.2 * fontSize}px ${0.6 * fontSize}px`, background: "#e8dcc2", clipPath: tornStrip(4, 3), transform: `rotate(${(-2 + peel * 14).toFixed(2)}deg) translate(${(peel * 18).toFixed(1)}%, ${(-peel * 70).toFixed(1)}%)`, transformOrigin: "left bottom", boxShadow: "0 4px 14px rgba(0,0,0,0.35)" }}>
        <span style={{ ...common, fontWeight: 400, color: "#161616", display: "inline-block", clipPath: `inset(-20% ${((1 - write) * 100).toFixed(1)}% -30% -5%)`, lineHeight: 1.25 }}>
          <Words
            words={words}
            keyWord={keyWord}
            render={(i, w) => (
              <>
                {w}
                {i === keyWord && under > 0 ? (
                  <svg aria-hidden viewBox="0 0 100 20" preserveAspectRatio="none" style={{ position: "absolute", left: "-4%", width: "108%", bottom: `${-0.26 * fontSize}px`, height: 0.3 * fontSize, overflow: "visible" }}>
                    <path d="M2 6 C 25 2, 55 9, 98 4" fill="none" stroke={hi} strokeWidth={4} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - clamp01(under * 2)} />
                    <path d="M96 14 C 70 11, 40 17, 4 12" fill="none" stroke={hi} strokeWidth={3.4} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - clamp01(under * 2 - 1)} />
                  </svg>
                ) : null}
              </>
            )}
          />
        </span>
      </div>
    </Block>
  );
}

/** Where a product callout's anchor sits when the person has not placed it: a little above the centre of the picture. */
export const DEFAULT_ANCHOR = { x: 0.5, y: 0.42 };

// 08 Product Callout (Daniel Schiffer): a fine leader line draws from a point on the picture (placed by the person) to a
// small boxed label; the key word brightens; the line retracts. SOCIA has no object tracker, so the point is fixed.
function Product({ words, keyWord, tIn, tOut, tEmp, width, height, unit, pos, common, fontSize, hi, override }: A) {
  const an = override?.anchor ?? DEFAULT_ANCHOR;
  const ax = an.x * width, ay = an.y * height;
  // The label sits where the caption style puts it; the line goes from the anchor to the label's nearest edge.
  const labelTop = pos.top ? (parseFloat(String(pos.top)) / 100) * height : null;
  const labelBottom = pos.bottom ? height - (parseFloat(String(pos.bottom)) / 100) * height : null;
  const labelH = fontSize * 1.9;
  const ly = labelTop != null ? labelTop + labelH / 2 : (labelBottom ?? height * 0.7) - labelH / 2;
  const lx = width / 2;
  const draw = easeOut(tIn), retract = easeInOut(tOut);
  // The line: anchor → a bend level with the label → the label's edge.
  const bendX = ax + (lx - ax) * 0.45, bendY = ly;
  const d = `M ${ax} ${ay} L ${bendX} ${bendY} L ${lx} ${ly}`;
  const sw = Math.max(2, 3 * unit);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <svg aria-hidden width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ position: "absolute", inset: 0 }}>
        <circle cx={ax} cy={ay} r={9 * unit} fill="none" stroke="#fff" strokeWidth={sw} opacity={clamp01(draw * 3) * (1 - retract)} />
        <circle cx={ax} cy={ay} r={3 * unit} fill="#fff" opacity={clamp01(draw * 3) * (1 - retract)} />
        {/* The line draws out from the anchor, then retracts back into it. */}
        <path d={d} fill="none" stroke="#fff" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={retract > 0 ? retract : 1 - draw} />
      </svg>
      <div style={{ position: "absolute", left: lx, top: ly, transform: `translate(-50%, -50%) scale(${lerp(0.85, 1, draw).toFixed(3)})`, opacity: clamp01((draw - 0.55) / 0.45) * (1 - clamp01(retract * 2)) }}>
        <span style={{ ...common, display: "inline-block", fontSize: Math.round(fontSize * 0.85), fontWeight: 700, color: "#fff", letterSpacing: "0.08em", padding: `${0.25 * fontSize}px ${0.45 * fontSize}px`, border: `${sw}px solid #fff`, background: "rgba(0,0,0,0.45)", whiteSpace: "nowrap" }}>
          <Words words={words} keyWord={keyWord} keyStyle={{ color: tEmp > 0 ? hi : "#fff" }} />
        </span>
      </div>
    </AbsoluteFill>
  );
}

// 09 Beat Cutout (Lyrical Lemonade): cut-paper letters (each on its own tilted block) slam in one after another, on the
// track's beats when the cut has them; an acid-green duplicate jitters off the key word on the emphasis; the letters
// scatter like stickers at the end.
function Cutout({ words, keyWord, tokens, frame, fps, tOut, tEmp, phases, phrase, pos, common, fontSize, hi, beat }: A) {
  const scatter = easeInOut(tOut);
  const block = Math.round(fontSize * 1.25);
  const pageStart = tokens[0]?.fromMs ?? 0;
  return (
    <Block pos={pos}>
      <span style={{ ...common, fontSize: block, fontWeight: 900, lineHeight: 1.15, display: "inline-block" }}>
        {words.map((w, i) => {
          // When the word lands: on the beat at or before it is said (with a track), else as it is said; with phrase timing, in turn.
          const saidMs = phrase ? pageStart + (i / Math.max(1, words.length)) * (phases.in / fps) * 1000 : tokens[i].fromMs;
          const landMs = beatBefore(saidMs, beat);
          const landFrame = Math.max(0, Math.round(((landMs - pageStart) / 1000) * fps));
          const key = i === keyWord;
          return (
            <React.Fragment key={i}>
              {i > 0 ? " " : null}
              <span style={{ display: "inline-block", whiteSpace: "pre" }}>
                {w.split("").map((ch, j) => {
                  const seed = i * 97 + j * 13 + 1;
                  const since = frame - landFrame - j;
                  const k = since >= 0 ? spring({ frame: since, fps, config: { damping: 11, stiffness: 320, mass: 0.5 }, durationInFrames: 7 }) : 0;
                  const tilt = (hash01(seed) - 0.5) * 12;
                  const fly = scatter * (160 + hash01(seed + 5) * 260);
                  const ang = Math.atan2(hash01(seed + 9) - 0.5, hash01(seed + 3) - 0.5);
                  const dx = Math.cos(ang) * fly, dy = Math.sin(ang) * fly - scatter * 40;
                  const jitter = key && tEmp > 0 && tEmp < 1 ? (hash01(seed + frame) - 0.5) * 10 : 0;
                  return (
                    <span key={j} style={{ position: "relative", display: "inline-block", margin: `0 ${0.02 * block}px`, opacity: since < 0 ? 0 : 1 - scatter, transform: `translate(${(dx + jitter).toFixed(1)}px, ${(dy + jitter).toFixed(1)}px) rotate(${(tilt + scatter * tilt * 6).toFixed(1)}deg) scale(${lerp(1.7, 1, k).toFixed(3)})` }}>
                      {key && tEmp > 0 && tEmp < 1 ? <span aria-hidden style={{ position: "absolute", inset: 0, transform: `translate(${(5 * unitOf(block) + jitter * 0.6).toFixed(1)}px, ${(-5 * unitOf(block) - jitter * 0.6).toFixed(1)}px)`, background: "#c8ff1f", color: "#111", padding: `0 ${0.12 * block}px`, zIndex: 0 }}>{ch}</span> : null}
                      <span style={{ position: "relative", display: "inline-block", background: hi, color: inkOn(hi), padding: `0 ${0.12 * block}px`, zIndex: 1, boxShadow: "0 3px 10px rgba(0,0,0,0.35)", clipPath: `polygon(${tornEdge(seed, "top", 4, 3)}, 100% 100%, 0 100%)` }}>{ch}</span>
                    </span>
                  );
                })}
              </span>
            </React.Fragment>
          );
        })}
      </span>
    </Block>
  );
}
const unitOf = (block: number) => block / 80;

// 10 Symmetrical Title Card (Wes Anderson): a hard cut to a centred serif on a flat card in the highlight colour (the
// whole frame); two fine rules extend evenly from either side of the title; a hard cut away.
function TitleCard({ words, keyWord, frame, durationInFrames, phases, common, fontSize, hi, width, unit }: A) {
  const rules = easeInOut(clamp01((frame - phases.in) / Math.max(1, phases.emphasis)));
  const ink = inkOn(hi);
  const ruleW = Math.round(width * 0.17 * rules);
  const gone = frame >= durationInFrames;
  if (gone) return null;
  return (
    <AbsoluteFill style={{ background: hi, pointerEvents: "none", justifyContent: "center", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: Math.round(0.5 * fontSize), maxWidth: "92%" }}>
        <span aria-hidden style={{ display: "block", width: ruleW, height: Math.max(2, Math.round(3 * unit)), background: ink, flex: "none" }} />
        <span style={{ ...common, fontSize: Math.round(fontSize * 1.2), fontWeight: 700, color: ink, letterSpacing: "0.1em", textAlign: "center", lineHeight: 1.2 }}>
          <Words words={words} keyWord={keyWord} />
        </span>
        <span aria-hidden style={{ display: "block", width: ruleW, height: Math.max(2, Math.round(3 * unit)), background: ink, flex: "none" }} />
      </div>
    </AbsoluteFill>
  );
}
