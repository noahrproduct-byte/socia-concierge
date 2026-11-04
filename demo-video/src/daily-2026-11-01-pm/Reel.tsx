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
import { DARK, DRAFTS, FPS, PHRASES, ROWS, T } from "./story";

const inter = loadFont("normal", { weights: ["500", "600", "700", "800"], subsets: ["latin"] });
const mono = loadMono("normal", { weights: ["500", "600"], subsets: ["latin"] });
const SANS = `${inter.fontFamily}, Inter, sans-serif`;
const MONO = `${mono.fontFamily}, Menlo, monospace`;

// SOCIA's tokens (app/styles/tokens.css): warm paper, near-black ink, gold accent, cobalt for data.
const PAPER = "#f6f4ef";
const CARD = "#ffffff";
const INK = "#17191d";
const INK2 = "#5f646c";
const LINE = "#e4e1da";
const GOLD = "#8a6a2c";
const GOLD_BRIGHT = "#d9b25c";
const COBALT = "#2a62f5";
const GREEN = "#1f8a4c";

const useT = () => useCurrentFrame() / FPS;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = (t: number, at: number, dur = 0.3, e = Easing.out(Easing.cubic)) => interpolate(t, [at, at + dur], [0, 1], { ...clamp, easing: e });
const popE = (t: number, at: number, dur = 0.35) => interpolate(t, [at, at + dur], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.7)) });
const typed = (t: number, text: string, from: number, to: number) => text.slice(0, Math.round(interpolate(t, [from, to], [0, text.length], clamp)));
const night = (t: number) => {
  let v = DARK.some(([a, b]) => t >= a && t < b) ? 1 : 0;
  for (const [a, b] of DARK) {
    if (a > 0 && t > a - 0.2 && t < a) v = interpolate(t, [a - 0.2, a], [0, 1], clamp);
    if (t > b - 0.2 && t < b) v = interpolate(t, [b - 0.2, b], [1, 0], clamp);
  }
  return v;
};

const Beat: React.FC<{ at: number; until?: number; children: React.ReactNode }> = ({ at, until = 999, children }) => {
  const t = useT();
  if (t < at - 0.02 || t > until + 0.02) return null;
  const pin = ease(t, at, 0.32);
  const pout = 1 - ease(t, until - 0.2, 0.2, Easing.in(Easing.cubic));
  return <div style={{ position: "absolute", inset: 0, opacity: Math.min(pin, pout), filter: `blur(${(1 - pin) * 10 + (1 - pout) * 8}px)`, transform: `translateY(${(1 - pin) * 24}px)` }}>{children}</div>;
};

/** One big word for the black scenes: slams in with a small overshoot. */
const Slam: React.FC<{ text: string; at: number; color?: string; size?: number }> = ({ text, at, color = "#fff", size = 150 }) => {
  const t = useT();
  const p = popE(t, at, 0.3);
  if (p <= 0) return <span style={{ opacity: 0, fontSize: size }}>{text} </span>;
  return <span style={{ display: "inline-block", fontSize: size, color, transform: `scale(${0.7 + 0.3 * p})`, opacity: Math.min(1, p * 1.4), marginRight: "0.22em" }}>{text}</span>;
};

const ExampleChip: React.FC = () => (
  <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: 600, letterSpacing: 2, color: "#7a5600", background: "#fbecc4", border: "1px solid #e8c771", borderRadius: 8, padding: "3px 10px" }}>EXAMPLE</span>
);
const Mark: React.FC<{ size: number }> = ({ size }) => <Img src={mark} style={{ width: size, height: size, borderRadius: size * 0.24 }} />;
const PlatformDot: React.FC<{ p: string; size?: number }> = ({ p, size = 40 }) =>
  p === "Instagram" ? <InstagramIcon size={size} /> : (
    <div style={{ width: size, height: size, borderRadius: size * 0.28, background: p === "YouTube" ? "#ff0033" : p === "TikTok" ? "#000" : "#1877f2", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SANS, fontWeight: 800, fontSize: size * 0.48 }}>
      {p === "YouTube" ? "▶" : p === "TikTok" ? "♪" : "f"}
    </div>
  );

/* ───────────── ground + caption ───────────── */

const Ground: React.FC = () => {
  const t = useT();
  const n = night(t);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: PAPER }} />
      <AbsoluteFill style={{ backgroundImage: "linear-gradient(rgba(23,25,29,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(23,25,29,0.035) 1px, transparent 1px)", backgroundSize: "54px 54px" }} />
      <AbsoluteFill style={{ background: "#0d0e10", opacity: n }}>
        <div style={{ position: "absolute", left: 140, top: 500, width: 800, height: 800, borderRadius: "50%", background: "rgba(217,178,92,0.16)", filter: "blur(160px)" }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Caption: React.FC = () => {
  const t = useT();
  if (t < T.reel || t >= T.ideas) return null;
  const idx = PHRASES.reduce((v, ph, i) => (t >= ph[0].t - 0.03 ? i : v), -1);
  if (idx < 0) return null;
  const ph = PHRASES[idx];
  const next = PHRASES[idx + 1];
  const out = next ? ease(t, next[0].t - 0.16, 0.14) : ease(t, T.ideas - 0.2, 0.18);
  return (
    <div style={{ position: "absolute", top: 210, left: 100, right: 100, textAlign: "center", fontFamily: SANS, fontWeight: 700, fontSize: 52, lineHeight: 1.22, letterSpacing: -0.8, color: INK, opacity: 1 - out, transform: `translateY(${-14 * out}px)` }}>
      {ph.map((w, i) => {
        const p = ease(t, w.t, 0.3);
        if (p <= 0) return null;
        return <span key={i} style={{ display: "inline-block", marginRight: "0.24em", opacity: p, transform: `translateY(${(1 - p) * 16}px)`, filter: `blur(${(1 - p) * 6}px)`, color: w.em ? GOLD : INK }}>{w.w}</span>;
      })}
    </div>
  );
};

/* ───────────── scenes ───────────── */

const HotTake: React.FC = () => {
  const t = useT();
  const stamp = popE(t, T.take, 0.35);
  const [you, dont, need, more, nw, content] = T.open;
  return (
    <Beat at={0} until={T.reel}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 420, display: "flex", justifyContent: "center" }}>
        <div style={{ transform: `rotate(-4deg) scale(${stamp})`, border: `5px solid ${GOLD_BRIGHT}`, color: GOLD_BRIGHT, borderRadius: 16, padding: "10px 30px", fontFamily: MONO, fontWeight: 600, fontSize: 52, letterSpacing: 8 }}>HOT TAKE</div>
      </div>
      <div style={{ position: "absolute", left: 70, right: 70, top: 640, fontFamily: SANS, fontWeight: 800, letterSpacing: -5, lineHeight: 1.02 }}>
        <div><Slam text="you" at={you} /><Slam text="don't" at={dont} /></div>
        <div><Slam text="need" at={need} /><Slam text="more" at={more} color={GOLD_BRIGHT} /></div>
        <div><Slam text="new" at={nw} color={GOLD_BRIGHT} /><Slam text="content." at={content} /></div>
      </div>
    </Beat>
  );
};

const BestReel: React.FC = () => {
  const t = useT();
  const platforms = ["Instagram", "TikTok", "YouTube", "Facebook"];
  return (
    <Beat at={T.reel} until={T.section}>
      <div style={{ position: "absolute", left: 300, top: 420, width: 480, height: 640, borderRadius: 34, background: ROWS[0].cover, boxShadow: "0 30px 70px rgba(23,25,29,0.25)", overflow: "hidden", transform: `rotate(${-3 + 3 * ease(t, T.reel, 0.6)}deg)` }}>
        <div style={{ position: "absolute", left: 24, top: 22 }}><ExampleChip /></div>
        <div style={{ position: "absolute", left: 30, right: 30, top: 250, fontFamily: SANS, fontWeight: 800, fontSize: 46, color: "#fff", lineHeight: 1.1, textShadow: "0 3px 14px rgba(0,0,0,0.35)" }}>3 cafés,<br />1 rule</div>
        <div style={{ position: "absolute", left: 30, bottom: 30, display: "flex", alignItems: "center", gap: 12, fontFamily: SANS, fontWeight: 700, fontSize: 24, color: "#fff" }}><InstagramIcon size={36} /> your best reel</div>
        <div style={{ position: "absolute", right: 24, top: 70, transform: `scale(${popE(t, 4.25)})`, background: GOLD, color: "#fff", borderRadius: 30, padding: "10px 20px", fontFamily: SANS, fontWeight: 800, fontSize: 30 }}>2.1× your usual</div>
      </div>
      <div style={{ position: "absolute", left: 110, right: 110, top: 1120, display: "flex", justifyContent: "space-between" }}>
        {platforms.map((p, i) => {
          const on = i === 0;
          const show = ease(t, T.onlyOne + 0.1 + i * 0.12, 0.3);
          return (
            <div key={p} style={{ width: 190, height: 170, borderRadius: 24, background: CARD, border: `2px solid ${on ? GREEN : LINE}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, opacity: show, transform: `translateY(${(1 - show) * 20}px)`, fontFamily: SANS }}>
              <div style={{ opacity: on ? 1 : 0.35 }}><PlatformDot p={p} size={58} /></div>
              <div style={{ fontSize: 22, fontWeight: 700, color: on ? GREEN : INK2 }}>{on ? "posted" : "not yet"}</div>
            </div>
          );
        })}
      </div>
    </Beat>
  );
};

const Section: React.FC = () => {
  const t = useT();
  const tapped = t >= T.tap;
  return (
    <Beat at={T.section} until={T.tap + 0.45}>
      <div style={{ position: "absolute", left: 60, right: 60, top: 400, borderRadius: 30, background: CARD, border: `1px solid ${LINE}`, boxShadow: "0 24px 60px rgba(23,25,29,0.12)", padding: "30px 34px", fontFamily: SANS, color: INK }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}><Mark size={46} /><span style={{ fontSize: 34, fontWeight: 800, letterSpacing: -0.6 }}>{typed(t, "Worth posting again", T.title - 0.1, T.title + 0.6)}</span></div>
          <ExampleChip />
        </div>
        <div style={{ marginTop: 12, fontSize: 22, color: INK2, lineHeight: 1.4 }}>Your best recent posts that are not on your other platforms yet.</div>
        <div style={{ display: "flex", gap: 12, marginTop: 18, opacity: ease(t, T.days, 0.3) }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: COBALT, background: "rgba(42,98,245,0.08)", border: "1px solid rgba(42,98,245,0.3)", borderRadius: 20, padding: "6px 16px" }}>last 90 days</span>
          <span style={{ fontSize: 20, fontWeight: 700, color: GOLD, background: "rgba(138,106,44,0.08)", border: "1px solid rgba(138,106,44,0.35)", borderRadius: 20, padding: "6px 16px", opacity: ease(t, T.threshold, 0.3) }}>1.5× your median or more</span>
        </div>
        {ROWS.map((r, i) => {
          const p = ease(t, T.rows + i * 0.2, 0.35);
          const notP = ease(t, T.checks + i * 0.25, 0.3);
          const hot = i === 0 && tapped;
          return (
            <div key={r.title} style={{ display: "flex", gap: 20, alignItems: "center", marginTop: 22, padding: "18px 0", borderTop: `1px solid ${LINE}`, opacity: p, transform: `translateY(${(1 - p) * 18}px)` }}>
              <div style={{ width: 96, height: 96, borderRadius: 16, background: r.cover, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 25, fontWeight: 700 }}>{r.title}</div>
                <div style={{ fontSize: 20, color: INK2, marginTop: 4 }}><b style={{ color: GOLD }}>{r.mult}</b> your median {r.from} views ({r.sample} posts), posted {r.date}</div>
                <div style={{ fontSize: 20, color: COBALT, marginTop: 4, opacity: notP, fontWeight: 600 }}>Not found on your {r.not}.</div>
              </div>
              <div style={{ position: "relative", flexShrink: 0, borderRadius: 14, background: hot ? GOLD : INK, color: "#fff", fontSize: 19, fontWeight: 700, padding: "12px 16px", maxWidth: 190, textAlign: "center", lineHeight: 1.2, opacity: notP, transform: `scale(${hot && t < T.tap + 0.15 ? 0.92 : 1})` }}>
                {hot ? "Copying" : `Post to ${r.not}`}
                {i === 0 && t >= T.tap && t < T.tap + 0.6 ? <div style={{ position: "absolute", left: "50%", top: "50%", width: 40 + 160 * ease(t, T.tap, 0.5), height: 40 + 160 * ease(t, T.tap, 0.5), transform: "translate(-50%,-50%)", borderRadius: "50%", border: `3px solid ${GOLD_BRIGHT}`, opacity: 1 - ease(t, T.tap, 0.5) }} /> : null}
              </div>
            </div>
          );
        })}
      </div>
    </Beat>
  );
};

const Drafts: React.FC = () => {
  const t = useT();
  const lock = ease(t, T.approve, 0.35);
  return (
    <Beat at={T.tap + 0.4} until={T.ideas}>
      {DRAFTS.map((d, i) => {
        const p = ease(t, T.tap + 0.45 + i * 0.25, 0.4);
        const from = T.captions + i * 0.5;
        return (
          <div key={d.p} style={{ position: "absolute", left: 80, right: 80, top: 420 + i * 300, height: 260, borderRadius: 28, background: CARD, border: `1px solid ${LINE}`, boxShadow: "0 20px 50px rgba(23,25,29,0.1)", padding: "24px 30px", fontFamily: SANS, color: INK, opacity: p, transform: `translateX(${(1 - p) * 120}px)` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <PlatformDot p={d.p} size={44} />
              <span style={{ fontSize: 28, fontWeight: 800 }}>{d.p}</span>
              <span style={{ marginLeft: "auto", fontSize: 20, fontWeight: 700, color: INK2, border: `2px solid ${LINE}`, borderRadius: 18, padding: "5px 16px", transform: `scale(${t >= T.draft ? 1 + 0.12 * (1 - ease(t, T.draft, 0.3)) : 1})`, background: t >= T.draft ? "#f1efe9" : CARD }}>{t >= T.draft ? "Draft" : "Writing..."}</span>
            </div>
            <div style={{ marginTop: 20, fontSize: 28, fontWeight: 600, lineHeight: 1.35 }}>{typed(t, d.text, from, from + 1.1)}</div>
            <div style={{ position: "absolute", left: 30, bottom: 20, fontSize: 18, color: INK2 }}>caption written for {d.p}</div>
          </div>
        );
      })}
      <div style={{ position: "absolute", left: 80, right: 80, top: 1040, opacity: lock, transform: `translateY(${(1 - lock) * 24}px)`, borderRadius: 26, background: INK, color: "#fff", padding: "26px 30px", display: "flex", alignItems: "center", gap: 22, fontFamily: SANS }}>
        <div style={{ fontSize: 46 }}>🔒</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 32, fontWeight: 800 }}>Nothing posts until you approve it</div>
          <div style={{ fontSize: 21, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>2 drafts waiting for you</div>
        </div>
        <div style={{ borderRadius: 14, background: GOLD, padding: "12px 22px", fontSize: 24, fontWeight: 800 }}>Approve</div>
      </div>
    </Beat>
  );
};

const Closer: React.FC = () => (
  <Beat at={T.ideas} until={T.soon}>
    <div style={{ position: "absolute", left: 70, right: 70, top: 560, fontFamily: SANS, fontWeight: 800, letterSpacing: -4, lineHeight: 1.05 }}>
      <div style={{ color: "rgba(255,255,255,0.55)" }}><Slam text="New" at={23.46} size={120} color="rgba(255,255,255,0.6)" /><Slam text="ideas" at={23.71} size={120} color="rgba(255,255,255,0.6)" /></div>
      <div><Slam text="are" at={24.24} size={120} color="rgba(255,255,255,0.6)" /><Slam text="great." at={24.35} size={120} color="rgba(255,255,255,0.6)" /></div>
      <div style={{ marginTop: 60 }}><Slam text="Proven" at={25.02} size={140} color={GOLD_BRIGHT} /><Slam text="ones" at={25.39} size={140} color={GOLD_BRIGHT} /></div>
      <div><Slam text="are" at={25.8} size={140} /><Slam text="already" at={25.85} size={140} /></div>
      <div><Slam text="done." at={26.3} size={140} /></div>
    </div>
  </Beat>
);

const EndCard: React.FC = () => {
  const t = useT();
  const following = t >= T.follow + 0.2;
  return (
    <Beat at={T.soon} until={999}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 560, display: "flex", flexDirection: "column", alignItems: "center", gap: 30, fontFamily: SANS }}>
        <div style={{ transform: `scale(${popE(t, T.soon + 0.05, 0.45)})` }}><Mark size={200} /></div>
        <div style={{ fontSize: 120, fontWeight: 800, letterSpacing: -4, color: INK }}>SOCIA</div>
        <div style={{ fontSize: 34, fontWeight: 700, color: GOLD, border: `2px solid ${GOLD}`, borderRadius: 30, padding: "8px 28px", opacity: ease(t, 27.3, 0.3) }}>coming soon</div>
        <div style={{ marginTop: 40, borderRadius: 26, padding: "20px 70px", fontSize: 46, fontWeight: 800, background: following ? CARD : INK, color: following ? INK : "#fff", border: `3px solid ${INK}`, transform: `scale(${popE(t, T.follow - 0.15)})` }}>{following ? "✓ Following" : "+ Follow"}</div>
      </div>
    </Beat>
  );
};

/* ───────────── sound, root ───────────── */

type Cue = { src: string; at: number; volume: number };
const CUES: Cue[] = [
  { src: sfxImpact, at: T.take, volume: 0.6 },
  ...T.open.map((at) => ({ src: sfxClick, at, volume: 0.35 })),
  ...[T.reel, T.section, T.tap + 0.2, T.ideas, T.soon].map((at) => ({ src: sfxWhoosh, at: at - 0.05, volume: 0.3 })),
  { src: sfxPop, at: 4.25, volume: 0.5 },
  ...ROWS.map((_, i) => ({ src: sfxClick, at: T.rows + i * 0.2, volume: 0.4 })),
  { src: sfxClick, at: T.tap, volume: 0.6 },
  { src: sfxPop, at: T.draft, volume: 0.5 },
  { src: sfxPop, at: T.approve, volume: 0.5 },
  { src: sfxImpact, at: T.proven, volume: 0.5 },
  { src: sfxClick, at: T.follow + 0.2, volume: 0.6 },
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
    <HotTake />
    <BestReel />
    <Section />
    <Drafts />
    <Closer />
    <EndCard />
    <Caption />
  </AbsoluteFill>
);
