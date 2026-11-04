import React from "react";
import { AbsoluteFill, Audio, Easing, Img, Sequence, interpolate, useCurrentFrame } from "remotion";
import { loadFont } from "@remotion/google-fonts/InterTight";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import mark from "../brand/socia-mark.png";
import vo from "./audio/vo.mp3";
import sfxPop from "../method/audio/sfx/pop.mp3";
import sfxClick from "../method/audio/sfx/click-soft.mp3";
import sfxWhoosh from "../method/audio/sfx/whoosh-short.mp3";
import sfxImpact from "../method/audio/sfx/impact-bass-1.mp3";
import { InstagramIcon } from "../method/ui";
import { ASK, CLAUDE, CTA, FPS, HOOK, OPENERS, PHRASES, REEL, SOURCE, T, type Word } from "./story";

const inter = loadFont("normal", { weights: ["500", "600", "700", "800"], subsets: ["latin"] });
const mono = loadMono("normal", { weights: ["500", "600"], subsets: ["latin"] });
const SANS = `${inter.fontFamily}, Inter, sans-serif`;
const MONO = `${mono.fontFamily}, Menlo, monospace`;

// SOCIA tokens + Claude's coral for the chat moment.
const PAPER = "#f6f4ef";
const CARD = "#ffffff";
const INK = "#17191d";
const INK2 = "#5f646c";
const LINE = "#e4e1da";
const GOLD_BRIGHT = "#d9b25c";
const CORAL = "#d9714e";
const PEACH = "#f7b48f";
const CPAPER = "#f6f3ee";
const CPAPER2 = "#ece8df";
const GREEN = "#2f9e5b";

const useT = () => useCurrentFrame() / FPS;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = (t: number, at: number, dur = 0.3, e = Easing.out(Easing.cubic)) => interpolate(t, [at, at + dur], [0, 1], { ...clamp, easing: e });
const popE = (t: number, at: number, dur = 0.35) => interpolate(t, [at, at + dur], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.7)) });
const typed = (t: number, text: string, from: number, to: number) => text.slice(0, Math.round(interpolate(t, [from, to], [0, text.length], clamp)));
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

const Beat: React.FC<{ at: number; until?: number; children: React.ReactNode }> = ({ at, until = 999, children }) => {
  const t = useT();
  if (t < at - 0.02 || t > until + 0.02) return null;
  const pin = at <= 0 ? 1 : ease(t, at, 0.32);
  const pout = 1 - ease(t, until - 0.22, 0.22, Easing.in(Easing.cubic));
  return <div style={{ position: "absolute", inset: 0, opacity: Math.min(pin, pout), filter: `blur(${(1 - pin) * 10 + (1 - pout) * 8}px)`, transform: `translateY(${(1 - pin) * 24}px)` }}>{children}</div>;
};

const Rise: React.FC<{ w: Word; color: string; em: string; dur?: number }> = ({ w, color, em, dur = 0.3 }) => {
  const t = useT();
  const p = ease(t, w.t, dur);
  if (p <= 0) return null;
  return <span style={{ display: "inline-block", marginRight: "0.24em", opacity: p, transform: `translateY(${(1 - p) * 18}px)`, filter: `blur(${(1 - p) * 6}px)`, color: w.em ? em : color }}>{w.w}</span>;
};

const Mark: React.FC<{ size: number }> = ({ size }) => <Img src={mark} style={{ width: size, height: size, borderRadius: size * 0.24 }} />;

const ClaudeMark: React.FC<{ size?: number; color?: string }> = ({ size = 40, color = CORAL }) => (
  <svg width={size} height={size} viewBox="-50 -50 100 100">
    {Array.from({ length: 12 }).map((_, i) => {
      const a = (i / 12) * Math.PI * 2;
      const len = i % 2 ? 40 : 46;
      return <line key={i} x1={Math.cos(a) * 8} y1={Math.sin(a) * 8} x2={Math.cos(a) * len} y2={Math.sin(a) * len} stroke={color} strokeWidth={9} strokeLinecap="round" />;
    })}
  </svg>
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
  const n = interpolate(t, [T.cta - 0.25, T.cta], [0, 1], clamp);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: PAPER }} />
      <AbsoluteFill style={{ background: "radial-gradient(circle at 50% 38%, rgba(217,113,78,0.10), transparent 60%)" }} />
      <AbsoluteFill style={{ background: "#141210", opacity: n }}>
        <div style={{ position: "absolute", left: 190, top: 520, width: 700, height: 700, borderRadius: "50%", background: "rgba(217,113,78,0.22)", filter: "blur(170px)" }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Caption: React.FC = () => {
  const t = useT();
  if (t < T.ask || t >= T.cta) return null;
  const idx = PHRASES.reduce((v, ph, i) => (t >= ph[0].t - 0.03 ? i : v), -1);
  if (idx < 0) return null;
  const ph = PHRASES[idx];
  const next = PHRASES[idx + 1];
  const out = next ? ease(t, next[0].t - 0.16, 0.14) : ease(t, T.cta - 0.2, 0.18);
  return (
    <div style={{ position: "absolute", top: 150, left: 80, right: 80, textAlign: "center", fontFamily: SANS, fontWeight: 700, fontSize: 50, lineHeight: 1.18, letterSpacing: -0.8, color: INK, opacity: 1 - out, transform: `translateY(${-14 * out}px)` }}>
      {ph.map((w, i) => <Rise key={i} w={w} color={INK} em={CORAL} />)}
    </div>
  );
};

/* ───────────── 1 · hook: the Reel and its saves ───────────── */

const ReelCard: React.FC<{ w: number }> = ({ w }) => (
  <div style={{ width: w, height: w * 1.6, borderRadius: 30, background: "linear-gradient(165deg,#24201c,#3e2c24 60%,#5a3a2c)", boxShadow: "0 30px 70px rgba(23,25,29,0.28)", position: "relative", overflow: "hidden", fontFamily: SANS }}>
    <div style={{ position: "absolute", left: 26, right: 26, top: w * 0.42, fontSize: w * 0.098, fontWeight: 800, color: "#fff", lineHeight: 1.12 }}>{REEL.title}</div>
    <div style={{ position: "absolute", left: 26, bottom: 24, display: "flex", alignItems: "center", gap: 12, fontSize: 22, fontWeight: 700, color: "#fff" }}><InstagramIcon size={34} /> {REEL.date}</div>
  </div>
);

const HookScene: React.FC = () => {
  const t = useT();
  const count = interpolate(t, [T.saves, T.saves + 0.7], [0, REEL.saves], { ...clamp, easing: Easing.out(Easing.cubic) });
  const bars = ease(t, T.more, 0.5);
  const card = ease(t, 0, 0.5);
  return (
    <Beat at={0} until={T.ask}>
      <div style={{ position: "absolute", left: 80, right: 80, top: 190, fontFamily: SANS, fontWeight: 800, letterSpacing: -4, color: INK, lineHeight: 1 }}>
        <div style={{ fontSize: 96 }}>{HOOK.map((w, i) => <Rise key={i} w={w} color={INK} em={CORAL} dur={0.2} />)}</div>
        <div style={{ fontSize: 200, color: CORAL, opacity: ease(t, T.saves, 0.15), marginTop: 6 }}>{Math.round(count)} saves.</div>
      </div>
      <div style={{ position: "absolute", left: 80, top: 640, transform: `rotate(${-4 + 4 * card}deg) translateY(${(1 - card) * 60}px)`, opacity: card }}><ReelCard w={420} /></div>
      <div style={{ position: "absolute", left: 560, width: 400, top: 700, fontFamily: SANS, opacity: bars }}>
        <div style={{ fontSize: 30, fontWeight: 800, color: INK, marginBottom: 24 }}>More saves than likes</div>
        {[{ k: "Saves", v: REEL.saves, c: CORAL }, { k: "Likes", v: REEL.likes, c: "#b9b4aa" }].map((r, i) => (
          <div key={r.k} style={{ marginBottom: 26 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 28, fontWeight: 700, color: INK }}><span>{r.k}</span><span>{r.v}</span></div>
            <div style={{ marginTop: 8, height: 38, borderRadius: 10, background: "#ebe7df" }}>
              <div style={{ width: `${(r.v / 41) * 100 * ease(t, T.more + 0.1 + i * 0.15, 0.6)}%`, height: "100%", borderRadius: 10, background: r.c }} />
            </div>
          </div>
        ))}
        <div style={{ marginTop: 10, fontSize: 22, color: INK2, lineHeight: 1.4 }}>{fmt(REEL.views)} views · {REEL.shares} shares · {REEL.comments} comments</div>
      </div>
      <div style={{ position: "absolute", left: 80, top: 1340, fontFamily: MONO, fontSize: 20, color: INK2, opacity: ease(t, T.saves, 0.3) }}>{SOURCE}</div>
    </Beat>
  );
};

/* ───────────── Claude window ───────────── */

const Window: React.FC<{ top?: number; height?: number; children?: React.ReactNode }> = ({ top = 320, height = 1040, children }) => (
  <div style={{ position: "absolute", left: 52, width: 976, top, height, borderRadius: 20, overflow: "hidden", background: CPAPER, boxShadow: "0 30px 80px rgba(40,30,20,0.25)", fontFamily: SANS, color: "#2b2a28" }}>
    <div style={{ height: 58, background: CPAPER2, display: "flex", alignItems: "center", padding: "0 20px", gap: 10, borderBottom: `1px solid ${LINE}` }}>
      {["#ff5f57", "#febc2e", "#28c840"].map((c) => <div key={c} style={{ width: 16, height: 16, borderRadius: 8, background: c }} />)}
      <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", width: 420, height: 34, borderRadius: 9, background: "#fff", fontSize: 18, color: INK2, display: "flex", alignItems: "center", justifyContent: "center" }}>claude.ai</div>
    </div>
    <div style={{ height: 60, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontSize: 22, fontWeight: 600, borderBottom: `1px solid ${LINE}` }}><ClaudeMark size={20} /> Claude</div>
    <div style={{ position: "relative", height: height - 118, overflow: "hidden" }}>{children}</div>
  </div>
);

const AskScene: React.FC = () => {
  const t = useT();
  const blink = Math.floor(t * 2.2) % 2 === 0;
  const text = typed(t, ASK, T.typeFrom, T.typeTo);
  const sent = t >= T.typeTo + 0.12;
  return (
    <Beat at={T.ask} until={T.pull}>
      <Window>
        <div style={{ position: "absolute", left: 0, right: 0, top: 230, display: "flex", justifyContent: "center" }}><ClaudeMark size={84} /></div>
        <div style={{ position: "absolute", left: 30, right: 30, top: 380, minHeight: 170, borderRadius: 20, background: "#fff", border: `2px solid ${sent ? CORAL : "#e9a58c"}`, padding: "24px 26px 70px", fontSize: 30, lineHeight: 1.35 }}>
          {text}
          {!sent && blink ? <span style={{ display: "inline-block", width: 2, height: 32, background: INK, marginLeft: 2, verticalAlign: "middle" }} /> : null}
          <div style={{ position: "absolute", left: 22, bottom: 16, display: "flex", alignItems: "center", gap: 8, fontSize: 19, color: INK2, border: `1px solid ${LINE}`, borderRadius: 10, padding: "5px 12px" }}><Mark size={22} /> socia connected</div>
          <div style={{ position: "absolute", right: 18, bottom: 14, width: 46, height: 46, borderRadius: 12, background: CORAL, color: "#fff", fontSize: 26, display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${sent ? 0.9 : 1})` }}>↑</div>
        </div>
      </Window>
    </Beat>
  );
};

const ToolRow: React.FC<{ name: string; at: number; done: string }> = ({ name, at, done }) => {
  const t = useT();
  const p = ease(t, at - 0.3, 0.25);
  const ok = t >= at;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 22, opacity: p, transform: `translateY(${(1 - p) * 10}px)`, marginBottom: 12 }}>
      <Mark size={28} /><b>socia</b><span style={{ fontFamily: MONO, fontSize: 19, color: INK2 }}>{name}</span>
      <span style={{ color: INK2, marginLeft: 6 }}>{ok ? done : "..."}</span>
      <span style={{ marginLeft: "auto" }}>{ok ? <Check size={24} /> : <Spinner size={22} />}</span>
    </div>
  );
};

const UserBubble: React.FC = () => (
  <div style={{ marginLeft: 150, background: CPAPER2, borderRadius: 18, padding: "16px 22px", fontSize: 24, lineHeight: 1.35 }}>{ASK}</div>
);

const Stat: React.FC<{ k: string; v: string; at: number; hot?: boolean }> = ({ k, v, at, hot }) => {
  const t = useT();
  const p = popE(t, at, 0.4);
  return (
    <div style={{ flex: 1, borderRadius: 16, background: hot ? "#fdf0eb" : "#fff", border: `2px solid ${hot ? "#eab3a0" : LINE}`, padding: "16px 18px", opacity: Math.min(1, p * 1.3), transform: `scale(${0.85 + 0.15 * p})` }}>
      <div style={{ fontSize: 20, color: INK2, fontWeight: 600 }}>{k}</div>
      <div style={{ fontSize: 46, fontWeight: 800, letterSpacing: -1.5, color: hot ? CORAL : "#2b2a28" }}>{v}</div>
    </div>
  );
};

const PullScene: React.FC = () => (
  <Beat at={T.pull} until={T.answer}>
    <Window>
      <div style={{ position: "absolute", left: 30, right: 30, top: 26 }}>
        <UserBubble />
        <div style={{ marginTop: 30 }}>
          <ToolRow name="get_top_posts" at={T.tools[0]} done="9 Reels, last 30 days" />
          <ToolRow name="get_performance_insights" at={T.tools[1]} done="1 breakout" />
          <ToolRow name="get_content_plan" at={T.tools[2]} done="Nov 2 plan" />
        </div>
        <div style={{ marginTop: 24, borderRadius: 18, background: "#fff", border: `1px solid ${LINE}`, padding: "20px 22px" }}>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{REEL.title}</div>
          <div style={{ fontSize: 19, color: INK2, marginTop: 4 }}>Reel · {REEL.date}</div>
          <div style={{ display: "flex", gap: 14, marginTop: 18 }}>
            <Stat k="Views" v={fmt(REEL.views)} at={T.views} />
            <Stat k="Saves" v={String(REEL.saves)} at={T.savesN} hot />
            <Stat k="vs your median" v={REEL.mult} at={T.mult} hot />
          </div>
          <div style={{ display: "flex", gap: 14, marginTop: 14 }}>
            <Stat k="Likes" v={String(REEL.likes)} at={T.savesN + 0.25} />
            <Stat k="Shares" v={String(REEL.shares)} at={T.savesN + 0.4} />
            <Stat k="Comments" v={String(REEL.comments)} at={T.savesN + 0.55} />
          </div>
          <div style={{ marginTop: 14, fontSize: 18, color: INK2, fontFamily: MONO }}>{REEL.interactions} interactions vs a median of {REEL.median} · {SOURCE}</div>
        </div>
      </div>
    </Window>
  </Beat>
);

/* ───────────── 4 · Claude's breakdown ───────────── */

const Section: React.FC<{ head: string; at: number; children: React.ReactNode }> = ({ head, at, children }) => {
  const t = useT();
  const p = ease(t, at, 0.35);
  return (
    <div style={{ marginTop: 26, opacity: p, transform: `translateY(${(1 - p) * 18}px)` }}>
      <div style={{ fontSize: 27, fontWeight: 800, color: "#2b2a28" }}>{head}</div>
      <div style={{ marginTop: 8 }}>{children}</div>
    </div>
  );
};

const Tag: React.FC<{ label: string; at: number; last?: boolean; children: React.ReactNode }> = ({ label, at, last, children }) => {
  const t = useT();
  const p = ease(t, at, 0.3);
  return (
    <span style={{ position: "relative", display: "inline-block", marginRight: last ? 0 : 10 }}>
      <span style={{ background: `rgba(217,113,78,${0.22 * p})`, borderRadius: 6, padding: "0 4px", boxShadow: `inset 0 -4px 0 rgba(217,113,78,${p})` }}>{children}</span>
      <span style={{ position: "absolute", left: 4, top: -26, fontSize: 16, fontWeight: 700, color: CORAL, opacity: p, whiteSpace: "nowrap", fontFamily: MONO }}>{label}</span>
    </span>
  );
};

const AnswerScene: React.FC = () => {
  const t = useT();
  // scroll the reply up as later sections arrive
  const scroll = interpolate(t, [T.contrast - 0.3, T.contrast + 0.3, T.caveat - 0.6, T.caveat], [0, 150, 150, 360], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const maxV = 513;
  return (
    <Beat at={T.answer} until={T.cta}>
      <Window>
        <div style={{ position: "absolute", left: 34, right: 34, top: 26 - scroll, fontSize: 27, lineHeight: 1.42 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 21, color: INK2 }}><ClaudeMark size={24} /> used 3 socia tools</div>
          <div style={{ marginTop: 14, opacity: ease(t, T.answer + 0.1, 0.3) }}>{CLAUDE.intro}</div>
          <Section head={CLAUDE.hookHead} at={T.hook}>
            <div style={{ borderLeft: `4px solid ${CORAL}`, padding: "30px 0 6px 18px", fontSize: 31, fontWeight: 700, lineHeight: 1.6 }}>
              "<Tag label="result" at={T.result}>Connect</Tag><Tag label="tool" at={T.tool}>Claude</Tag><Tag label="result" at={T.result}>to your Instagram</Tag><Tag label="time limit" at={T.time} last>in 60 seconds</Tag>"
            </div>
            <div style={{ marginTop: 8, color: INK2, opacity: ease(t, T.quote + 0.4, 0.3) }}>{CLAUDE.hookBody}</div>
          </Section>
          <Section head={CLAUDE.structHead} at={T.structure}>
            <div style={{ color: INK2 }}>{CLAUDE.structBody}</div>
          </Section>
          <Section head={CLAUDE.contrastHead} at={T.contrast}>
            <div style={{ color: INK2 }}>{CLAUDE.contrastBody}</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 18, height: 220, marginTop: 16, padding: "0 6px" }}>
              {OPENERS.map((o, i) => {
                const g = ease(t, T.bars + i * 0.18, 0.45);
                const first = i === 0;
                return (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: first ? "#2b2a28" : INK2, opacity: g }}>{o.views}</div>
                    <div style={{ width: "100%", height: 150 * (o.views / maxV) * g, borderRadius: "8px 8px 0 0", background: first ? "#2b2a28" : "#cfc8bc" }} />
                    <div style={{ fontSize: 17, color: INK2 }}>{o.date}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 17, color: INK2, fontFamily: MONO, marginTop: 6 }}>views · "stop guessing" Reels · SOCIA, Nov 2</div>
          </Section>
          <Section head={CLAUDE.caveatHead} at={T.honest}>
            <div style={{ borderRadius: 14, background: "#fdf0eb", border: "2px solid #eab3a0", padding: "16px 20px" }}>{CLAUDE.caveatBody}</div>
          </Section>
        </div>
      </Window>
    </Beat>
  );
};

/* ───────────── 5 · CTA, 6 · end ───────────── */

const CtaScene: React.FC = () => {
  const t = useT();
  const bub = popE(t, T.comments, 0.4);
  return (
    <Beat at={T.cta} until={T.end}>
      <div style={{ position: "absolute", left: 80, right: 80, top: 520, fontFamily: SANS, fontWeight: 800, fontSize: 104, letterSpacing: -4, lineHeight: 1.04, color: "#fff" }}>
        {CTA.map((w, i) => <Rise key={i} w={w} color="#fff" em={PEACH} />)}
      </div>
      <div style={{ position: "absolute", left: 80, top: 1060, display: "flex", alignItems: "center", gap: 18, background: "#fff", borderRadius: "28px 28px 28px 6px", padding: "20px 30px", fontFamily: SANS, fontSize: 38, fontWeight: 700, color: INK, transform: `scale(${bub})`, transformOrigin: "left bottom" }}>
        Tell me in the comments
      </div>
    </Beat>
  );
};

const EndCard: React.FC = () => {
  const t = useT();
  const brand = popE(t, T.end, 0.45);
  return (
    <Beat at={T.end} until={999}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 640, display: "flex", flexDirection: "column", alignItems: "center", gap: 28, fontFamily: SANS }}>
        <div style={{ transform: `scale(${brand})` }}><Mark size={190} /></div>
        <div style={{ fontSize: 116, fontWeight: 800, letterSpacing: -4, color: "#fff" }}>SOCIA</div>
        <div style={{ fontSize: 34, fontWeight: 700, color: GOLD_BRIGHT, border: `2px solid ${GOLD_BRIGHT}`, borderRadius: 30, padding: "8px 28px", opacity: ease(t, T.soon, 0.3) }}>coming soon</div>
      </div>
    </Beat>
  );
};

/* ───────────── sound, root ───────────── */

type Cue = { src: string; at: number; volume: number };
const CUES: Cue[] = [
  { src: sfxImpact, at: T.saves, volume: 0.45 },
  { src: sfxPop, at: T.more + 0.1, volume: 0.4 },
  ...[T.ask, T.pull, T.answer, T.cta].map((at) => ({ src: sfxWhoosh, at: at - 0.08, volume: 0.28 })),
  { src: sfxClick, at: T.typeTo + 0.1, volume: 0.5 },
  ...T.tools.map((at) => ({ src: sfxClick, at, volume: 0.35 })),
  ...[T.views, T.savesN, T.mult].map((at) => ({ src: sfxPop, at, volume: 0.4 })),
  ...[T.tool, T.result, T.time].map((at) => ({ src: sfxClick, at, volume: 0.35 })),
  { src: sfxPop, at: T.honest, volume: 0.4 },
  { src: sfxPop, at: T.comments, volume: 0.45 },
  { src: sfxPop, at: T.end, volume: 0.5 },
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
    <HookScene />
    <AskScene />
    <PullScene />
    <AnswerScene />
    <CtaScene />
    <EndCard />
    <Caption />
  </AbsoluteFill>
);
