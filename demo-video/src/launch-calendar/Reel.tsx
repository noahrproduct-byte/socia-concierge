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
import { DAYS, FEATURES, FPS, GROUPS, PROMO, STATS, T } from "./story";

const inter = loadFont("normal", { weights: ["500", "600", "700", "800"], subsets: ["latin"] });
const mono = loadMono("normal", { weights: ["500", "600"], subsets: ["latin"] });
const SANS = `${inter.fontFamily}, sans-serif`;
const MONO = `${mono.fontFamily}, Menlo, monospace`;

const PAPER = "#f6f4ef";
const CARD = "#ffffff";
const INK = "#17191d";
const INK2 = "#5f646c";
const LINE = "#e4e1da";
const GOLD = "#8a6a2c";
const GOLD_BRIGHT = "#d9b25c";
const GREEN = "#1f8a4c";
const BLUE = "#2a62f5";

const useT = () => useCurrentFrame() / FPS;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = (t: number, at: number, dur = 0.3) => interpolate(t, [at, at + dur], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
const popE = (t: number, at: number, dur = 0.35) => interpolate(t, [at, at + dur], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.7)) });
const typed = (t: number, s: string, a: number, b: number) => s.slice(0, Math.round(interpolate(t, [a, b], [0, s.length], clamp)));
const Mark: React.FC<{ size: number }> = ({ size }) => <Img src={mark} style={{ width: size, height: size, borderRadius: size * 0.24, display: "block" }} />;

/* caption */
const Caption: React.FC = () => {
  const t = useT();
  const gi = GROUPS.reduce((v, gr, i) => (t >= gr[0][1] - 0.03 ? i : v), 0);
  const gr = GROUPS[gi];
  const next = GROUPS[gi + 1];
  const out = next ? ease(t, next[0][1] - 0.16, 0.13) : 0;
  return (
    <div style={{ position: "absolute", left: 90, right: 90, top: 210, textAlign: "center", fontFamily: SANS, fontWeight: 800, fontSize: 74, lineHeight: 1.12, letterSpacing: -2, color: INK, opacity: 1 - out, transform: `translateY(${-14 * out}px)` }}>
      {gr.map(([w, at, acc], i) => {
        const p = ease(t, at, 0.3);
        if (p <= 0) return null;
        return <span key={i} style={{ display: "inline-block", marginRight: "0.24em", opacity: p, transform: `translateY(${(1 - p) * 16}px)`, filter: `blur(${(1 - p) * 6}px)`, color: acc ? GOLD : INK }}>{w}</span>;
      })}
    </div>
  );
};

/* calendar: "hook" = slams full, "blank" = empty, "plan" = SOCIA schedules it */
type Phase = "hook" | "blank" | "plan";
const Calendar: React.FC<{ phase: Phase }> = ({ phase }) => {
  const t = useT();
  const approved = phase === "plan" && t >= T.approve + 0.25;
  const status = phase === "blank" ? "0 posts" : phase === "hook" ? "7 posts" : approved ? "✓ Week approved" : "Scheduled · needs your approval";
  return (
    <div style={{ position: "absolute", left: 70, top: 450, width: 940, borderRadius: 32, background: CARD, border: `1px solid ${LINE}`, boxShadow: "0 30px 70px rgba(23,25,29,0.12)", padding: "24px 26px 18px", fontFamily: SANS, color: INK }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, height: 56 }}>
        <Mark size={44} />
        <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: -0.6 }}>Calendar</span>
        <span style={{ fontSize: 22, color: INK2, fontWeight: 600 }}>Week of Nov 2</span>
        <span style={{ marginLeft: "auto", fontSize: 21, fontWeight: 700, borderRadius: 18, padding: "6px 14px", color: approved ? GREEN : phase === "plan" ? BLUE : INK2, background: approved ? "rgba(31,138,76,0.1)" : phase === "plan" ? "rgba(42,98,245,0.08)" : "#f1efe9" }}>{status}</span>
      </div>
      {DAYS.map((d, i) => {
        const at = phase === "hook" ? T.hookFill + i * T.hookStep : T.schedules + 0.1 + i * T.dropStep;
        const p = phase === "blank" ? 0 : popE(t, at, 0.3);
        return (
          <div key={d.d} style={{ display: "flex", alignItems: "center", gap: 18, height: 92, borderTop: `1px solid ${LINE}` }}>
            <div style={{ width: 92, flexShrink: 0 }}>
              <div style={{ fontSize: 26, fontWeight: 800 }}>{d.d}</div>
              <div style={{ fontSize: 18, color: INK2, fontWeight: 600 }}>{d.n}</div>
            </div>
            <div style={{ position: "relative", flex: 1, height: 72 }}>
              <div style={{ position: "absolute", inset: 0, borderRadius: 16, border: `2.5px dashed ${LINE}` }} />
              {p > 0 ? (
                <div style={{ position: "absolute", inset: 0, borderRadius: 16, background: "#fbf8f1", border: "1.5px solid #e9dfc8", display: "flex", alignItems: "center", gap: 12, padding: "0 12px 0 10px", transform: `translateY(${(1 - Math.min(1, p)) * -40}px) scale(${0.8 + 0.2 * p})`, opacity: Math.min(1, p * 1.5) }}>
                  <div style={{ width: 34, height: 54, borderRadius: 8, background: [GOLD_BRIGHT, INK, BLUE, "#e5432d", "#7fb1ef", GREEN, "#c9a27a"][i], flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 16 }}>▶</div>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 25, fontWeight: 700, letterSpacing: -0.4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.hook}</div>
                  <span style={{ flexShrink: 0, fontSize: 18, fontWeight: 700, color: "#fff", background: INK, borderRadius: 10, padding: "4px 10px" }}>Reel</span>
                  <span style={{ flexShrink: 0, fontFamily: MONO, fontSize: 18, fontWeight: 600, color: approved ? GREEN : GOLD, border: `1.5px solid ${approved ? GREEN : GOLD_BRIGHT}`, borderRadius: 10, padding: "3px 8px" }}>{d.time}</span>
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
      <div style={{ marginTop: 8, fontFamily: MONO, fontSize: 18, color: INK2 }}>Real drafts · SOCIA Calendar · @socia.appmedia · times CT</div>
    </div>
  );
};

const Hook: React.FC = () => {
  const t = useT();
  const p = popE(t, T.stamp, 0.35);
  return (
    <>
      <Calendar phase="hook" />
      {t >= T.stamp ? (
        <div style={{ position: "absolute", left: 470, top: 760, transform: `rotate(-10deg) scale(${1.8 - 0.8 * p})`, opacity: Math.min(1, p * 2), border: "8px solid #e5432d", borderRadius: 20, background: "rgba(255,255,255,0.92)", padding: "10px 30px", fontFamily: SANS, fontWeight: 800, fontSize: 64, lineHeight: 1.05, color: "#e5432d", textAlign: "center", boxShadow: "0 20px 40px rgba(0,0,0,0.15)" }}>
          I made<br /><span style={{ fontSize: 120 }}>0</span> of these
        </div>
      ) : null}
    </>
  );
};

const Blank: React.FC = () => {
  const t = useT();
  const p = popE(t, T.note, 0.4);
  return (
    <>
      <Calendar phase="blank" />
      {t >= T.note ? (
        <div style={{ position: "absolute", left: 600, top: 760, width: 330, height: 300, background: "#ffe98a", boxShadow: "0 18px 40px rgba(0,0,0,0.18)", transform: `rotate(${6 - 4 * p}deg) scale(${p})`, padding: "36px 30px", fontFamily: SANS, fontWeight: 800, fontSize: 48, lineHeight: 1.1, color: INK }}>what do I post??</div>
      ) : null}
    </>
  );
};

const ClaudeMark: React.FC<{ size: number }> = ({ size }) => (
  <div style={{ position: "relative", width: size, height: size }}>
    {Array.from({ length: 8 }).map((_, i) => (
      <div key={i} style={{ position: "absolute", left: size / 2 - size * 0.07, top: 0, width: size * 0.14, height: size / 2, borderRadius: size, background: "#d97757", transformOrigin: "50% 100%", transform: `rotate(${i * 45 + (i % 2) * 8}deg) scaleY(${i % 2 ? 0.82 : 1})` }} />
    ))}
  </div>
);

const Connector: React.FC = () => {
  const t = useT();
  const on = ease(t, T.toggle, 0.25);
  const p = popE(t, T.connector + 0.05, 0.4);
  return (
    <div style={{ position: "absolute", left: 90, top: 520, width: 900, transform: `scale(${0.85 + 0.15 * p})`, opacity: Math.min(1, p * 2), borderRadius: 32, background: "#faf9f5", border: `1px solid ${LINE}`, boxShadow: "0 30px 70px rgba(23,25,29,0.14)", overflow: "hidden", fontFamily: SANS, color: INK }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 26px", borderBottom: `1px solid ${LINE}`, background: "#f1efe8" }}>
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => <span key={c} style={{ width: 16, height: 16, borderRadius: 16, background: c }} />)}
        <span style={{ marginLeft: 18, display: "flex", alignItems: "center", gap: 10, fontSize: 24, fontWeight: 700 }}><ClaudeMark size={28} />Claude · Settings</span>
      </div>
      <div style={{ padding: "28px 34px 34px" }}>
        <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: -0.8 }}>Connectors</div>
        <div style={{ fontSize: 22, color: INK2, marginTop: 6 }}>Let Claude use data and tools from your apps.</div>
        <div style={{ marginTop: 26, display: "flex", alignItems: "center", gap: 20, borderRadius: 22, border: `2px solid ${on > 0.5 ? GREEN : LINE}`, background: CARD, padding: "22px 24px" }}>
          <Mark size={76} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 34, fontWeight: 800 }}>SOCIA</div>
            <div style={{ fontSize: 21, color: on > 0.5 ? GREEN : INK2, fontWeight: 600, marginTop: 4 }}>{on > 0.5 ? "Connected · reads @socia.appmedia" : "Your posts, results and calendar"}</div>
          </div>
          <div style={{ width: 110, height: 60, borderRadius: 60, background: on > 0.5 ? GREEN : "#d6d3cc", position: "relative" }}>
            <div style={{ position: "absolute", top: 6, left: 6 + 50 * on, width: 48, height: 48, borderRadius: 48, background: "#fff", boxShadow: "0 2px 6px rgba(0,0,0,0.2)" }} />
          </div>
        </div>
        <div style={{ marginTop: 18, fontSize: 21, color: INK2 }}>+ Add custom connector</div>
      </div>
    </div>
  );
};

const Tile: React.FC<{ x: number; who: "socia" | "claude"; at: number; glow?: boolean }> = ({ x, who, at, glow }) => {
  const t = useT();
  const p = popE(t, at, 0.4);
  return (
    <div style={{ position: "absolute", left: x, top: 470, width: 330, height: 300, transform: `scale(${p})`, borderRadius: 34, background: CARD, border: `3px solid ${glow ? GOLD_BRIGHT : LINE}`, boxShadow: glow ? "0 0 0 10px rgba(217,178,92,0.18), 0 24px 50px rgba(23,25,29,0.12)" : "0 24px 50px rgba(23,25,29,0.12)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, fontFamily: SANS }}>
      {who === "socia" ? <Mark size={120} /> : <ClaudeMark size={110} />}
      <span style={{ fontSize: 40, fontWeight: 800, color: INK }}>{who === "socia" ? "SOCIA" : "Claude"}</span>
      <span style={{ fontSize: 21, fontWeight: 700, color: INK2 }}>{who === "socia" ? "the data · the schedule" : "makes the videos"}</span>
    </div>
  );
};

const Loop: React.FC = () => {
  const t = useT();
  const goingBack = t >= T.back;
  const arrow = ease(t, T.hands - 0.1, 0.4);
  const ret = ease(t, T.back, 0.4);
  return (
    <>
      <Tile x={70} who="socia" at={T.reads} glow={t < T.hands || goingBack} />
      <Tile x={680} who="claude" at={T.reads + 0.15} glow={t >= T.makes && !goingBack} />
      {/* SOCIA → Claude */}
      <div style={{ position: "absolute", left: 410, top: 560, width: 260 * arrow, borderTop: `6px dashed ${INK}` }} />
      {arrow > 0.95 ? <div style={{ position: "absolute", left: 660, top: 546, borderTop: "17px solid transparent", borderBottom: "17px solid transparent", borderLeft: `24px solid ${INK}` }} /> : null}
      <div style={{ position: "absolute", left: 0, right: 0, top: 800, display: "flex", justifyContent: "center", gap: 16 }}>
        {["Ideas", "Formats", "Hooks"].map((c, i) => {
          const p = popE(t, T.chips[i], 0.35);
          return <span key={c} style={{ transform: `scale(${p})`, fontFamily: SANS, fontSize: 36, fontWeight: 800, color: "#fff", background: GOLD, borderRadius: 26, padding: "12px 28px" }}>{c} →</span>;
        })}
      </div>
      {t >= T.reads ? (
        <div style={{ position: "absolute", left: 70, right: 70, top: 900, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12, opacity: 1 - ease(t, T.makes - 0.2, 0.3) }}>
          {STATS.map((s, i) => <span key={s} style={{ transform: `scale(${popE(t, T.stats[i])})`, fontFamily: SANS, fontSize: 24, fontWeight: 700, color: INK, background: CARD, border: `1.5px solid ${LINE}`, borderRadius: 20, padding: "8px 16px" }}>{s}</span>)}
          <span style={{ width: "100%", textAlign: "center", fontFamily: MONO, fontSize: 18, color: INK2 }}>SOCIA reading @socia.appmedia</span>
        </div>
      ) : null}
      {/* videos made by Claude, then handed back */}
      {t >= T.videos ? (
        <div style={{ position: "absolute", left: 0, right: 0, top: 960, display: "flex", justifyContent: "center", gap: 14 }}>
          {DAYS.map((d, i) => {
            const p = popE(t, T.videos + i * 0.08, 0.3);
            const dx = goingBack ? -360 * ease(t, T.back + i * 0.04, 0.5) : 300 * (1 - Math.min(1, p));
            return (
              <div key={d.d} style={{ width: 104, height: 184, borderRadius: 16, background: [GOLD_BRIGHT, INK, BLUE, "#e5432d", "#7fb1ef", GREEN, "#c9a27a"][i], border: `3px solid ${INK}`, transform: `translateX(${dx}px) scale(${Math.min(1, p) * (goingBack ? 1 - 0.3 * ease(t, T.back + 0.3, 0.4) : 1)})`, opacity: goingBack ? 1 - ease(t, T.back + 0.5, 0.3) : 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between", padding: "12px 0", color: "#fff", fontFamily: SANS }}>
                <span style={{ fontSize: 18, fontWeight: 800 }}>{d.d}</span>
                <span style={{ fontSize: 34 }}>▶</span>
                <span style={{ fontSize: 15, fontWeight: 700, opacity: 0.85 }}>video</span>
              </div>
            );
          })}
        </div>
      ) : null}
      {/* Claude → SOCIA */}
      {goingBack ? (
        <>
          <div style={{ position: "absolute", left: 410 + 260 * (1 - ret), top: 690, width: 260 * ret, borderTop: `6px dashed ${GOLD}` }} />
          {ret > 0.95 ? <div style={{ position: "absolute", left: 390, top: 676, borderTop: "17px solid transparent", borderBottom: "17px solid transparent", borderRight: `24px solid ${GOLD}` }} /> : null}
          <div style={{ position: "absolute", left: 0, right: 0, top: 1180, textAlign: "center", fontFamily: SANS, fontSize: 30, fontWeight: 700, color: GOLD, opacity: ease(t, T.back + 0.2, 0.3) }}>7 videos back to SOCIA</div>
        </>
      ) : null}
    </>
  );
};

const Schedule: React.FC = () => {
  const t = useT();
  const pressed = t >= T.approve + 0.25;
  return (
    <>
      <Calendar phase="plan" />
      {t >= T.approve - 0.5 ? (
        <div style={{ position: "absolute", left: 0, right: 0, top: 1250, display: "flex", justifyContent: "center" }}>
          <div style={{ transform: `scale(${popE(t, T.approve - 0.5) * (t >= T.approve && t < T.approve + 0.18 ? 0.92 : 1)})`, fontFamily: SANS, fontSize: 38, fontWeight: 800, color: "#fff", background: pressed ? GREEN : INK, borderRadius: 26, padding: "18px 44px" }}>{pressed ? "✓ Approved" : "Approve week"}</div>
        </div>
      ) : null}
    </>
  );
};

const Features: React.FC = () => {
  const t = useT();
  const icons = ["♪", "✂", "💬", "📈", "✍", "🧪", "👁"];
  const tones = [GOLD, INK, BLUE, "#e5432d", GREEN, "#7a5cc7", GOLD];
  return (
    <div style={{ position: "absolute", left: 70, right: 70, top: 470, display: "flex", flexWrap: "wrap", gap: 18, justifyContent: "center" }}>
      {FEATURES.map((f, i) => {
        const at = T.features[i];
        const p = popE(t, at, 0.35);
        const lit = t >= at;
        return (
          <div key={f} style={{ width: i === 6 ? 940 : 461, height: 150, borderRadius: 26, background: CARD, border: `2px solid ${lit ? tones[i] : LINE}`, boxShadow: lit ? "0 18px 40px rgba(23,25,29,0.1)" : "none", display: "flex", alignItems: "center", gap: 18, padding: "0 24px", opacity: lit ? 1 : 0.25, transform: `scale(${lit ? 0.85 + 0.15 * p : 0.92})`, fontFamily: SANS }}>
            <div style={{ width: 80, height: 80, borderRadius: 20, background: tones[i], color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 42, flexShrink: 0 }}>{icons[i]}</div>
            <span style={{ fontSize: 32, fontWeight: 800, color: INK, letterSpacing: -0.6, lineHeight: 1.1 }}>{f}</span>
          </div>
        );
      })}
    </div>
  );
};

/* promo close */
const Promo: React.FC = () => {
  const t = useT();
  if (t < T.promo) return null;
  const card = popE(t, T.promo + 0.15, 0.45);
  const code = popE(t, T.code, 0.35);
  const live = t >= T.live;
  const posted = t >= T.post + 0.2;
  return (
    <>
      <div style={{ position: "absolute", left: 110, top: 500, width: 860, height: 390, borderRadius: 34, background: INK, color: "#fff", transform: `scale(${card}) rotate(${-2 * card}deg)`, boxShadow: "0 30px 70px rgba(23,25,29,0.3)", display: "flex", fontFamily: SANS, overflow: "hidden" }}>
        <div style={{ width: 230, borderRight: "4px dashed rgba(255,255,255,0.35)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
          <Mark size={110} />
          <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: 1 }}>LAUNCH</span>
        </div>
        <div style={{ flex: 1, padding: "40px 44px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 26, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>
            Promo code
            <span style={{ opacity: live ? 1 : 0, transform: `scale(${popE(t, T.live)})`, display: "flex", alignItems: "center", gap: 8, color: "#7ee2a2", background: "rgba(31,138,76,0.25)", borderRadius: 16, padding: "4px 14px", fontSize: 22 }}>
              <span style={{ width: 12, height: 12, borderRadius: 12, background: "#45d17b", opacity: 0.5 + 0.5 * Math.abs(Math.sin(t * 5)) }} /> Live
            </span>
          </div>
          <div style={{ marginTop: 18, alignSelf: "flex-start", border: `5px dashed ${GOLD_BRIGHT}`, borderRadius: 20, padding: "4px 26px", fontSize: 128, fontWeight: 800, letterSpacing: -3, color: GOLD_BRIGHT, opacity: t >= T.code ? 1 : 0.15, transform: `scale(${t >= T.code ? 0.8 + 0.2 * code : 1})`, transformOrigin: "left center" }}>{PROMO}</div>
        </div>
      </div>
      {t >= T.follow ? (
        <div style={{ position: "absolute", left: 0, right: 0, top: 930, display: "flex", justifyContent: "center" }}>
          <div style={{ transform: `scale(${popE(t, T.follow)})`, display: "flex", alignItems: "center", gap: 16, background: t >= T.follow + 0.35 ? CARD : INK, color: t >= T.follow + 0.35 ? INK : "#fff", border: `3px solid ${INK}`, borderRadius: 30, padding: "14px 40px", fontFamily: SANS, fontSize: 40, fontWeight: 800 }}>
            <Mark size={44} />{t >= T.follow + 0.35 ? "✓ Following" : "+ Follow"}
          </div>
        </div>
      ) : null}
      {t >= T.link ? (
        <div style={{ position: "absolute", left: 110, top: 1050, width: 860, height: 116, borderRadius: 58, background: CARD, border: `2px solid ${LINE}`, boxShadow: "0 16px 40px rgba(23,25,29,0.1)", display: "flex", alignItems: "center", padding: "0 18px 0 40px", fontFamily: SANS, transform: `scale(${popE(t, T.link)})` }}>
          <span style={{ flex: 1, fontSize: 44, fontWeight: 800, color: INK }}>{typed(t, "LINK", T.linkType, T.linkType + 0.4) || <span style={{ color: INK2, fontWeight: 600, fontSize: 34 }}>Add a comment...</span>}</span>
          <span style={{ fontSize: 32, fontWeight: 800, color: "#fff", background: posted ? GREEN : BLUE, borderRadius: 36, padding: "14px 30px", transform: `scale(${t >= T.post && t < T.post + 0.18 ? 0.92 : 1})` }}>{posted ? "✓ Posted" : "Post"}</span>
        </div>
      ) : null}
      {t >= T.dm ? (
        <div style={{ position: "absolute", left: 310, top: 1200, width: 660, transform: `scale(${popE(t, T.dm)})`, transformOrigin: "right top", fontFamily: SANS }}>
          <div style={{ borderRadius: "30px 30px 8px 30px", background: BLUE, color: "#fff", padding: "20px 28px", fontSize: 32, fontWeight: 700 }}>Here's your link 🔗 (SOCIA50)</div>
          <div style={{ textAlign: "right", fontFamily: MONO, fontSize: 19, color: INK2, marginTop: 8 }}>DM from @socia.appmedia · SOCIA, coming soon</div>
        </div>
      ) : null}
    </>
  );
};

/* sound, root */
type Cue = { src: string; at: number; volume: number };
const CUES: Cue[] = [
  ...DAYS.map((_, i) => ({ src: sfxClick, at: T.hookFill + i * T.hookStep, volume: 0.35 })),
  { src: sfxImpact, at: T.stamp, volume: 0.5 },
  { src: sfxWhoosh, at: T.blank - 0.05, volume: 0.25 },
  { src: sfxPop, at: T.note, volume: 0.3 },
  { src: sfxWhoosh, at: T.connector - 0.05, volume: 0.25 },
  { src: sfxClick, at: T.toggle, volume: 0.5 },
  { src: sfxWhoosh, at: T.reads - 0.05, volume: 0.25 },
  ...T.stats.map((at) => ({ src: sfxClick, at, volume: 0.3 })),
  ...T.chips.map((at) => ({ src: sfxPop, at, volume: 0.35 })),
  ...DAYS.map((_, i) => ({ src: sfxClick, at: T.videos + i * 0.08, volume: 0.25 })),
  { src: sfxWhoosh, at: T.back, volume: 0.3 },
  ...DAYS.map((_, i) => ({ src: sfxPop, at: T.schedules + 0.1 + i * T.dropStep, volume: 0.25 })),
  { src: sfxClick, at: T.approve, volume: 0.5 },
  { src: sfxWhoosh, at: T.more, volume: 0.25 },
  ...T.features.map((at) => ({ src: sfxPop, at, volume: 0.3 })),
  { src: sfxWhoosh, at: T.promo, volume: 0.25 },
  { src: sfxImpact, at: T.code, volume: 0.4 },
  { src: sfxPop, at: T.follow, volume: 0.35 },
  { src: sfxClick, at: T.post, volume: 0.45 },
  { src: sfxPop, at: T.dm, volume: 0.35 },
];

const Scene: React.FC = () => {
  const t = useT();
  if (t < T.blank) return <Hook />;
  if (t < T.connector) return <Blank />;
  if (t < T.reads) return <Connector />;
  if (t < T.schedules) return <Loop />;
  if (t < T.more) return <Schedule />;
  if (t < T.promo) return <Features />;
  return null;
};

export const Reel: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: SANS }}>
    <Audio src={vo} />
    {CUES.map((c, i) => (
      <Sequence key={i} from={Math.max(0, Math.round(c.at * FPS))} name={`sfx ${i}`}>
        <Audio src={c.src} volume={c.volume} />
      </Sequence>
    ))}
    <AbsoluteFill style={{ background: PAPER }} />
    <AbsoluteFill style={{ backgroundImage: "linear-gradient(rgba(23,25,29,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(23,25,29,0.035) 1px, transparent 1px)", backgroundSize: "54px 54px" }} />
    <Scene />
    <Promo />
    <Caption />
  </AbsoluteFill>
);
