import React from "react";
import { AbsoluteFill, Audio, Easing, Img, Sequence, interpolate, useCurrentFrame } from "remotion";
import { loadFont as loadSans } from "@remotion/google-fonts/HankenGrotesk";
import { loadFont as loadSerif } from "@remotion/google-fonts/InstrumentSerif";
import { loadFont as loadCond } from "@remotion/google-fonts/Anton";
import { loadFont as loadMono } from "@remotion/google-fonts/DMMono";
import mark from "../brand/socia-mark.png";
import vo from "./audio/vo.mp3";
import sfxPop from "../method/audio/sfx/pop.mp3";
import sfxClick from "../method/audio/sfx/click-soft.mp3";
import sfxWhoosh from "../method/audio/sfx/whoosh-short.mp3";
import sfxImpact from "../method/audio/sfx/impact-bass-1.mp3";
import { FPS, GROUPS, POSTS, PROMO, SCENES, SOURCE, SceneId, T, TOP } from "./story";

const sans = loadSans("normal", { weights: ["500", "600", "700", "800"], subsets: ["latin"] });
const serif = loadSerif("italic", { weights: ["400"], subsets: ["latin"] });
const cond = loadCond("normal", { weights: ["400"], subsets: ["latin"] });
const mono = loadMono("normal", { weights: ["400", "500"], subsets: ["latin"] });
const SANS = `${sans.fontFamily}, sans-serif`;
const SERIF = `${serif.fontFamily}, serif`;
const COND = `${cond.fontFamily}, Impact, sans-serif`;
const MONO = `${mono.fontFamily}, Menlo, monospace`;

const PAPER = "#efede7";
const INK = "#141414";
const RED = "#e5432d";
const GREY = "#8d887f";
const LINE = "#d9d5cc";
const GREEN = "#1f8a4c";
const CLAUDE = "#d97757";

const useT = () => useCurrentFrame() / FPS;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = (t: number, at: number, dur = 0.3) => interpolate(t, [at, at + dur], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
const popE = (t: number, at: number, dur = 0.35) => interpolate(t, [at, at + dur], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.8)) });
const typed = (t: number, s: string, a: number, b: number) => s.slice(0, Math.round(interpolate(t, [a, b], [0, s.length], clamp)));
const sceneAt = (t: number) => SCENES.reduce((v, s, i) => (t >= s.from ? i : v), 0);

/* ───────────── small parts ───────────── */

const Pop: React.FC<{ at: number; rot?: number; style?: React.CSSProperties; children: React.ReactNode }> = ({ at, rot = 0, style, children }) => {
  const t = useT();
  const p = popE(t, at);
  if (t < at) return null;
  return <div style={{ position: "absolute", transform: `scale(${0.4 + 0.6 * p}) rotate(${rot}deg)`, opacity: Math.min(1, p * 2), ...style }}>{children}</div>;
};

const Sticker: React.FC<{ style?: React.CSSProperties; children: React.ReactNode }> = ({ style, children }) => (
  <div style={{ background: "#fff", border: `5px solid ${INK}`, borderRadius: 26, boxShadow: "10px 12px 0 rgba(20,20,20,0.14)", ...style }}>{children}</div>
);

const Tag: React.FC<{ children: React.ReactNode; red?: boolean; size?: number; strike?: number }> = ({ children, red, size = 64, strike }) => (
  <span style={{ position: "relative", display: "inline-block", fontFamily: COND, fontSize: size, lineHeight: 1, color: "#fff", background: red ? RED : INK, padding: "8px 18px 10px", borderRadius: 8, letterSpacing: 1 }}>
    {children}
    {strike != null ? <span style={{ position: "absolute", left: "6%", top: "52%", height: size * 0.13, width: `${88 * strike}%`, background: RED, borderRadius: 4 }} /> : null}
  </span>
);

const RedX: React.FC<{ at: number; size?: number; style?: React.CSSProperties }> = ({ at, size = 420, style }) => {
  const t = useT();
  if (t < at) return null;
  const a = ease(t, at, 0.14);
  const b = ease(t, at + 0.1, 0.14);
  const bar = (p: number, r: number): React.CSSProperties => ({ position: "absolute", left: "50%", top: "50%", width: size * p, height: size * 0.11, marginLeft: -(size * p) / 2, marginTop: -size * 0.055, background: RED, borderRadius: size, transform: `rotate(${r}deg)`, boxShadow: "0 4px 0 rgba(0,0,0,0.12)" });
  return (
    <div style={{ position: "absolute", width: size, height: size, ...style }}>
      <div style={bar(a, 45)} />
      <div style={bar(b, -45)} />
    </div>
  );
};

const ClaudeMark: React.FC<{ size: number; color?: string }> = ({ size, color = CLAUDE }) => (
  <div style={{ position: "relative", width: size, height: size }}>
    {Array.from({ length: 8 }).map((_, i) => (
      <div key={i} style={{ position: "absolute", left: size / 2 - size * 0.07, top: 0, width: size * 0.14, height: size / 2, borderRadius: size, background: color, transformOrigin: "50% 100%", transform: `rotate(${i * 45 + (i % 2) * 8}deg) scaleY(${i % 2 ? 0.82 : 1})` }} />
    ))}
  </div>
);
const Mark: React.FC<{ size: number }> = ({ size }) => <Img src={mark} style={{ width: size, height: size, borderRadius: size * 0.24, display: "block" }} />;
const Example: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
  <span style={{ fontFamily: MONO, fontSize: 20, letterSpacing: 2, color: "#7a5600", background: "#fbecc4", border: "1.5px solid #e8c771", borderRadius: 8, padding: "3px 10px", ...style }}>EXAMPLE</span>
);
const Source: React.FC<{ top: number; text?: string }> = ({ top, text = SOURCE }) => (
  <div style={{ position: "absolute", left: 0, right: 0, top, textAlign: "center", fontFamily: MONO, fontSize: 21, color: GREY }}>{text}</div>
);
const Check: React.FC<{ on: boolean; size?: number }> = ({ on, size = 40 }) => (
  <div style={{ width: size, height: size, borderRadius: size, background: on ? GREEN : "transparent", border: on ? "none" : `3px solid ${LINE}`, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SANS, fontWeight: 800, fontSize: size * 0.55, flexShrink: 0 }}>{on ? "✓" : ""}</div>
);
const Spin: React.FC<{ size?: number }> = ({ size = 34 }) => {
  const t = useT();
  return <div style={{ width: size, height: size, borderRadius: size, border: `4px solid rgba(255,255,255,0.2)`, borderTopColor: RED, transform: `rotate(${t * 520}deg)`, flexShrink: 0 }} />;
};
const Wave: React.FC<{ n: number; h: number; color: string; grow?: number; seed?: number; gap?: number; w?: number }> = ({ n, h, color, grow = 1, seed = 1, gap = 5, w = 7 }) => {
  const t = useT();
  return (
    <div style={{ display: "flex", alignItems: "center", gap, height: h }}>
      {Array.from({ length: n }).map((_, i) => {
        const v = 0.25 + 0.75 * Math.abs(Math.sin(i * 1.7 * seed + 0.6) * Math.cos(i * 0.43 + t * 3.2));
        const g = Math.max(0, Math.min(1, grow * n - i));
        return <div key={i} style={{ width: w, height: Math.max(4, h * v * g), borderRadius: 4, background: color }} />;
      })}
    </div>
  );
};
const Camera: React.FC<{ s?: number }> = ({ s = 1 }) => (
  <div style={{ position: "relative", width: 420 * s, height: 400 * s }}>
    {[0, 1].map((i) => (
      <div key={i} style={{ position: "absolute", left: (110 + i * 140) * s, top: 0, width: 130 * s, height: 130 * s, borderRadius: "50%", background: "#2b2d31", border: `${6 * s}px solid ${INK}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 40 * s, height: 40 * s, borderRadius: "50%", background: "#c9c6bf" }} />
      </div>
    ))}
    <div style={{ position: "absolute", left: 90 * s, top: 120 * s, width: 300 * s, height: 160 * s, borderRadius: 22 * s, background: "#3a3d43", border: `${6 * s}px solid ${INK}` }} />
    <div style={{ position: "absolute", left: 0, top: 150 * s, width: 100 * s, height: 100 * s, background: "#2b2d31", border: `${6 * s}px solid ${INK}`, clipPath: "polygon(0 0,100% 25%,100% 75%,0 100%)" }} />
    <div style={{ position: "absolute", left: 230 * s, top: 280 * s, width: 8 * s, height: 120 * s, background: INK, transform: "rotate(18deg)", transformOrigin: "top" }} />
    <div style={{ position: "absolute", left: 230 * s, top: 280 * s, width: 8 * s, height: 120 * s, background: INK, transform: "rotate(-18deg)", transformOrigin: "top" }} />
    <div style={{ position: "absolute", left: 232 * s, top: 280 * s, width: 6 * s, height: 115 * s, background: INK }} />
  </div>
);

/* ───────────── ground, header, caption ───────────── */

const Ground: React.FC<{ id: SceneId }> = ({ id }) => (
  <AbsoluteFill>
    <AbsoluteFill style={{ background: PAPER }} />
    <AbsoluteFill style={{ backgroundImage: "radial-gradient(rgba(20,20,20,0.05) 1.2px, transparent 1.4px)", backgroundSize: "12px 12px" }} />
    {id === "connector" ? (
      <AbsoluteFill>
        <AbsoluteFill style={{ background: "#b9b6b0", backgroundImage: "radial-gradient(rgba(20,20,20,0.35) 2.2px, transparent 2.6px)", backgroundSize: "9px 9px" }} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, background: "linear-gradient(180deg, rgba(255,255,255,0.0), rgba(255,255,255,0.5))", clipPath: "polygon(36% 0, 64% 0, 92% 100%, 8% 100%)", filter: "blur(30px)" }} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, background: "rgba(245,243,238,0.75)", clipPath: "polygon(40% 0, 60% 0, 86% 100%, 14% 100%)", filter: "blur(40px)" }} />
      </AbsoluteFill>
    ) : null}
  </AbsoluteFill>
);

const Header: React.FC = () => {
  const t = useT();
  const s = SCENES[sceneAt(t)];
  let right = s.right;
  if (s.id === "build") right = `LAYERS ${t >= T.scenes ? 3 : t >= T.voice - 0.3 ? 2 : 1}/3`;
  const parts = right ? right.split(" ") : [];
  return (
    <>
      <div style={{ position: "absolute", left: 120, top: 116, fontFamily: MONO, fontSize: 24, color: GREY }}>{s.label}</div>
      {right ? (
        <div style={{ position: "absolute", right: 120, top: 116, fontFamily: MONO, fontSize: 24, letterSpacing: 2, color: GREY }}>
          {parts.slice(0, -1).join(" ")} <span style={{ color: RED }}>{parts[parts.length - 1]}</span>
        </div>
      ) : null}
    </>
  );
};

const Caption: React.FC = () => {
  const t = useT();
  const gi = GROUPS.reduce((v, g, i) => (t >= g[0][1] - 0.03 ? i : v), 0);
  const g = GROUPS[gi];
  const next = GROUPS[gi + 1];
  const out = next ? ease(t, next[0][1] - 0.15, 0.12) : 0;
  return (
    <div style={{ position: "absolute", left: 120, top: 200, width: 860, fontFamily: SANS, fontWeight: 600, fontSize: 70, lineHeight: 1.14, letterSpacing: -1.6, color: INK, opacity: 1 - out, transform: `translateY(${-12 * out}px)` }}>
      {g.map(([w, at, acc], i) => {
        const p = ease(t, at, 0.3);
        if (p <= 0) return null;
        const letter = w.length <= 2 && acc && /^[SOCIA]\.?$/.test(w);
        return (
          <span key={i} style={{ display: "inline-block", marginRight: letter ? "0.12em" : "0.24em", opacity: p, transform: `translateY(${(1 - p) * 14}px)`, filter: `blur(${(1 - p) * 5}px)`, color: acc ? RED : INK, fontFamily: acc ? SERIF : SANS, fontWeight: acc ? 400 : 600, fontSize: acc ? 82 : 70, letterSpacing: acc ? -0.5 : -1.6 }}>{w}</span>
        );
      })}
    </div>
  );
};

/* ───────────── scenes ───────────── */

const Insights: React.FC<{ t: number; small?: boolean }> = ({ t }) => {
  const n = Math.round(TOP.views * interpolate(t, T.count, [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) }));
  const pts = Array.from({ length: 24 }).map((_, i) => `${i * 28},${150 - 140 * Math.pow(i / 23, 2.4)}`).join(" ");
  return (
    <div style={{ width: 780, borderRadius: 38, background: "#111214", boxShadow: "0 30px 60px rgba(0,0,0,0.25)", padding: "30px 36px 26px", fontFamily: SANS, color: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ fontSize: 34, opacity: 0.8 }}>‹</span><Mark size={46} /><span style={{ fontSize: 28, fontWeight: 700 }}>socia.appmedia</span>
        <span style={{ marginLeft: "auto", fontSize: 22, opacity: 0.7 }}>Top reel</span>
      </div>
      <div style={{ marginTop: 16, display: "inline-block", fontSize: 21, fontWeight: 600, background: "#26282c", borderRadius: 12, padding: "6px 14px" }}>Last 30 days</div>
      <div style={{ marginTop: 16, textAlign: "center", fontSize: 150, fontWeight: 800, letterSpacing: -4, color: RED, lineHeight: 1 }}>{n.toLocaleString("en-US")}</div>
      <div style={{ textAlign: "center", fontSize: 26, opacity: 0.75, marginTop: 6 }}>Views</div>
      <svg width="708" height="160" style={{ marginTop: 10 }}><polyline points={pts} fill="none" stroke="#fff" strokeWidth="4" strokeDasharray="1200" strokeDashoffset={1200 * (1 - ease(t, 0.2, 1.4))} /></svg>
      <div style={{ fontSize: 21, opacity: 0.65, marginTop: 6 }}>“{TOP.title}” · {TOP.date}</div>
    </div>
  );
};

const Proof: React.FC = () => {
  const t = useT();
  return (
    <>
      <div style={{ position: "absolute", left: 150, top: 590 }}><Insights t={t} /></div>
      <Pop at={T.oneReel} rot={8} style={{ left: 760, top: 520 }}>
        <Sticker style={{ width: 190, padding: "8px 0 14px", textAlign: "center" }}>
          <div style={{ fontFamily: COND, fontSize: 30, color: "#fff", background: RED, margin: "0 14px", borderRadius: 8 }}>ONLY</div>
          <div style={{ fontFamily: COND, fontSize: 92, lineHeight: 1.05, color: INK }}>1 reel</div>
        </Sticker>
      </Pop>
      <Source top={1290} />
    </>
  );
};

const CameraScene: React.FC = () => {
  const t = useT();
  return (
    <>
      <div style={{ position: "absolute", left: 120, top: 520, transform: "scale(0.42)", transformOrigin: "0 0" }}><Insights t={99} /></div>
      <Pop at={T.filmed} style={{ left: 330, top: 820 }}><Camera /></Pop>
      <RedX at={T.frame} size={520} style={{ left: 280, top: 760 }} />
      {t >= T.frame + 0.2 ? <div style={{ position: "absolute", left: 0, right: 0, top: 1270, textAlign: "center" }}><Pop at={T.frame + 0.2} style={{ position: "relative" }}><Tag size={70} strike={1}>FILMED</Tag></Pop></div> : null}
    </>
  );
};

const Laptop: React.FC<{ t: number }> = ({ t }) => (
  <div style={{ position: "relative", width: 860, height: 600 }}>
    <div style={{ position: "absolute", left: 60, top: 0, width: 740, height: 480, borderRadius: 28, background: INK, padding: 18 }}>
      <div style={{ width: "100%", height: "100%", borderRadius: 14, background: "linear-gradient(135deg,#6d5a8c,#c78a73 60%,#e8b98f)", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 90, top: 50, width: 520, height: 340, borderRadius: 18, background: "rgba(30,28,32,0.92)", padding: "22px 26px", fontFamily: SANS, color: "#fff" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}><ClaudeMark size={30} /><span style={{ fontSize: 24, fontWeight: 700 }}>Building reel</span><span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 16, opacity: 0.6 }}>connect-claude.mp4</span></div>
          {[["Script", 5.6], ["Voice", 6.2], ["Scenes", 6.8], ["Motion check", 7.3]].map(([l, at], i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 20, fontSize: 24, opacity: 0.92 }}>
              {t >= (at as number) ? <Check on size={30} /> : <Spin size={30} />}<span>{l}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
    <div style={{ position: "absolute", left: 0, top: 480, width: 860, height: 44, background: "linear-gradient(#d9d7d2,#b9b6b0)", borderRadius: "6px 6px 30px 30px", border: `4px solid ${INK}` }} />
  </div>
);

const MacScene: React.FC = () => {
  const t = useT();
  const fly = (i: number) => {
    const p = ease(t, T.fly + i * 0.12, 0.5);
    const dx = [-300, 0, 300][i];
    return { left: 440 + dx * p, top: 900 - 330 * p - (i === 1 ? 60 * p : 0), rot: [-14, 4, 12][i] * p, o: p };
  };
  return (
    <>
      <div style={{ position: "absolute", left: 110, top: 760 }}><Laptop t={t} /></div>
      {[0, 1, 2].map((i) => {
        const f = fly(i);
        if (f.o <= 0) return null;
        return (
          <div key={i} style={{ position: "absolute", left: f.left, top: f.top, width: 200, height: 300, borderRadius: 20, background: POSTS[i].cover, border: `4px solid ${INK}`, transform: `rotate(${f.rot}deg)`, opacity: f.o, padding: 16, fontFamily: SANS, fontWeight: 800, fontSize: 22, color: "#fff", textShadow: "0 2px 8px rgba(0,0,0,0.4)" }}>{POSTS[i].t}</div>
        );
      })}
      <Pop at={T.claude} style={{ left: 450, top: 520 }}>
        <div style={{ width: 180, height: 180, borderRadius: "50%", background: "#fff", border: `6px solid ${RED}`, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 6, boxShadow: "8px 10px 0 rgba(20,20,20,0.12)" }}>
          <ClaudeMark size={74} /><span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 24 }}>Claude</span>
        </div>
      </Pop>
      <Pop at={T.mac} rot={-6} style={{ left: 120, top: 1190 }}><Tag red size={84}>ON A MAC</Tag></Pop>
    </>
  );
};

const VaultScene: React.FC = () => {
  const t = useT();
  const stamp = popE(t, T.notClaude, 0.3);
  return (
    <>
      <div style={{ position: "absolute", left: 220, top: 560, width: 640, height: 600, borderRadius: 40, background: "#dcd9d2", border: `6px solid ${INK}`, boxShadow: "12px 14px 0 rgba(20,20,20,0.14)" }}>
        <div style={{ position: "absolute", left: 120, top: 110, width: 400, height: 400, borderRadius: "50%", background: "#c9c6bf", border: `6px solid ${INK}` }}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} style={{ position: "absolute", left: 194, top: 6, width: 0, height: 0, borderLeft: "6px solid transparent", transformOrigin: "0 194px", transform: `rotate(${i * 30}deg)` }}><div style={{ width: 6, height: 30, background: INK, marginLeft: -3 }} /></div>
          ))}
          <div style={{ position: "absolute", left: 80, top: 80, width: 228, height: 228, borderRadius: "50%", background: "#fff", border: `6px solid ${INK}`, display: "flex", alignItems: "center", justifyContent: "center" }}><ClaudeMark size={120} /></div>
        </div>
        <div style={{ position: "absolute", left: 170, top: -40 }}><div style={{ background: "#fff", border: `5px solid ${INK}`, borderRadius: 10, padding: "4px 22px", fontFamily: COND, fontSize: 62, color: INK }}>THE SECRET</div></div>
        <div style={{ position: "absolute", right: 30, top: 30, width: 34, height: 44, borderRadius: "16px 16px 6px 6px", background: RED, border: `4px solid ${INK}` }} />
      </div>
      {stamp > 0 ? (
        <div style={{ position: "absolute", left: 360, top: 760, transform: `rotate(-14deg) scale(${1.6 - 0.6 * stamp})`, opacity: Math.min(1, stamp * 2), border: `8px solid ${RED}`, borderRadius: 18, padding: "4px 26px", fontFamily: COND, fontSize: 130, color: RED, background: "rgba(255,255,255,0.75)" }}>NOT IT</div>
      ) : null}
      <Pop at={T.notClaude + 0.15} style={{ left: 0, right: 0, top: 1230, textAlign: "center" }}>
        <span style={{ fontFamily: COND, fontSize: 110, color: INK }}>ISN'T <span style={{ position: "relative" }}>CLAUDE<span style={{ position: "absolute", left: -6, right: -6, top: "52%", height: 14, background: RED, transform: `scaleX(${ease(t, T.notClaude + 0.3, 0.25)})`, transformOrigin: "left" }} /></span></span>
      </Pop>
    </>
  );
};

const ConnectorScene: React.FC = () => {
  const t = useT();
  return (
    <>
      <Pop at={T.one} rot={-2} style={{ left: 190, top: 560 }}>
        <div style={{ width: 700, height: 420, borderRadius: 34, background: "#7fb1ef", border: `6px solid ${INK}`, position: "relative", boxShadow: "12px 14px 0 rgba(20,20,20,0.18)" }}>
          <div style={{ position: "absolute", left: 50, top: 60, width: 600, height: 300, background: "#fff", border: `6px solid ${INK}`, borderRadius: 22, transform: "rotate(-3deg)", display: "flex", alignItems: "center", gap: 26, padding: "0 40px" }}>
            <div style={{ position: "relative", width: 120, height: 160 }}>
              <div style={{ position: "absolute", left: 22, top: 0, width: 18, height: 50, background: INK, borderRadius: 6 }} />
              <div style={{ position: "absolute", left: 80, top: 0, width: 18, height: 50, background: INK, borderRadius: 6 }} />
              <div style={{ position: "absolute", left: 0, top: 44, width: 120, height: 80, background: RED, border: `5px solid ${INK}`, borderRadius: "12px 12px 30px 30px" }} />
              <div style={{ position: "absolute", left: 52, top: 122, width: 16, height: 40, background: INK }} />
            </div>
            <div>
              <div style={{ fontFamily: COND, fontSize: 150, lineHeight: 0.95, color: RED }}>ONE</div>
              <div style={{ fontFamily: COND, fontSize: 70, lineHeight: 1, color: INK, letterSpacing: 2 }}>CONNECTOR</div>
            </div>
          </div>
        </div>
      </Pop>
      <div style={{ position: "absolute", left: 0, right: 0, top: 1090, display: "flex", justifyContent: "center", gap: 18 }}>
        {"SOCIA".split("").map((c, i) => {
          const at = T.letters[i];
          const p = popE(t, at, 0.3);
          return (
            <div key={c} style={{ width: 150, height: 160, borderRadius: 22, background: RED, border: `5px solid ${INK}`, boxShadow: "0 10px 0 #9e2a19", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: COND, fontSize: 110, color: "#fff", opacity: t >= at ? 1 : 0, transform: `translateY(${(1 - p) * -60}px) scale(${0.6 + 0.4 * p})` }}>{c}</div>
          );
        })}
      </div>
      <Pop at={T.letters[4] + 0.25} style={{ left: 450, top: 1300 }}><div style={{ display: "flex", alignItems: "center", gap: 12 }}><Mark size={60} /><span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 34, color: INK }}>SOCIA</span></div></Pop>
    </>
  );
};

const PostCard: React.FC<{ p: (typeof POSTS)[number]; w: number; h: number; dim?: number; ring?: boolean }> = ({ p, w, h, dim = 1, ring }) => (
  <div style={{ width: w, height: h, borderRadius: 20, background: p.cover, border: `4px solid ${ring ? RED : INK}`, boxShadow: ring ? `0 0 0 8px rgba(229,67,45,0.25)` : "6px 8px 0 rgba(20,20,20,0.1)", opacity: dim, padding: 16, display: "flex", flexDirection: "column", justifyContent: "space-between", fontFamily: SANS, color: "#fff" }}>
    <div style={{ fontWeight: 800, fontSize: 23, lineHeight: 1.15, textShadow: "0 2px 8px rgba(0,0,0,0.45)" }}>{p.t}</div>
    <div style={{ fontWeight: 700, fontSize: 20, background: "rgba(0,0,0,0.45)", borderRadius: 10, padding: "4px 10px", alignSelf: "flex-start" }}>{p.i} interactions</div>
  </div>
);

const ReadsScene: React.FC = () => {
  const t = useT();
  const pos = [[120, 570], [410, 570], [700, 570], [120, 900], [410, 900]];
  const scan = ease(t, T.reads, 1.2);
  const best = t >= T.best;
  return (
    <>
      {POSTS.map((p, i) => (
        <Pop key={i} at={12.04 + i * 0.06} style={{ left: pos[i][0], top: pos[i][1] }}>
          <PostCard p={p} w={260} h={300} dim={best && i > 0 ? 0.35 : 1} ring={best && i === 0} />
        </Pop>
      ))}
      {scan > 0 && scan < 1 ? <div style={{ position: "absolute", left: 100, right: 100, top: 560 + 660 * scan, height: 8, background: RED, borderRadius: 8, boxShadow: `0 0 30px ${RED}` }} /> : null}
      <Pop at={T.rules} rot={6} style={{ left: 720, top: 905 }}>
        <div style={{ width: 230, height: 290, borderRadius: "10px 22px 22px 10px", background: INK, borderLeft: `18px solid #3a3a3a`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", boxShadow: "10px 12px 0 rgba(20,20,20,0.15)" }}>
          <div style={{ fontFamily: COND, fontSize: 34, color: "#fff", opacity: 0.8 }}>THE</div>
          <div style={{ fontFamily: COND, fontSize: 84, color: "#fff", border: "4px solid #fff", padding: "0 12px", lineHeight: 1.1 }}>RULES</div>
        </div>
      </Pop>
      <Pop at={T.best + 0.1} rot={-6} style={{ left: 250, top: 520 }}>
        <div style={{ background: RED, color: "#fff", fontFamily: SANS, fontWeight: 800, fontSize: 32, borderRadius: 30, padding: "10px 22px", border: `4px solid ${INK}` }}>{TOP.vsMedian} our median</div>
      </Pop>
      <Source top={1250} text={`${SOURCE} · median ${TOP.median} interactions`} />
    </>
  );
};

const Tiles: React.FC<{ n: number; total: number; top: number }> = ({ n, total, top }) => (
  <div style={{ position: "absolute", left: 0, right: 0, top, display: "flex", justifyContent: "center", gap: 30 }}>
    {Array.from({ length: total }).map((_, i) => (
      <div key={i} style={{ width: 170, height: 140, borderRadius: 16, border: `4px dashed ${i + 1 === n ? RED : "#c9c5bc"}`, background: i + 1 === n ? "rgba(229,67,45,0.06)" : "rgba(0,0,0,0.02)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: COND, fontSize: 96, color: i + 1 === n ? RED : "#d3cfc6" }}>{i + 1}</div>
    ))}
  </div>
);

const RuleCard: React.FC<{ n: number; title: React.ReactNode; children: React.ReactNode }> = ({ n, title, children }) => (
  <Sticker style={{ position: "absolute", left: 100, top: 580, width: 880, height: 560, padding: "30px 36px", borderRadius: 30 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 20, borderBottom: `3px solid ${LINE}`, paddingBottom: 20 }}>
      <div style={{ width: 84, height: 84, borderRadius: 14, background: RED, color: "#fff", fontFamily: COND, fontSize: 68, display: "flex", alignItems: "center", justifyContent: "center" }}>{n}</div>
      <div style={{ fontFamily: COND, fontSize: 66, color: INK, lineHeight: 1 }}>{title}</div>
    </div>
    {children}
  </Sticker>
);

const Rule1: React.FC = () => {
  const t = useT();
  const parts: [string, number | null, string][] = [["Connect ", null, ""], ["Claude", T.tool, "tool"], [" to ", null, ""], ["your Instagram", T.outcome, "outcome"], [" ", null, ""], ["in 60 seconds", T.time, "time limit"]];
  return (
    <>
      <Pop at={15.4} style={{ left: 0, top: 0, width: 1080, height: 1920 }}>
        <RuleCard n={1} title={<>TOOL + OUTCOME + <span style={{ color: RED }}>TIME</span></>}>
          <div style={{ marginTop: 28, fontFamily: MONO, fontSize: 21, color: GREY }}>our top reel's hook</div>
          <div style={{ marginTop: 14, fontFamily: SANS, fontWeight: 800, fontSize: 58, lineHeight: 1.25, color: INK, letterSpacing: -1 }}>
            “{parts.map(([s, at], i) => {
              if (at == null) return <span key={i}>{s}</span>;
              const p = ease(t, at, 0.3);
              return <span key={i} style={{ backgroundImage: `linear-gradient(rgba(229,67,45,0.22), rgba(229,67,45,0.22))`, backgroundSize: `${p * 100}% 40%`, backgroundPosition: "0 85%", backgroundRepeat: "no-repeat", color: p > 0.5 ? RED : INK }}>{s}</span>;
            })}”
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 30 }}>
            {parts.filter((x) => x[1] != null).map(([, at, label], i) => {
              const p = popE(t, at as number);
              return <span key={i} style={{ opacity: p > 0 ? 1 : 0.25, transform: `scale(${0.85 + 0.15 * Math.min(1, p)})`, fontFamily: SANS, fontWeight: 700, fontSize: 28, color: p > 0 ? "#fff" : GREY, background: p > 0 ? INK : "transparent", border: `3px solid ${p > 0 ? INK : LINE}`, borderRadius: 24, padding: "6px 20px" }}>{p > 0 ? "✓ " : ""}{label}</span>;
            })}
          </div>
          <div style={{ position: "absolute", left: 36, bottom: 24, fontFamily: MONO, fontSize: 19, color: GREY }}>SOCIA Content Plan · top fix · @socia.appmedia</div>
        </RuleCard>
      </Pop>
      <Tiles n={1} total={2} top={1200} />
    </>
  );
};

const Rule2: React.FC = () => {
  const t = useT();
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return (
    <>
      <RuleCard n={2} title={<>ONE REEL A <span style={{ color: RED }}>DAY</span></>}>
        <div style={{ display: "flex", gap: 14, marginTop: 70 }}>
          {days.map((d, i) => {
            const p = popE(t, 18.12 + i * 0.07, 0.3);
            return (
              <div key={d} style={{ flex: 1, textAlign: "center", fontFamily: SANS }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: GREY }}>{d}</div>
                <div style={{ marginTop: 12, height: 200, borderRadius: 16, border: `3px solid ${LINE}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ width: 62, height: 100, borderRadius: 12, background: RED, transform: `scale(${p})`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 30 }}>▶</div>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ position: "absolute", left: 36, bottom: 24, fontFamily: MONO, fontSize: 19, color: GREY }}>SOCIA Content Plan · @socia.appmedia</div>
      </RuleCard>
      <Tiles n={2} total={2} top={1200} />
    </>
  );
};

const BuildScene: React.FC = () => {
  const t = useT();
  const rows: [string, string, number][] = [["Script", "script.md", T.script], ["Voice", "voice.mp3", T.voice], ["Scenes", "all scenes", T.scenes]];
  const state = (at: number, i: number) => (t >= at + 0.7 ? "done" : t >= (i === 0 ? 19.0 : rows[i - 1][2] + 0.4) ? "work" : "wait");
  return (
    <>
      <div style={{ position: "absolute", left: 150, top: 560, width: 400, height: 780, borderRadius: 60, background: INK, padding: 16, boxShadow: "12px 14px 0 rgba(20,20,20,0.14)" }}>
        <div style={{ width: "100%", height: "100%", borderRadius: 46, background: "#fbfaf7", position: "relative", overflow: "hidden", fontFamily: SANS }}>
          <div style={{ position: "absolute", left: 140, top: 14, width: 88, height: 26, borderRadius: 20, background: INK }} />
          <div style={{ position: "absolute", left: 30, right: 30, top: 80, fontWeight: 800, fontSize: 30, lineHeight: 1.2, color: INK }}>{typed(t, "1,958 views on one reel,", T.script - 0.3, T.script + 0.8)}</div>
          <div style={{ position: "absolute", left: 30, right: 30, top: 160, fontFamily: SERIF, fontSize: 36, color: RED }}>{typed(t, "never filmed.", T.script + 0.6, T.script + 1.2)}</div>
          {t >= T.scenes ? (
            <div style={{ position: "absolute", left: 30, right: 30, top: 240, height: 330, borderRadius: 20, border: `3px solid ${INK}`, background: PAPER, overflow: "hidden", opacity: ease(t, T.scenes, 0.3) }}>
              {[0, 1, 2, 3].map((i) => {
                const p = popE(t, T.scenes + 0.1 + i * 0.18);
                return <div key={i} style={{ position: "absolute", left: 20 + (i % 2) * 150, top: 20 + Math.floor(i / 2) * 150, width: 130, height: 130, borderRadius: 16, background: [RED, INK, "#7fb1ef", "#f2c14e"][i], transform: `scale(${p}) rotate(${(1 - p) * 30}deg)`, border: `3px solid ${INK}` }} />;
              })}
            </div>
          ) : null}
          {t >= T.voice ? <div style={{ position: "absolute", left: 30, right: 30, bottom: 50, opacity: ease(t, T.voice, 0.3) }}><Wave n={26} h={70} color={RED} grow={ease(t, T.voice, 0.6)} /></div> : null}
        </div>
      </div>
      <div style={{ position: "absolute", left: 590, top: 660, width: 360, borderRadius: 26, background: "#1c1d20", padding: "22px 24px", fontFamily: SANS, color: "#fff", boxShadow: "10px 12px 0 rgba(20,20,20,0.16)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 22, fontWeight: 700 }}><ClaudeMark size={26} />Building reel</div>
        {rows.map(([l, f, at], i) => {
          const s = state(at, i);
          return (
            <div key={l} style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 26, opacity: s === "wait" ? 0.4 : 1, borderLeft: s === "work" ? `4px solid ${RED}` : "4px solid transparent", paddingLeft: 10 }}>
              {s === "done" ? <Check on size={36} /> : s === "work" ? <Spin size={36} /> : <Check on={false} size={36} />}
              <div><div style={{ fontSize: 34, fontWeight: 700 }}>{l}</div><div style={{ fontFamily: MONO, fontSize: 18, opacity: 0.55 }}>{f}</div></div>
            </div>
          );
        })}
      </div>
    </>
  );
};

const HandoffScene: React.FC = () => {
  const t = useT();
  const arrow = ease(t, 23.0, 0.4);
  const ring = t >= T.socia ? (t - T.socia) % 0.9 : -1;
  return (
    <>
      <Pop at={22.9} style={{ left: 110, top: 700 }}>
        <Sticker style={{ width: 300, height: 340, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18 }}>
          <ClaudeMark size={120} /><span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 38 }}>Claude</span>
        </Sticker>
        <div style={{ marginTop: 26, textAlign: "center" }}><Tag size={52}>BUILT IT</Tag></div>
      </Pop>
      <div style={{ position: "absolute", left: 440, top: 860, width: 200 * arrow, height: 0, borderTop: `8px dashed ${INK}` }} />
      {arrow > 0.9 ? <div style={{ position: "absolute", left: 630, top: 842, width: 0, height: 0, borderTop: "22px solid transparent", borderBottom: "22px solid transparent", borderLeft: `30px solid ${INK}` }} /> : null}
      <Pop at={T.socia} style={{ left: 670, top: 700 }}>
        <div style={{ position: "relative" }}>
          {ring >= 0 ? <div style={{ position: "absolute", left: 150 - (150 + ring * 140), top: 170 - (170 + ring * 140), width: 300 + ring * 280, height: 340 + ring * 280, borderRadius: 40, border: `5px solid ${RED}`, opacity: 1 - ring / 0.9 }} /> : null}
          <Sticker style={{ width: 300, height: 340, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, borderColor: RED }}>
            <Mark size={130} /><span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 38 }}>SOCIA</span>
          </Sticker>
          <div style={{ marginTop: 26, textAlign: "center" }}><Tag red size={52}>TAKES OVER</Tag></div>
        </div>
      </Pop>
    </>
  );
};

const AppCard: React.FC<{ title: string; children: React.ReactNode; top?: number; height?: number }> = ({ title, children, top = 580, height = 640 }) => (
  <Sticker style={{ position: "absolute", left: 100, top, width: 880, height, padding: "28px 34px", borderRadius: 30 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <Mark size={50} /><span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 38, color: INK }}>{title}</span>
      <Example style={{ marginLeft: "auto" }} />
    </div>
    {children}
  </Sticker>
);

const MusicScene: React.FC = () => {
  const t = useT();
  const added = t >= T.scores;
  return (
    <>
      <Pop at={24.5} style={{ left: 0, top: 0, width: 1080 }}>
        <AppCard title="AI music generator">
          <div style={{ marginTop: 30, borderRadius: 18, border: `3px solid ${LINE}`, padding: "18px 22px", fontFamily: SANS, fontSize: 32, fontWeight: 600, color: INK, height: 80 }}>
            {typed(t, "warm lo-fi, 92 bpm, fits a fast voice", 24.6, 25.3)}
          </div>
          <div style={{ marginTop: 34, height: 170, borderRadius: 18, background: INK, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Wave n={44} h={120} color={RED} grow={ease(t, T.music, 1.0)} seed={1.3} w={9} />
          </div>
          <div style={{ marginTop: 34, display: "flex", alignItems: "center", gap: 18, fontFamily: SANS, fontSize: 32, fontWeight: 700, color: added ? GREEN : GREY, opacity: added ? 1 : 0.5 }}>
            <Check on={added} size={46} /> {added ? "Track added to the reel" : "Making a track..."}
          </div>
        </AppCard>
      </Pop>
      <Pop at={T.music} rot={12} style={{ left: 820, top: 480 }}>
        <div style={{ width: 140, height: 140, borderRadius: "50%", background: RED, border: `5px solid ${INK}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 80, color: "#fff" }}>♪</div>
      </Pop>
    </>
  );
};

const EditorScene: React.FC = () => {
  const t = useT();
  const head = interpolate(t, [26.6, 28.33], [0, 1], clamp);
  const fixed = t >= T.polish;
  const tracks: [string, string, number][] = [["Video", "#7fb1ef", 1], ["Voice", RED, fixed ? 1 : 0.55], ["Music", "#f2c14e", fixed ? 0.45 : 0.9]];
  return (
    <Pop at={26.62} style={{ left: 0, top: 0, width: 1080 }}>
      <AppCard title="Video editor" height={650}>
        <div style={{ position: "relative", marginTop: 30 }}>
          {tracks.map(([l, c, lvl], i) => (
            <div key={l} style={{ display: "flex", alignItems: "center", gap: 18, marginTop: i ? 18 : 0 }}>
              <span style={{ width: 100, fontFamily: SANS, fontWeight: 700, fontSize: 26, color: INK }}>{l}</span>
              <div style={{ flex: 1, height: 74, borderRadius: 14, background: "#f4f2ed", border: `3px solid ${LINE}`, display: "flex", alignItems: "center", gap: i === 0 ? 8 : 0, padding: "0 8px", overflow: "hidden" }}>
                {i === 0 ? Array.from({ length: 5 }).map((_, k) => <div key={k} style={{ flex: [1.2, 0.8, 1.4, 1, 0.9][k], height: 54, borderRadius: 8, background: c, opacity: 0.85 }} />) : <div style={{ transform: `scaleY(${lvl})`, transition: "none" }}><Wave n={52} h={60} color={c} seed={i + 0.7} w={7} gap={4} /></div>}
              </div>
            </div>
          ))}
          <div style={{ position: "absolute", left: 118 + 660 * head, top: -10, width: 4, height: 290, background: INK }} />
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 34, flexWrap: "wrap" }}>
          {["Voice up", "Music down", "Pauses cut", "Colour"].map((c, i) => {
            const p = popE(t, T.polish + i * 0.12);
            return <span key={c} style={{ transform: `scale(${p})`, fontFamily: SANS, fontWeight: 700, fontSize: 28, color: "#fff", background: GREEN, borderRadius: 24, padding: "8px 20px" }}>✓ {c}</span>;
          })}
        </div>
      </AppCard>
    </Pop>
  );
};

const JobsScene: React.FC = () => {
  const t = useT();
  const views = Math.round(TOP.views * interpolate(t, [T.tracks, T.tracks + 1.0], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) }));
  const pressed = t >= T.approve + 0.25;
  const rows: { at: number; label: string; right: React.ReactNode }[] = [
    { at: T.rates, label: "Rates the reel", right: <span style={{ fontFamily: MONO, fontSize: 22, color: GREY }}>hook · pacing · clarity · CTA</span> },
    { at: T.plans, label: "Plans the week", right: <div style={{ display: "flex", gap: 8 }}>{Array.from({ length: 7 }).map((_, i) => <div key={i} style={{ width: 26, height: 40, borderRadius: 6, background: t >= T.plans + 0.1 + i * 0.06 ? RED : LINE }} />)}</div> },
    { at: T.approve - 0.7, label: "Posts when you approve", right: <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 28, color: "#fff", background: pressed ? GREEN : INK, borderRadius: 14, padding: "10px 22px", transform: `scale(${t >= T.approve && t < T.approve + 0.2 ? 0.92 : 1})`, display: "inline-block" }}>{pressed ? "✓ Approved" : "Approve"}</span> },
    { at: T.tracks, label: "Tracks every view", right: <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 40, color: RED }}>{views.toLocaleString("en-US")} <span style={{ fontSize: 24, color: GREY, fontWeight: 600 }}>views</span></span> },
  ];
  return (
    <>
      <Sticker style={{ position: "absolute", left: 100, top: 570, width: 880, padding: "18px 34px", borderRadius: 30 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "8px 0 14px", borderBottom: `3px solid ${LINE}` }}><Mark size={46} /><span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 34 }}>What SOCIA does next</span></div>
        {rows.map((r, i) => {
          const p = ease(t, r.at, 0.3);
          return (
            <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 18, height: 132, borderBottom: i < 3 ? `2px solid ${LINE}` : "none", opacity: 0.25 + 0.75 * p, transform: `translateX(${(1 - p) * 30}px)` }}>
              <Check on={p > 0.5} size={46} />
              <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 36, color: INK, flex: 1 }}>{r.label}</span>
              <div style={{ opacity: p }}>{r.right}</div>
            </div>
          );
        })}
      </Sticker>
      {t >= T.tracks ? <Source top={1290} text={`Real views: our top reel · ${SOURCE}`} /> : null}
    </>
  );
};

const NoToolsScene: React.FC = () => (
  <>
    <div style={{ position: "absolute", left: 160, top: 560, width: 760, height: 700, borderRadius: 14, background: "#f8f6f1", border: `4px solid ${LINE}`, backgroundImage: "radial-gradient(#cfcac0 3px, transparent 3.5px)", backgroundSize: "36px 36px", boxShadow: "0 20px 40px rgba(0,0,0,0.08)" }} />
    <div style={{ position: "absolute", left: 120, top: 1262, width: 840, height: 44, background: "#c99b62", borderRadius: 8, border: `3px solid #8a6436` }} />
    <div style={{ position: "absolute", left: 180, top: 1306, width: 24, height: 90, background: "#b58650" }} />
    <div style={{ position: "absolute", left: 876, top: 1306, width: 24, height: 90, background: "#b58650" }} />
    <div style={{ position: "absolute", left: 200, top: 600 }}><Camera s={0.7} /></div>
    <div style={{ position: "absolute", left: 230, top: 900 }}><Tag size={60}>FILM</Tag></div>
    <RedX at={T.film} size={330} style={{ left: 190, top: 590 }} />
    <div style={{ position: "absolute", left: 560, top: 620, width: 310, height: 210, borderRadius: 20, background: INK, padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontFamily: MONO, fontSize: 30, color: "#fff" }}>00:41:72</div>
      <div style={{ display: "flex", gap: 8 }}>{[1.2, 0.8, 1.4].map((f, k) => <div key={k} style={{ flex: f, height: 34, borderRadius: 6, background: "#7fb1ef" }} />)}</div>
      <div style={{ height: 34, borderRadius: 6, background: "#2c7a4b" }} />
    </div>
    <div style={{ position: "absolute", left: 640, top: 860 }}><Tag size={60}>EDIT</Tag></div>
    <RedX at={T.edit} size={330} style={{ left: 550, top: 570 }} />
    <div style={{ position: "absolute", left: 360, top: 990, width: 170, height: 170, borderRadius: 30, background: "#fff", border: `6px solid ${INK}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: COND, fontSize: 130, color: INK, transform: "rotate(-8deg)" }}>?</div>
    <div style={{ position: "absolute", left: 570, top: 1040 }}><Tag size={60}>GUESS</Tag></div>
    <RedX at={T.guess} size={360} style={{ left: 330, top: 900 }} />
  </>
);

const Letters: React.FC<{ word: string; from: number; step: number; size?: number }> = ({ word, from, step, size = 110 }) => {
  const t = useT();
  return (
    <div style={{ display: "flex", gap: 12 }}>
      {word.split("").map((c, i) => {
        const at = from + i * step;
        const p = popE(t, at, 0.3);
        return <div key={i} style={{ width: size, height: size * 1.1, borderRadius: 16, background: RED, border: `4px solid ${INK}`, boxShadow: "0 8px 0 #9e2a19", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: COND, fontSize: size * 0.72, color: "#fff", opacity: t >= at ? 1 : 0, transform: `translateY(${(1 - p) * -40}px) scale(${0.6 + 0.4 * p})` }}>{c}</div>;
      })}
    </div>
  );
};

const AccessScene: React.FC = () => {
  const t = useT();
  const unlocked = t >= T.access + 0.2;
  return (
    <>
      <Pop at={35.6} rot={-3} style={{ left: 170, top: 560 }}>
        <div style={{ width: 740, height: 300, borderRadius: 30, background: INK, color: "#fff", padding: "34px 40px", display: "flex", alignItems: "center", gap: 34, boxShadow: "12px 14px 0 rgba(20,20,20,0.16)" }}>
          <div style={{ position: "relative", width: 120, height: 150 }}>
            <div style={{ position: "absolute", left: 20, top: unlocked ? -26 : 0, width: 80, height: 80, borderRadius: "40px 40px 0 0", border: "14px solid #fff", borderBottom: "none" }} />
            <div style={{ position: "absolute", left: 0, top: 62, width: 120, height: 90, borderRadius: 16, background: unlocked ? GREEN : RED }} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}><Mark size={50} /><span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 40 }}>SOCIA</span></div>
            <div style={{ fontFamily: COND, fontSize: 92, lineHeight: 1.05, marginTop: 8 }}>{unlocked ? "ACCESS ✓" : "ACCESS"}</div>
          </div>
        </div>
      </Pop>
      {t >= T.comment ? (
        <Pop at={T.comment} style={{ left: 90, top: 940 }}>
          <div style={{ width: 900, height: 190, borderRadius: 100, background: RED, border: `6px solid ${INK}`, display: "flex", alignItems: "center", gap: 22, padding: "0 30px", boxShadow: "10px 12px 0 rgba(20,20,20,0.16)" }}>
            <div style={{ width: 110, height: 110, borderRadius: "50%", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 58 }}>💬</div>
            <Letters word="SOCIA" from={T.commentSocia - 0.1} step={0.07} size={110} />
          </div>
        </Pop>
      ) : null}
      {t >= T.commentSocia + 0.2 ? (
        <Pop at={T.commentSocia + 0.2} style={{ left: 170, top: 1180 }}>
          <div style={{ width: 740, borderRadius: 26, background: "#111214", padding: "20px 26px", fontFamily: SANS, color: "#fff", display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ width: 60, height: 60, borderRadius: "50%", background: "#3a3d43" }} />
            <div style={{ flex: 1 }}><div style={{ fontSize: 22, opacity: 0.6 }}>you · just now</div><div style={{ fontSize: 34, fontWeight: 800 }}>SOCIA</div></div>
            <span style={{ fontSize: 34, color: RED }}>♥</span>
          </div>
        </Pop>
      ) : null}
    </>
  );
};

const PromoScene: React.FC = () => {
  const t = useT();
  const postP = t >= T.linkWord + 0.45;
  return (
    <>
      <Pop at={37.88} rot={-2} style={{ left: 120, top: 560 }}>
        <div style={{ position: "relative", width: 840, height: 400, borderRadius: 28, background: "#fff", border: `6px solid ${INK}`, boxShadow: "12px 14px 0 rgba(20,20,20,0.16)", display: "flex" }}>
          <div style={{ width: 230, borderRight: `5px dashed ${INK}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
            <Mark size={110} /><span style={{ fontFamily: COND, fontSize: 42, color: INK }}>PROMO</span>
          </div>
          <div style={{ flex: 1, padding: "40px 40px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ fontFamily: MONO, fontSize: 26, color: GREY }}>promo code</div>
            <div style={{ marginTop: 14, border: `5px dashed ${RED}`, borderRadius: 18, padding: "6px 22px", alignSelf: "flex-start", fontFamily: COND, fontSize: 140, lineHeight: 1.05, color: RED, opacity: t >= T.code ? 1 : 0.12, transform: `scale(${t >= T.code ? 0.85 + 0.15 * popE(t, T.code) : 1})`, transformOrigin: "left center" }}>{PROMO}</div>
          </div>
          <div style={{ position: "absolute", left: 206, top: -26, width: 52, height: 52, borderRadius: "50%", background: PAPER, borderBottom: `6px solid ${INK}` }} />
          <div style={{ position: "absolute", left: 206, bottom: -26, width: 52, height: 52, borderRadius: "50%", background: PAPER, borderTop: `6px solid ${INK}` }} />
        </div>
      </Pop>
      {t >= T.link ? (
        <Pop at={T.link} style={{ left: 120, top: 1020 }}>
          <div style={{ width: 840, height: 120, borderRadius: 60, background: "#fff", border: `4px solid ${INK}`, display: "flex", alignItems: "center", padding: "0 18px 0 40px", fontFamily: SANS }}>
            <span style={{ fontSize: 46, fontWeight: 800, color: INK, flex: 1 }}>{typed(t, "LINK", T.linkWord - 0.1, T.linkWord + 0.25)}<span style={{ opacity: Math.floor(t * 3) % 2 ? 0 : 0.6, fontWeight: 400 }}>|</span></span>
            <span style={{ fontSize: 34, fontWeight: 800, color: "#fff", background: postP ? GREEN : "#2a62f5", borderRadius: 40, padding: "14px 30px" }}>{postP ? "✓ Posted" : "Post"}</span>
          </div>
        </Pop>
      ) : null}
      {t >= T.send ? (
        <Pop at={T.send} style={{ left: 300, top: 1180 }}>
          <div style={{ width: 660, borderRadius: "30px 30px 8px 30px", background: "#2a62f5", color: "#fff", padding: "20px 28px", fontFamily: SANS, fontSize: 32, fontWeight: 700 }}>Here's your link with {PROMO} 🔗</div>
          <div style={{ textAlign: "right", fontFamily: MONO, fontSize: 20, color: GREY, marginTop: 8 }}>Delivered · SOCIA, coming soon</div>
        </Pop>
      ) : null}
    </>
  );
};

const SCENE_C: Record<SceneId, React.FC> = {
  proof: Proof, camera: CameraScene, mac: MacScene, vault: VaultScene, connector: ConnectorScene, reads: ReadsScene,
  rule1: Rule1, rule2: Rule2, build: BuildScene, handoff: HandoffScene, music: MusicScene, editor: EditorScene,
  jobs: JobsScene, notools: NoToolsScene, access: AccessScene, promo: PromoScene,
};

/* ───────────── sound, root ───────────── */

type Cue = { src: string; at: number; volume: number };
const CUES: Cue[] = [
  ...SCENES.slice(1).map((s) => ({ src: sfxWhoosh, at: s.from - 0.04, volume: 0.12 })),
  { src: sfxPop, at: T.oneReel, volume: 0.35 },
  { src: sfxPop, at: T.filmed, volume: 0.3 },
  { src: sfxImpact, at: T.frame, volume: 0.4 },
  { src: sfxPop, at: T.claude, volume: 0.3 },
  { src: sfxPop, at: T.mac, volume: 0.35 },
  { src: sfxImpact, at: T.notClaude, volume: 0.4 },
  { src: sfxPop, at: T.one, volume: 0.35 },
  ...T.letters.map((at) => ({ src: sfxClick, at, volume: 0.45 })),
  { src: sfxPop, at: T.rules, volume: 0.3 },
  { src: sfxPop, at: T.best + 0.1, volume: 0.3 },
  ...[T.tool, T.outcome, T.time].map((at) => ({ src: sfxClick, at, volume: 0.35 })),
  ...[T.script, T.voice, T.scenes].map((at) => ({ src: sfxClick, at: at + 0.7, volume: 0.3 })),
  { src: sfxPop, at: T.socia, volume: 0.4 },
  { src: sfxPop, at: T.scores, volume: 0.3 },
  { src: sfxPop, at: T.polish, volume: 0.3 },
  { src: sfxClick, at: T.approve, volume: 0.45 },
  ...[T.film, T.edit, T.guess].map((at) => ({ src: sfxImpact, at, volume: 0.3 })),
  { src: sfxClick, at: T.access + 0.2, volume: 0.4 },
  { src: sfxPop, at: T.comment, volume: 0.35 },
  { src: sfxPop, at: T.code, volume: 0.4 },
  { src: sfxClick, at: T.linkWord + 0.45, volume: 0.45 },
  { src: sfxPop, at: T.send, volume: 0.35 },
];

export const Reel: React.FC = () => {
  const t = useT();
  const s = SCENES[sceneAt(t)];
  const C = SCENE_C[s.id];
  return (
    <AbsoluteFill style={{ fontFamily: SANS }}>
      <Audio src={vo} />
      {CUES.map((c, i) => (
        <Sequence key={i} from={Math.max(0, Math.round(c.at * FPS))} name={`sfx ${i}`}>
          <Audio src={c.src} volume={c.volume} />
        </Sequence>
      ))}
      <Ground id={s.id} />
      <C />
      <Header />
      <Caption />
    </AbsoluteFill>
  );
};
