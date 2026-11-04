import React from "react";
import { AbsoluteFill, Audio, Easing, Img, Sequence, interpolate, useCurrentFrame } from "remotion";
import { loadFont } from "@remotion/google-fonts/InterTight";
import { loadFont as loadSerif } from "@remotion/google-fonts/SourceSerif4";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import mark from "../brand/socia-mark.png";
import vo from "./audio/vo.mp3";
import sfxPop from "../method/audio/sfx/pop.mp3";
import sfxClick from "../method/audio/sfx/click-soft.mp3";
import sfxWhoosh from "../method/audio/sfx/whoosh-short.mp3";
import sfxImpact from "../method/audio/sfx/impact-bass-1.mp3";
import { InstagramIcon } from "../method/ui";
import { ANSWER, CANT, FPS, PHRASES, PROMPT, SOURCE, STATS, T, TOOLS } from "./story";

const inter = loadFont("normal", { weights: ["500", "600", "700", "800"], subsets: ["latin"] });
const serif = loadSerif("normal", { weights: ["400", "500", "600"], subsets: ["latin"] });
const mono = loadMono("normal", { weights: ["500", "600"], subsets: ["latin"] });
const SANS = `${inter.fontFamily}, Inter, sans-serif`;
const SERIF = `${serif.fontFamily}, Georgia, serif`;
const MONO = `${mono.fontFamily}, Menlo, monospace`;

// A Claude chat look (warm cream, coral) holding SOCIA's data; SOCIA's ink and gold for its own marks.
const CREAM = "#f5f3ec";
const CREAM2 = "#ebe7dc";
const CORAL = "#d9714e";
const CORAL_SOFT = "#f6ddd2";
const INK = "#22211f";
const INK2 = "#6f6b64";
const LINE = "#dedad2";
const GOLD = "#8a6a2c";
const GREEN = "#2f9e5b";

const useT = () => useCurrentFrame() / FPS;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = (t: number, at: number, dur = 0.3, e = Easing.out(Easing.cubic)) => interpolate(t, [at, at + dur], [0, 1], { ...clamp, easing: e });
const popE = (t: number, at: number, dur = 0.35) => interpolate(t, [at, at + dur], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.7)) });

const Beat: React.FC<{ at: number; until?: number; children: React.ReactNode }> = ({ at, until = 999, children }) => {
  const t = useT();
  if (t < at - 0.02 || t > until + 0.02) return null;
  const pin = ease(t, at, 0.32);
  const pout = 1 - ease(t, until - 0.22, 0.22, Easing.in(Easing.cubic));
  return <div style={{ position: "absolute", inset: 0, opacity: Math.min(pin, pout), filter: `blur(${(1 - pin) * 10 + (1 - pout) * 8}px)`, transform: `translateY(${(1 - pin) * 24}px)` }}>{children}</div>;
};

const ClaudeMark: React.FC<{ size?: number; color?: string }> = ({ size = 40, color = CORAL }) => (
  <svg width={size} height={size} viewBox="-50 -50 100 100">
    {Array.from({ length: 12 }).map((_, i) => {
      const a = (i / 12) * Math.PI * 2;
      const len = i % 2 ? 40 : 46;
      return <line key={i} x1={Math.cos(a) * 8} y1={Math.sin(a) * 8} x2={Math.cos(a) * len} y2={Math.sin(a) * len} stroke={color} strokeWidth={9} strokeLinecap="round" />;
    })}
  </svg>
);
const Mark: React.FC<{ size: number }> = ({ size }) => <Img src={mark} style={{ width: size, height: size, borderRadius: size * 0.24 }} />;

const Source: React.FC<{ style?: React.CSSProperties; dark?: boolean }> = ({ style, dark }) => (
  <div style={{ fontFamily: MONO, fontSize: 19, fontWeight: 500, color: dark ? "rgba(255,255,255,0.6)" : INK2, display: "flex", alignItems: "center", gap: 10, ...style }}>
    <InstagramIcon size={24} /> {SOURCE}
  </div>
);

const Spinner: React.FC<{ size?: number }> = ({ size = 22 }) => {
  const t = useT();
  return <div style={{ width: size, height: size, borderRadius: "50%", border: `3px solid ${LINE}`, borderTopColor: INK2, transform: `rotate(${t * 400}deg)` }} />;
};
const Check: React.FC<{ size?: number }> = ({ size = 24 }) => (
  <div style={{ width: size, height: size, borderRadius: "50%", background: GREEN, color: "#fff", fontSize: size * 0.62, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</div>
);

/* ───────────── ground + caption ───────────── */

const Ground: React.FC = () => {
  const t = useT();
  const n = ease(t, T.end - 0.25, 0.3);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: CREAM }} />
      <AbsoluteFill style={{ background: "#1c1a18", opacity: n }}>
        <div style={{ position: "absolute", left: 140, top: 560, width: 800, height: 800, borderRadius: "50%", background: "rgba(217,113,78,0.24)", filter: "blur(170px)" }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const ChatTop: React.FC = () => {
  const t = useT();
  if (t < T.open - 0.3 || t > T.end) return null;
  const p = ease(t, T.open - 0.2, 0.35) * (1 - ease(t, T.end - 0.25, 0.25));
  return (
    <div style={{ position: "absolute", left: 50, right: 50, top: 300, display: "flex", alignItems: "center", gap: 14, fontFamily: SANS, fontSize: 26, fontWeight: 600, color: INK, opacity: p }}>
      <ClaudeMark size={30} /> Claude
      <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, fontSize: 20, fontWeight: 600, color: INK2, background: "#fff", border: `1px solid ${LINE}`, borderRadius: 20, padding: "6px 16px 6px 8px" }}>
        <Mark size={28} /> SOCIA connected <span style={{ width: 10, height: 10, borderRadius: 5, background: GREEN }} />
      </span>
    </div>
  );
};

const Caption: React.FC = () => {
  const t = useT();
  if (t < T.open || t >= T.end) return null;
  const idx = PHRASES.reduce((v, ph, i) => (t >= ph[0].t - 0.03 ? i : v), -1);
  if (idx < 0) return null;
  const ph = PHRASES[idx];
  const next = PHRASES[idx + 1];
  const out = next ? ease(t, next[0].t - 0.16, 0.14) : ease(t, T.end - 0.2, 0.18);
  return (
    <div style={{ position: "absolute", top: 150, left: 80, right: 80, textAlign: "center", fontFamily: SANS, fontWeight: 700, fontSize: 50, lineHeight: 1.2, letterSpacing: -0.8, color: INK, opacity: 1 - out, transform: `translateY(${-14 * out}px)` }}>
      {ph.map((w, i) => {
        const p = ease(t, w.t, 0.3);
        if (p <= 0) return null;
        return <span key={i} style={{ display: "inline-block", marginRight: "0.24em", opacity: p, transform: `translateY(${(1 - p) * 16}px)`, filter: `blur(${(1 - p) * 6}px)`, color: w.em ? CORAL : INK }}>{w.w}</span>;
      })}
    </div>
  );
};

/* ───────────── 1 · hook ───────────── */

const HW: React.FC<{ text: string; at: number; size: number; color?: string }> = ({ text, at, size, color = INK }) => {
  const t = useT();
  const p = popE(t, at, 0.3);
  return <span style={{ display: "inline-block", fontSize: size, color, opacity: Math.min(1, p * 1.5), transform: `translateY(${(1 - p) * 26}px)`, filter: `blur(${Math.max(0, 1 - p) * 6}px)`, marginRight: "0.22em" }}>{text}</span>;
};

const Hook: React.FC = () => {
  const t = useT();
  const [a, b, c, d, e] = T.hook;
  const [f, g, h, i, j] = T.hook2;
  const card = ease(t, T.exact, 0.4);
  return (
    <Beat at={0} until={T.open}>
      <div style={{ position: "absolute", left: 76, top: 300, display: "flex", alignItems: "center", gap: 18, fontFamily: SANS, fontSize: 30, fontWeight: 700, color: INK2 }}>
        <ClaudeMark size={56} /> + <Mark size={56} />
      </div>
      <div style={{ position: "absolute", left: 72, right: 60, top: 420, fontFamily: SANS, fontWeight: 800, letterSpacing: -4.5, lineHeight: 1.02 }}>
        <div><HW text="Next" at={a} size={116} /><HW text="week's" at={c} size={116} /></div>
        <div><HW text="content" at={d} size={116} color={CORAL} /><HW text="plan" at={e} size={116} color={CORAL} /></div>
        <div style={{ marginTop: 26, letterSpacing: -1.5, fontWeight: 700 }}>
          <HW text="from" at={f} size={62} /><HW text="your" at={g} size={62} /><HW text="own" at={h} size={62} /><HW text="Instagram" at={i} size={62} /><HW text="data" at={j} size={62} />
          <HW text="in" at={T.minute[0]} size={62} /><HW text="about" at={T.minute[0] + 0.09} size={62} /><HW text="a" at={T.minute[1]} size={62} /><HW text="minute." at={T.minute[1] + 0.05} size={62} />
        </div>
      </div>
      <div style={{ position: "absolute", left: 72, right: 72, top: 1010, borderRadius: 26, background: "#fff", border: `2px solid ${CORAL}`, padding: "26px 30px", fontFamily: SANS, opacity: card, transform: `translateY(${(1 - card) * 40}px) rotate(${(1 - card) * -2}deg)`, boxShadow: "0 24px 60px rgba(0,0,0,0.1)" }}>
        <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 600, letterSpacing: 3, color: CORAL }}>THE EXACT PROMPT</div>
        <div style={{ marginTop: 12, fontSize: 30, fontWeight: 600, color: INK2, lineHeight: 1.35, height: 82, overflow: "hidden", filter: "blur(5px)" }}>{PROMPT}</div>
      </div>
    </Beat>
  );
};

/* ───────────── 2 · the prompt, held ───────────── */

const PromptScene: React.FC = () => {
  const t = useT();
  const pasted = t >= T.paste;
  const flash = pasted ? 1 - ease(t, T.paste, 0.35) : 0;
  const shot = ease(t, T.shot, 0.3);
  const shotFlash = t >= T.shot ? 1 - ease(t, T.shot, 0.4) : 0;
  const send = t >= T.read - 0.35;
  const blink = Math.floor(t * 2.2) % 2 === 0;
  const B = 50; // bracket length
  return (
    <Beat at={T.open} until={T.read}>
      <div style={{ position: "absolute", left: 40, right: 40, top: 400, height: 820 }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: 28, background: "#fff", border: `2px solid ${pasted ? CORAL : LINE}`, boxShadow: `0 24px 60px rgba(0,0,0,0.08), 0 0 0 ${flash * 14}px rgba(217,113,78,${flash * 0.3})`, padding: "36px 40px", fontFamily: SANS }}>
          {pasted ? (
            <div style={{ fontSize: 50, fontWeight: 600, lineHeight: 1.36, color: INK, letterSpacing: -0.5 }}>{PROMPT}</div>
          ) : (
            <div style={{ fontSize: 43, color: "#aaa59c" }}>
              Reply to Claude...
              {blink ? <span style={{ display: "inline-block", width: 3, height: 46, background: INK, marginLeft: 4, verticalAlign: "middle" }} /> : null}
            </div>
          )}
          <div style={{ position: "absolute", right: 30, bottom: 28, width: 72, height: 72, borderRadius: 18, background: pasted ? CORAL : "#f2c2b0", color: "#fff", fontSize: 40, display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${send ? 1 - 0.1 * (1 - ease(t, T.read - 0.35, 0.25)) : 1})` }}>↑</div>
          <div style={{ position: "absolute", left: 40, bottom: 44, fontFamily: MONO, fontSize: 20, color: INK2, opacity: pasted ? 1 : 0 }}>{PROMPT.split(" ").length} words · works with SOCIA connected</div>
        </div>
        <div style={{ position: "absolute", left: -18, top: -18, width: B, height: B, borderLeft: `6px solid ${CORAL}`, borderTop: `6px solid ${CORAL}`, opacity: shot }} />
        <div style={{ position: "absolute", right: -18, top: -18, width: B, height: B, borderRight: `6px solid ${CORAL}`, borderTop: `6px solid ${CORAL}`, opacity: shot }} />
        <div style={{ position: "absolute", left: -18, bottom: -18, width: B, height: B, borderLeft: `6px solid ${CORAL}`, borderBottom: `6px solid ${CORAL}`, opacity: shot }} />
        <div style={{ position: "absolute", right: -18, bottom: -18, width: B, height: B, borderRight: `6px solid ${CORAL}`, borderBottom: `6px solid ${CORAL}`, opacity: shot }} />
        <div style={{ position: "absolute", left: 0, right: 0, top: -70, display: "flex", justifyContent: "center", opacity: shot }}>
          <span style={{ fontFamily: SANS, fontSize: 26, fontWeight: 800, color: "#fff", background: CORAL, borderRadius: 22, padding: "8px 22px", transform: `scale(${popE(t, T.shot, 0.4)})` }}>Screenshot this</span>
        </div>
      </div>
      <AbsoluteFill style={{ background: "#fff", opacity: shotFlash * 0.7, pointerEvents: "none" }} />
    </Beat>
  );
};

/* ───────────── 3 · Claude reads SOCIA ───────────── */

const ReadScene: React.FC = () => {
  const t = useT();
  return (
    <Beat at={T.read} until={T.plans}>
      <div style={{ position: "absolute", right: 50, left: 200, top: 390, borderRadius: 22, background: CREAM2, padding: "20px 26px", fontFamily: SANS, fontSize: 25, lineHeight: 1.4, color: INK, height: 108, overflow: "hidden", opacity: ease(t, T.read, 0.3) }}>{PROMPT}</div>
      <div style={{ position: "absolute", left: 50, right: 50, top: 540, fontFamily: SANS }}>
        {TOOLS.map((name, i) => {
          const at = T.read + 0.35 + i * 0.4;
          const p = ease(t, at, 0.3);
          const done = t >= at + 0.7;
          return (
            <div key={name} style={{ display: "flex", alignItems: "center", gap: 14, height: 62, borderBottom: `1px solid ${LINE}`, opacity: p, transform: `translateY(${(1 - p) * 14}px)`, fontSize: 24 }}>
              <Mark size={32} />
              <span style={{ fontWeight: 700 }}>SOCIA</span>
              <span style={{ fontFamily: MONO, fontSize: 21, color: INK2 }}>{name}</span>
              <span style={{ marginLeft: "auto" }}>{done ? <Check size={28} /> : <Spinner size={24} />}</span>
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", left: 50, right: 50, top: 850, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22 }}>
        {STATS.map((s, i) => {
          const at = T.stat[i];
          const p = popE(t, at, 0.4);
          return (
            <div key={s.l} style={{ height: 190, borderRadius: 24, background: "#fff", border: `1px solid ${LINE}`, padding: "24px 28px", opacity: Math.min(1, p * 1.4), transform: `scale(${0.8 + 0.2 * p})`, fontFamily: SANS }}>
              <div style={{ fontSize: 84, fontWeight: 800, letterSpacing: -3, color: i === 3 ? CORAL : INK, lineHeight: 1 }}>{s.v}</div>
              <div style={{ fontSize: 26, fontWeight: 600, color: INK2, marginTop: 14 }}>{s.l}</div>
            </div>
          );
        })}
      </div>
      <Source style={{ position: "absolute", left: 50, top: 1300, opacity: ease(t, T.stats, 0.3) }} />
    </Beat>
  );
};

/* ───────────── 4 · the plan ───────────── */

const AnswerScene: React.FC = () => {
  const t = useT();
  return (
    <Beat at={T.plans} until={T.cant}>
      <div style={{ position: "absolute", left: 50, right: 50, top: 380, display: "flex", alignItems: "center", gap: 14, fontFamily: SERIF, fontSize: 36, fontWeight: 500, color: INK, opacity: ease(t, T.plans, 0.3) }}>
        <ClaudeMark size={30} /> Next week, one post a day:
      </div>
      {ANSWER.map((r, i) => {
        const p = ease(t, T.plans + 0.35 + i * 0.22, 0.35);
        // The voice names Mon, Wed and Fri; only those rows light up, each until the next one.
        const span: Record<number, [number, number]> = { 0: [T.days[0], T.days[2]], 2: [T.days[2], T.days[4]], 4: [T.days[4], T.cant] };
        const [at, nextAt] = span[i] ?? [999, 999];
        const live = t >= at && t < nextAt;
        const lit = ease(t, at, 0.3);
        return (
          <div key={r.day} style={{ position: "absolute", left: 40, right: 40, top: 460 + i * 172, height: 160, borderRadius: 22, padding: "18px 22px", display: "flex", gap: 20, background: live ? "#fff" : "transparent", boxShadow: live ? `0 16px 40px rgba(0,0,0,0.08), inset 0 0 0 2px ${CORAL}` : "none", opacity: p * (0.55 + 0.45 * (live ? 1 : lit > 0 ? 0.6 : 0.5)), transform: `translateX(${(1 - p) * 50}px) scale(${live ? 1 + 0.02 * lit : 1})`, fontFamily: SANS }}>
            <div style={{ width: 84, height: 50, flexShrink: 0, borderRadius: 14, background: live ? CORAL : CORAL_SOFT, color: live ? "#fff" : CORAL, fontSize: 24, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{r.day}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 29, fontWeight: 700, lineHeight: 1.22, color: INK, letterSpacing: -0.3 }}>{r.hook} <span style={{ fontSize: 19, fontWeight: 700, color: GOLD, border: `1px solid rgba(138,106,44,0.4)`, borderRadius: 10, padding: "1px 8px", verticalAlign: "middle" }}>Reel</span></div>
              <div style={{ fontFamily: SERIF, fontSize: 21.5, color: INK2, lineHeight: 1.3, marginTop: 8 }}>Builds on {r.from}</div>
            </div>
          </div>
        );
      })}
      <Source style={{ position: "absolute", left: 50, top: 1330 }} />
    </Beat>
  );
};

/* ───────────── 5 · what it can't measure ───────────── */

const CantScene: React.FC = () => {
  const t = useT();
  const stamp = popE(t, T.every, 0.45);
  return (
    <Beat at={T.cant} until={T.end}>
      <div style={{ position: "absolute", left: 50, right: 50, top: 400, borderRadius: 28, background: "#fff", border: `1px solid ${LINE}`, boxShadow: "0 24px 60px rgba(0,0,0,0.08)", padding: "34px 36px", fontFamily: SANS }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: SERIF, fontSize: 38, fontWeight: 600, color: INK }}><ClaudeMark size={30} /> What SOCIA can't measure yet</div>
        {CANT.map((c, i) => {
          const at = T.cantRows[i];
          const p = ease(t, at, 0.35);
          return (
            <div key={i} style={{ display: "flex", gap: 20, alignItems: "flex-start", marginTop: 30, opacity: p, transform: `translateY(${(1 - p) * 16}px)` }}>
              <div style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 22, border: `3px solid ${INK2}`, color: INK2, fontSize: 26, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>?</div>
              <div style={{ fontSize: 32, fontWeight: 600, lineHeight: 1.3, color: INK }}>{c}</div>
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 1110, display: "flex", justifyContent: "center", opacity: Math.min(1, stamp * 1.3) }}>
        <div style={{ transform: `rotate(-2deg) scale(${0.7 + 0.3 * stamp})`, border: `4px solid ${GREEN}`, color: GREEN, borderRadius: 18, padding: "14px 28px", fontFamily: SANS, fontSize: 32, fontWeight: 800, background: "rgba(47,158,91,0.06)" }}>Every number: my own account, via SOCIA</div>
      </div>
      <Source style={{ position: "absolute", left: 50, top: 1300 }} />
    </Beat>
  );
};

/* ───────────── 6 · end card ───────────── */

const EndCard: React.FC = () => {
  const t = useT();
  const words = ["The", "prompt", "is", "in", "the", "caption."];
  const at = T.endWords;
  const arrow = ease(t, T.endWords[5] + 0.45, 0.4);
  return (
    <Beat at={T.end} until={999}>
      <div style={{ position: "absolute", left: 80, right: 80, top: 470, fontFamily: SANS, fontWeight: 800, fontSize: 124, letterSpacing: -5, lineHeight: 1.0, color: "#fff" }}>
        {words.map((w, i) => {
          const p = popE(t, at[i], 0.3);
          return <span key={i} style={{ display: "inline-block", marginRight: "0.22em", opacity: Math.min(1, p * 1.5), transform: `translateY(${(1 - p) * 30}px)`, color: i === 5 ? "#f39a74" : "#fff" }}>{w}</span>;
        })}
      </div>
      <div style={{ position: "absolute", left: 90, top: 990, fontSize: 90, color: "#f39a74", opacity: arrow, transform: `translateY(${(1 - arrow) * -20 + Math.sin(t * 5) * 8 * arrow}px)`, fontFamily: SANS, fontWeight: 800 }}>↓</div>
      <div style={{ position: "absolute", left: 80, right: 80, top: 1180, display: "flex", alignItems: "center", gap: 18, fontFamily: SANS, opacity: ease(t, T.endWords[5] + 0.65, 0.35) }}>
        <Mark size={70} />
        <div>
          <div style={{ fontSize: 44, fontWeight: 800, color: "#fff", letterSpacing: -1 }}>SOCIA</div>
          <div style={{ fontSize: 26, fontWeight: 600, color: "rgba(255,255,255,0.65)" }}>coming soon</div>
        </div>
      </div>
    </Beat>
  );
};

/* ───────────── sound, root ───────────── */

type Cue = { src: string; at: number; volume: number };
const CUES: Cue[] = [
  { src: sfxImpact, at: 0.01, volume: 0.4 },
  ...[T.open, T.read, T.plans, T.cant, T.end].map((at) => ({ src: sfxWhoosh, at: at - 0.05, volume: 0.3 })),
  { src: sfxPop, at: T.paste, volume: 0.5 },
  { src: sfxClick, at: T.shot, volume: 0.7 },
  { src: sfxClick, at: T.read - 0.35, volume: 0.5 },
  ...TOOLS.map((_, i) => ({ src: sfxClick, at: T.read + 1.05 + i * 0.4, volume: 0.3 })),
  ...T.stat.map((at) => ({ src: sfxPop, at, volume: 0.35 })),
  ...[T.days[0], T.days[2], T.days[4]].map((at) => ({ src: sfxClick, at, volume: 0.4 })),
  { src: sfxImpact, at: T.every, volume: 0.4 },
];

export const Reel: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: SANS }}>
    <Audio src={vo} />
    {CUES.map((c, i) => (
      <Sequence key={i} from={Math.max(0, Math.round(c.at * FPS))} name={`sfx ${i}`}>
        <Audio src={c.src} volume={c.volume} />
      </Sequence>
    ))}
    <Ground />
    <ChatTop />
    <Hook />
    <PromptScene />
    <ReadScene />
    <AnswerScene />
    <CantScene />
    <EndCard />
    <Caption />
  </AbsoluteFill>
);
