import React from "react";
import { AbsoluteFill, Audio, Easing, Img, Sequence, interpolate, useCurrentFrame } from "remotion";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadSerif } from "@remotion/google-fonts/SourceSerif4";
import mark from "../brand/socia-mark.png";
import vo from "./audio/vo.mp3";
import sfxPop from "../method/audio/sfx/pop.mp3";
import sfxClick from "../method/audio/sfx/click-soft.mp3";
import sfxWhoosh from "../method/audio/sfx/whoosh-short.mp3";
import { InstagramIcon } from "../method/ui";
import { ACCENT, CAMERA, DAYS, FPS, T, TIMES, TRACKS, WORDS } from "./story";

const inter = loadInter("normal", { weights: ["500", "600", "700", "800"], subsets: ["latin"] });
const serif = loadSerif("normal", { weights: ["400", "500"], subsets: ["latin"] });
const SANS = `${inter.fontFamily}, Inter, sans-serif`;
const SERIF = `${serif.fontFamily}, Georgia, serif`;

const CORAL = "#d9714e";
const PAPER = "#f7f5f0";
const PAPER2 = "#efebe4";
const INK = "#2b2a28";
const INK2 = "#7a766f";
const LINE = "#e2ded6";
const GREEN = "#2f9e5b";
const RED = "#e5322d";
const GOLD = "#f4c45a";
const SW = 1500; // screen size in laptop space
const SH = 940;

const useT = () => useCurrentFrame() / FPS;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = (t: number, at: number, dur = 0.3, e = Easing.out(Easing.cubic)) => interpolate(t, [at, at + dur], [0, 1], { ...clamp, easing: e });
const popE = (t: number, at: number, dur = 0.35) => interpolate(t, [at, at + dur], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.7)) });
const typed = (t: number, text: string, from: number, to: number) => text.slice(0, Math.round(interpolate(t, [from, to], [0, text.length], clamp)));

/** Screen content that crossfades in at `at` and holds until `until`. */
const Screen: React.FC<{ at: number; until: number; children: React.ReactNode }> = ({ at, until, children }) => {
  const t = useT();
  if (t < at - 0.02 || t > until + 0.15) return null;
  const p = ease(t, at, 0.18);
  return <div style={{ position: "absolute", inset: 0, opacity: p }}>{children}</div>;
};

/* ───────────── marks + small parts ───────────── */

const ClaudeMark: React.FC<{ size?: number; color?: string }> = ({ size = 40, color = CORAL }) => (
  <svg width={size} height={size} viewBox="-50 -50 100 100">
    {Array.from({ length: 12 }).map((_, i) => {
      const a = (i / 12) * Math.PI * 2;
      return <line key={i} x1={Math.cos(a) * 8} y1={Math.sin(a) * 8} x2={Math.cos(a) * (i % 2 ? 40 : 46)} y2={Math.sin(a) * (i % 2 ? 40 : 46)} stroke={color} strokeWidth={9} strokeLinecap="round" />;
    })}
  </svg>
);
const Mark: React.FC<{ size: number }> = ({ size }) => <Img src={mark} style={{ width: size, height: size, borderRadius: size * 0.24 }} />;
const Example: React.FC = () => <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: 2, color: "#7a5600", background: "#fbecc4", border: "1px solid #e8c771", borderRadius: 6, padding: "2px 8px" }}>EXAMPLE</span>;
const Check: React.FC<{ size?: number }> = ({ size = 22 }) => <span style={{ display: "inline-flex", width: size, height: size, borderRadius: size / 2, background: GREEN, color: "#fff", fontSize: size * 0.62, fontWeight: 800, alignItems: "center", justifyContent: "center" }}>✓</span>;

/** The reference's red hand-drawn arrow, drawn on at `at`, tip at (x, y) in screen space. */
const Arrow: React.FC<{ at: number; x: number; y: number; from?: "right" | "left" | "top"; until?: number }> = ({ at, x, y, from = "right", until = 999 }) => {
  const t = useT();
  if (t < at || t > until) return null;
  const p = ease(t, at, 0.35);
  const d = from === "right" ? `M ${x + 170} ${y - 90} C ${x + 90} ${y - 140}, ${x + 20} ${y - 80}, ${x} ${y}` : from === "left" ? `M ${x - 170} ${y - 90} C ${x - 90} ${y - 140}, ${x - 20} ${y - 80}, ${x} ${y}` : `M ${x - 60} ${y - 170} C ${x + 40} ${y - 150}, ${x + 20} ${y - 60}, ${x} ${y}`;
  const head = from === "left" ? 1 : -1;
  return (
    <svg style={{ position: "absolute", left: 0, top: 0, overflow: "visible", zIndex: 20 }} width={SW} height={SH}>
      <path d={d} stroke={RED} strokeWidth={9} fill="none" strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} />
      {p > 0.9 ? <path d={`M ${x} ${y} l ${18 * head} -28 M ${x} ${y} l ${30 * head} -6`} stroke={RED} strokeWidth={9} strokeLinecap="round" /> : null}
    </svg>
  );
};

/* ───────────── Claude screens ───────────── */

const Sidebar: React.FC<{ active?: string }> = ({ active }) => (
  <div style={{ position: "absolute", left: 0, top: 50, bottom: 0, width: 250, background: PAPER2, padding: "26px 22px", fontSize: 22, color: INK2, display: "flex", flexDirection: "column", gap: 20 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: SERIF, fontSize: 30, color: INK }}><ClaudeMark size={24} /> Claude</div>
    {["New chat", "Chats", "Projects", "Artifacts", "Customize"].map((s) => (
      <div key={s} style={{ padding: "6px 12px", borderRadius: 8, background: s === active ? "#1d1c1b" : "transparent", color: s === active ? "#fff" : INK2, fontWeight: s === active ? 700 : 500 }}>{s}</div>
    ))}
  </div>
);
const Browser: React.FC<{ url: string; children: React.ReactNode }> = ({ url, children }) => (
  <div style={{ position: "absolute", inset: 0, background: PAPER, fontFamily: SANS, color: INK }}>
    <div style={{ height: 50, background: PAPER2, display: "flex", alignItems: "center", gap: 10, padding: "0 18px", borderBottom: `1px solid ${LINE}` }}>
      {["#ff5f57", "#febc2e", "#28c840"].map((c) => <div key={c} style={{ width: 14, height: 14, borderRadius: 7, background: c }} />)}
      <div style={{ marginLeft: 120, width: 520, height: 30, borderRadius: 8, background: "#fff", fontSize: 17, color: INK2, display: "flex", alignItems: "center", paddingLeft: 16 }}>{url}</div>
    </div>
    {children}
  </div>
);

const Home: React.FC = () => (
  <Browser url="claude.ai/new">
    <Sidebar />
    <div style={{ position: "absolute", left: 250, right: 0, top: 260, textAlign: "center" }}>
      <div style={{ fontFamily: SERIF, fontSize: 52, display: "flex", justifyContent: "center", alignItems: "center", gap: 16 }}><ClaudeMark size={44} /> Good evening</div>
      <div style={{ margin: "40px auto 0", width: 760, height: 120, borderRadius: 20, background: "#fff", border: `1px solid ${LINE}`, textAlign: "left", padding: 24, fontSize: 24, color: "#aaa59d" }}>How can I help you today?</div>
    </div>
    <Arrow at={T.customize - 0.1} x={150} y={326} from="right" />
  </Browser>
);

const Customize: React.FC<{ tab?: boolean }> = () => (
  <Browser url="claude.ai/customize">
    <Sidebar active="Customize" />
    <div style={{ position: "absolute", left: 300, top: 90 }}>
      <div style={{ fontFamily: SERIF, fontSize: 56 }}>Customize</div>
      <div style={{ display: "flex", gap: 34, marginTop: 26, fontSize: 24, color: INK2 }}>
        <span>Skills</span><span style={{ color: INK, fontWeight: 700, borderBottom: `3px solid ${INK}` }}>Connectors</span><span>Plugins</span><span>Styles</span>
      </div>
    </div>
    <Arrow at={T.connectors} x={470} y={208} from="right" />
  </Browser>
);

const ConnectorList: React.FC<{ connected?: boolean }> = ({ connected }) => {
  const t = useT();
  const rows = ["Gmail", "Google Drive", "Notion", "Slack"];
  return (
    <Browser url="claude.ai/customize/connectors">
      <Sidebar active="Customize" />
      <div style={{ position: "absolute", left: 300, right: 50, top: 90 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontFamily: SERIF, fontSize: 52 }}>Connectors</div>
          <div style={{ background: "#1d1c1b", color: "#fff", borderRadius: 12, padding: "12px 24px", fontSize: 22, fontWeight: 700 }}>+ Add custom connector</div>
        </div>
        <div style={{ marginTop: 30, display: "flex", flexDirection: "column", gap: 14 }}>
          {connected ? (
            <div style={{ borderRadius: 14, border: `2px solid ${CORAL}`, background: "#fff", padding: "18px 22px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 26, fontWeight: 700 }}><Mark size={38} /> SOCIA <span style={{ fontSize: 18, color: GREEN, fontWeight: 700 }}>Connected</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, fontSize: 20, color: INK2 }}><InstagramIcon size={26} /> your Instagram · linked</div>
            </div>
          ) : null}
          {rows.map((r) => <div key={r} style={{ borderRadius: 14, border: `1px solid ${LINE}`, background: "#fff", padding: "18px 22px", fontSize: 24, display: "flex", justifyContent: "space-between" }}>{r}<span style={{ fontSize: 18, color: INK2 }}>Connect</span></div>)}
        </div>
      </div>
      {!connected ? <Arrow at={T.addBtn} x={1180} y={130} from="right" /> : null}
      {connected && t >= T.stamp ? (
        <div style={{ position: "absolute", left: 700, top: 420, transform: `rotate(-10deg) scale(${popE(t, T.stamp, 0.35) * 1 + (1 - popE(t, T.stamp, 0.35)) * 2})`, opacity: Math.min(1, ease(t, T.stamp, 0.15)), border: `8px solid ${GREEN}`, color: GREEN, borderRadius: 18, padding: "10px 36px", fontSize: 92, fontWeight: 800, letterSpacing: 6, background: "rgba(255,255,255,0.85)" }}>CONNECTED</div>
      ) : null}
    </Browser>
  );
};

const Dialog: React.FC = () => {
  const t = useT();
  const name = typed(t, "SOCIA", T.name, T.name + 0.35);
  const url = typed(t, "SOCIA connector link", T.url, T.url + 0.9);
  return (
    <Browser url="claude.ai/customize/connectors">
      <Sidebar active="Customize" />
      <div style={{ position: "absolute", inset: 0, top: 50, background: "rgba(40,38,35,0.35)" }} />
      <div style={{ position: "absolute", left: 470, top: 200, width: 640, borderRadius: 22, background: "#fff", padding: "32px 36px", boxShadow: "0 24px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ fontFamily: SERIF, fontSize: 36 }}>Add custom connector</div>
        <div style={{ marginTop: 26, fontSize: 19, color: INK2 }}>Name</div>
        <div style={{ marginTop: 8, height: 58, borderRadius: 10, border: `2px solid ${name ? "#e9a58c" : LINE}`, padding: "0 16px", display: "flex", alignItems: "center", fontSize: 26 }}>{name}</div>
        <div style={{ marginTop: 20, fontSize: 19, color: INK2 }}>Remote MCP server URL</div>
        <div style={{ marginTop: 8, height: 58, borderRadius: 10, border: `2px solid ${url ? "#e9a58c" : LINE}`, padding: "0 16px", display: "flex", alignItems: "center", fontSize: 24, color: CORAL }}>{url}</div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 28 }}><div style={{ background: CORAL, color: "#fff", borderRadius: 12, padding: "12px 28px", fontSize: 22, fontWeight: 700, transform: `scale(${t > T.connect && t < T.connect + 0.15 ? 0.9 : 1})` }}>Connect</div></div>
      </div>
      <Arrow at={T.name - 0.1} x={760} y={340} from="right" until={T.url} />
      <Arrow at={T.url} x={760} y={460} from="right" until={T.connect - 0.2} />
      <Arrow at={T.connect - 0.2} x={1010} y={570} from="right" />
    </Browser>
  );
};

const Access: React.FC = () => (
  <Browser url="claude.ai/customize/connectors">
    <div style={{ position: "absolute", left: 470, top: 250, width: 560, borderRadius: 22, background: "#fff", padding: "34px 36px", boxShadow: "0 24px 60px rgba(0,0,0,0.25)", textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "center", gap: 18, alignItems: "center" }}><ClaudeMark size={48} /><span style={{ fontSize: 30, color: INK2 }}>⇄</span><Mark size={52} /></div>
      <div style={{ marginTop: 20, fontSize: 30, fontWeight: 700 }}>Connect to SOCIA?</div>
      <div style={{ marginTop: 10, fontSize: 21, color: INK2 }}>You'll sign in to SOCIA next.</div>
      <div style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 26 }}>
        <div style={{ background: GREEN, color: "#fff", borderRadius: 12, padding: "12px 34px", fontSize: 22, fontWeight: 700 }}>Allow</div>
        <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: "12px 34px", fontSize: 22 }}>Deny</div>
      </div>
    </div>
    <Arrow at={T.allow1 - 0.1} x={660} y={560} from="left" />
  </Browser>
);

const SociaSignIn: React.FC = () => (
  <Browser url="SOCIA · sign in">
    <div style={{ position: "absolute", inset: 0, top: 50, background: "#fbfaf7", display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 140 }}>
      <Mark size={90} />
      <div style={{ marginTop: 24, fontSize: 40, fontWeight: 800 }}>Sign in to SOCIA</div>
      {["Continue with Google", "Continue with email"].map((s) => <div key={s} style={{ marginTop: 20, width: 460, height: 64, borderRadius: 14, border: `1px solid ${LINE}`, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 600 }}>{s}</div>)}
    </div>
    <Arrow at={T.signIn + 0.1} x={760} y={440} from="right" />
  </Browser>
);

const Consent: React.FC = () => {
  const t = useT();
  const on = t >= T.igToggle + 0.2;
  return (
    <Browser url="SOCIA · connect Claude">
      <div style={{ position: "absolute", inset: 0, top: 50, background: "#fbfaf7", display: "flex", justifyContent: "center", paddingTop: 70 }}>
        <div style={{ width: 720, borderRadius: 24, background: "#fff", border: `1px solid ${LINE}`, padding: "30px 36px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}><Mark size={46} /><span style={{ fontSize: 30, fontWeight: 800 }}>Claude wants to read your SOCIA data</span></div>
          <div style={{ marginTop: 10, fontSize: 20, color: INK2 }}>Choose what it can see.</div>
          {[{ k: "Instagram", icon: <InstagramIcon size={40} />, live: true }, { k: "TikTok", icon: <div style={{ width: 40, height: 40, borderRadius: 11, background: "#000", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>♪</div> }, { k: "YouTube", icon: <div style={{ width: 40, height: 40, borderRadius: 11, background: "#ff0033", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>▶</div> }].map((r) => {
            const sel = r.live && on;
            return (
              <div key={r.k} style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 18, padding: "14px 18px", borderRadius: 14, border: `2px solid ${sel ? "#bfe0cb" : LINE}` }}>
                {r.icon}<span style={{ flex: 1, fontSize: 24, fontWeight: 600 }}>{r.k}</span>
                <div style={{ width: 62, height: 34, borderRadius: 17, background: sel ? GREEN : "#d6d2cb", position: "relative" }}><div style={{ position: "absolute", top: 4, left: sel ? 32 : 4, width: 26, height: 26, borderRadius: 13, background: "#fff" }} /></div>
              </div>
            );
          })}
          <div style={{ marginTop: 24, height: 64, borderRadius: 14, background: "#1877f2", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 700, transform: `scale(${t > T.allow2 && t < T.allow2 + 0.15 ? 0.95 : 1})` }}>Allow</div>
        </div>
      </div>
      <Arrow at={T.igToggle - 0.1} x={1010} y={300} from="right" until={T.allow2 - 0.2} />
      <Arrow at={T.allow2 - 0.2} x={820} y={612} from="right" />
    </Browser>
  );
};

const ChatAsk: React.FC = () => {
  const t = useT();
  const text = typed(t, "make my reels for this week", T.typeFrom, T.typeTo);
  return (
    <Browser url="claude.ai/new">
      <Sidebar active="New chat" />
      <div style={{ position: "absolute", left: 250, right: 0, top: 220, textAlign: "center" }}>
        <div style={{ fontFamily: SERIF, fontSize: 48, display: "flex", justifyContent: "center", alignItems: "center", gap: 16 }}><ClaudeMark size={40} /> Good evening</div>
        <div style={{ margin: "36px auto 0", width: 820, height: 130, borderRadius: 20, background: "#fff", border: "2px solid #e9a58c", textAlign: "left", padding: 24, fontSize: 28, position: "relative" }}>
          {text}<span style={{ opacity: Math.floor(t * 2.4) % 2 ? 0 : 1 }}>|</span>
          <div style={{ position: "absolute", right: 18, bottom: 16, width: 46, height: 46, borderRadius: 12, background: CORAL, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>↑</div>
          <div style={{ position: "absolute", left: 22, bottom: 14, display: "flex", alignItems: "center", gap: 8, fontSize: 16, color: INK2 }}><Mark size={20} /> SOCIA connected</div>
        </div>
      </div>
      <Arrow at={T.typeTo} x={1290} y={480} from="right" />
    </Browser>
  );
};

const COVERS = ["#e8c9a0,#9c6b3c", "#2b2623,#5c4a3f", "#c9d6ea,#5d7fb8", "#d8d2c4,#6f6758", "#141414,#3a3a3a", "#f3d6e0,#b0587c", "#cfe3d4,#4f8a63", "#f2e6c9,#b58a2c"];
const Cover: React.FC<{ i: number; w: number; h: number }> = ({ i, w, h }) => <div style={{ width: w, height: h, borderRadius: 10, background: `linear-gradient(160deg,${COVERS[i % COVERS.length]})`, flexShrink: 0 }} />;

const Working: React.FC = () => {
  const t = useT();
  const making = t >= T.making;
  return (
    <Browser url="claude.ai/chat">
      <Sidebar active="Chats" />
      <div style={{ position: "absolute", left: 290, right: 40, top: 80 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 21 }}><Mark size={28} /><b>SOCIA</b><span style={{ color: INK2 }}>{t >= T.grid + 0.6 ? "read your profile · 48 posts" : "reading your profile..."}</span></div>
          <Example />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
          {Array.from({ length: 16 }).map((_, i) => <div key={i} style={{ opacity: ease(t, T.grid + i * 0.04, 0.2) }}><Cover i={i} w={66} h={96} /></div>)}
        </div>
        <div style={{ marginTop: 22, display: "flex", alignItems: "center", gap: 10, fontSize: 21, opacity: ease(t, T.niche, 0.25) }}><Mark size={28} /><b>Finding what works in your niche</b></div>
        <div style={{ display: "flex", gap: 12, marginTop: 14, opacity: ease(t, T.niche + 0.2, 0.3) }}>
          {Array.from({ length: 8 }).map((_, i) => <div key={i} style={{ border: i % 3 === 0 ? `3px solid ${CORAL}` : "none", borderRadius: 12 }}><Cover i={i + 3} w={110} h={150} /></div>)}
        </div>
        {making ? (
          <div style={{ marginTop: 22, borderRadius: 16, border: `2px solid #eab3a0`, background: "#fdf3ee", padding: "16px 20px", opacity: ease(t, T.making, 0.25) }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22, fontWeight: 700 }}><span style={{ display: "flex", gap: 10, alignItems: "center" }}><ClaudeMark size={22} /> Making your reels</span><span style={{ color: CORAL }}>{Math.min(7, Math.floor(interpolate(t, [T.making, T.fan + 1], [0, 7], clamp)))} / 7</span></div>
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              {["Hook", "Script", "Motion graphics"].map((c, i) => <span key={c} style={{ fontSize: 19, fontWeight: 700, color: t >= T.chips[i] ? "#fff" : INK2, background: t >= T.chips[i] ? CORAL : "#fff", border: `1px solid ${t >= T.chips[i] ? CORAL : LINE}`, borderRadius: 18, padding: "6px 14px" }}>{t >= T.chips[i] ? "✓ " : ""}{c}</span>)}
            </div>
          </div>
        ) : null}
      </div>
    </Browser>
  );
};

/* ───────────── SOCIA screens ───────────── */

const SociaApp: React.FC<{ tab: string; children: React.ReactNode }> = ({ tab, children }) => (
  <Browser url={`SOCIA · ${tab}`}>
    <div style={{ position: "absolute", inset: 0, top: 50, background: "#f6f4ef" }}>
      <div style={{ height: 70, display: "flex", alignItems: "center", gap: 14, padding: "0 30px", borderBottom: "1px solid #e4e1da", fontSize: 24, fontWeight: 800 }}>
        <Mark size={36} /> SOCIA <span style={{ fontWeight: 500, color: INK2 }}>· {tab}</span><span style={{ marginLeft: "auto" }}><Example /></span>
      </div>
      {children}
    </div>
  </Browser>
);

const Music: React.FC = () => {
  const t = useT();
  return (
    <SociaApp tab="Studio · Music">
      <div style={{ display: "flex", gap: 30, padding: 30 }}>
        <Cover i={1} w={250} h={440} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 30, fontWeight: 800 }}>AI music, made for this reel</div>
          <div style={{ fontSize: 20, color: INK2, marginTop: 6 }}>Pick one, set the music and voice levels.</div>
          {TRACKS.map((tr, i) => {
            const p = ease(t, T.tracks + i * 0.25, 0.3);
            const picked = i === 0 && t >= T.tracks + 0.9;
            return (
              <div key={tr} style={{ marginTop: 18, borderRadius: 16, background: "#fff", border: `2px solid ${picked ? "#8a6a2c" : "#e4e1da"}`, padding: "14px 18px", display: "flex", alignItems: "center", gap: 16, opacity: p, transform: `translateX(${(1 - p) * 30}px)` }}>
                <div style={{ width: 44, height: 44, borderRadius: 22, background: "#17191d", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>▶</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>Track {i + 1} · {tr}</div>
                  <div style={{ display: "flex", gap: 3, alignItems: "center", height: 34, marginTop: 6 }}>{Array.from({ length: 46 }).map((_, k) => <div key={k} style={{ flex: 1, height: 6 + 26 * Math.abs(Math.sin(k * (1.3 + i * 0.4))), borderRadius: 2, background: picked ? "#8a6a2c" : "#c9c4ba" }} />)}</div>
                </div>
                {picked ? <span style={{ fontSize: 18, fontWeight: 700, color: "#8a6a2c" }}>Using</span> : null}
              </div>
            );
          })}
        </div>
      </div>
    </SociaApp>
  );
};

const Editor: React.FC = () => {
  const t = useT();
  const [colour, sound, pauses] = T.fixes.map((at) => ease(t, at, 0.5));
  const split = interpolate(t, [T.editor + 0.4, T.fixes[0] + 0.6], [100, 50], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  return (
    <SociaApp tab="Studio · Look & sound">
      <div style={{ display: "flex", gap: 30, padding: 30 }}>
        <div style={{ position: "relative", width: 300, height: 520, borderRadius: 18, overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(160deg,#5b5146,#2e2924)" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(160deg,#e7c49a,#8f5f37)", clipPath: `inset(0 0 0 ${split}%)`, opacity: 0.4 + 0.6 * colour }} />
          <div style={{ position: "absolute", top: 0, bottom: 0, left: `${split}%`, width: 4, background: "#fff" }} />
          <div style={{ position: "absolute", left: 12, top: 12, fontSize: 16, fontWeight: 700, color: "#fff", background: "rgba(0,0,0,0.4)", borderRadius: 6, padding: "2px 8px" }}>Before</div>
          <div style={{ position: "absolute", right: 12, top: 12, fontSize: 16, fontWeight: 700, color: "#fff", background: "rgba(0,0,0,0.4)", borderRadius: 6, padding: "2px 8px" }}>After</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 30, fontWeight: 800 }}>Your own clips, polished</div>
          {[{ k: "Colour", v: colour, note: "brightness and warmth matched across clips" }, { k: "Sound", v: sound, note: "voice levelled, peaks kept under control" }, { k: "Pauses", v: pauses, note: "long pauses cut" }].map((r) => (
            <div key={r.k} style={{ marginTop: 22, borderRadius: 16, background: "#fff", border: "1px solid #e4e1da", padding: "16px 18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 23, fontWeight: 700 }}><span>{r.k}</span>{r.v > 0.9 ? <Check /> : null}</div>
              <div style={{ fontSize: 18, color: INK2, marginTop: 4 }}>{r.note}</div>
              {r.k === "Sound" ? <div style={{ display: "flex", gap: 3, alignItems: "center", height: 40, marginTop: 8 }}>{Array.from({ length: 50 }).map((_, k) => { const raw = 6 + 30 * Math.abs(Math.sin(k * 0.9) * Math.cos(k * 0.31)); const lv = raw + (18 - raw) * 0.7 * sound; return <div key={k} style={{ flex: 1, height: lv, borderRadius: 2, background: "#2a62f5" }} />; })}</div> : null}
              {r.k === "Pauses" ? <div style={{ display: "flex", gap: 6, marginTop: 8 }}>{[1, 0, 1, 1, 0, 1].map((b, k) => <div key={k} style={{ flex: b ? 2 : 1 - pauses * 0.9, height: 26, borderRadius: 6, background: b ? "#17191d" : "#e5322d", opacity: b ? 1 : 1 - pauses }} />)}</div> : null}
            </div>
          ))}
        </div>
      </div>
    </SociaApp>
  );
};

const AskSocia: React.FC = () => {
  const t = useT();
  const q = typed(t, "schedule these at my best times this week", T.askType[0], T.askType[1]);
  const conf = popE(t, T.confirm, 0.4);
  return (
    <SociaApp tab="Ask SOCIA">
      <div style={{ padding: "26px 40px" }}>
        <div style={{ marginLeft: "auto", width: "fit-content", maxWidth: 800, background: "#17191d", color: "#fff", borderRadius: 20, padding: "14px 22px", fontSize: 24, minHeight: 30 }}>{q || " "}</div>
        {conf > 0 ? (
          <div style={{ marginTop: 22, borderRadius: 20, background: "#fff", border: "1px solid #e4e1da", padding: "20px 24px", transform: `scale(${0.9 + 0.1 * conf})`, transformOrigin: "top left", opacity: Math.min(1, conf * 1.4) }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 22, fontWeight: 700 }}><Mark size={28} /> I'll schedule 7 reels. Confirm?</div>
            <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
              {DAYS.map((d, i) => (
                <div key={d} style={{ flex: 1, borderRadius: 12, border: "1px solid #e4e1da", padding: 8, textAlign: "center", opacity: ease(t, T.confirm + 0.2 + i * 0.08, 0.2) }}>
                  <div style={{ fontSize: 17, fontWeight: 700 }}>{d}</div>
                  <Cover i={i} w={100} h={130} />
                  <div style={{ fontSize: 16, color: "#2a62f5", fontWeight: 700, marginTop: 6 }}>{TIMES[i]}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
              <div style={{ background: "#17191d", color: "#fff", borderRadius: 12, padding: "10px 24px", fontSize: 20, fontWeight: 700 }}>Confirm</div>
              <div style={{ border: "1px solid #e4e1da", borderRadius: 12, padding: "10px 24px", fontSize: 20 }}>Change</div>
            </div>
          </div>
        ) : null}
      </div>
    </SociaApp>
  );
};

const Week: React.FC = () => {
  const t = useT();
  return (
    <SociaApp tab="Calendar">
      <div style={{ display: "flex", gap: 14, padding: "30px 30px 0" }}>
        {DAYS.map((d, i) => (
          <div key={d} style={{ flex: 1, borderRadius: 16, background: "#fff", border: "1px solid #e4e1da", padding: 12, textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{d}</div>
            <div style={{ margin: "10px auto 0", width: "fit-content" }}><Cover i={i} w={150} h={250} /></div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#8a6a2c", marginTop: 10 }}>🔒 needs your OK</div>
          </div>
        ))}
      </div>
      <div style={{ margin: "26px 30px 0", borderRadius: 18, background: "#17191d", color: "#fff", padding: "20px 26px", display: "flex", alignItems: "center", gap: 18, opacity: ease(t, T.approve + 0.1, 0.3) }}>
        <span style={{ fontSize: 34 }}>🔒</span><span style={{ flex: 1, fontSize: 28, fontWeight: 800 }}>Nothing posts until you approve it</span>
        <span style={{ background: "#8a6a2c", borderRadius: 12, padding: "10px 22px", fontSize: 22, fontWeight: 800 }}>Approve</span>
      </div>
    </SociaApp>
  );
};

/* ───────────── the laptop + camera ───────────── */

const ScreenContent: React.FC = () => {
  const t = useT();
  const on = ease(t, T.screenOn, 0.4);
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#050505" }}>
      <div style={{ position: "absolute", inset: 0, opacity: on }}>
        <Screen at={T.screenOn} until={T.customize}><Home /></Screen>
        <Screen at={T.customize} until={T.list}><Customize /></Screen>
        <Screen at={T.list} until={T.dialog}><ConnectorList /></Screen>
        <Screen at={T.dialog} until={T.access}><Dialog /></Screen>
        <Screen at={T.access} until={T.signIn}><Access /></Screen>
        <Screen at={T.signIn} until={T.consent}><SociaSignIn /></Screen>
        <Screen at={T.consent} until={T.connected}><Consent /></Screen>
        <Screen at={T.connected} until={T.chat}><ConnectorList connected /></Screen>
        <Screen at={T.chat} until={T.reading}><ChatAsk /></Screen>
        <Screen at={T.reading} until={T.music}><Working /></Screen>
        <Screen at={T.music} until={T.editor}><Music /></Screen>
        <Screen at={T.editor} until={T.ask}><Editor /></Screen>
        <Screen at={T.ask} until={T.approve}><AskSocia /></Screen>
        <Screen at={T.approve} until={999}><Week /></Screen>
      </div>
    </div>
  );
};

/** A fan of finished reels that rises over the laptop while Claude builds them. */
const Fan: React.FC = () => {
  const t = useT();
  if (t < T.fan || t > T.music + 0.3) return null;
  const out = 1 - ease(t, T.music - 0.1, 0.35);
  return (
    <div style={{ position: "absolute", left: 0, top: -430, width: SW, height: 600, opacity: out }}>
      {Array.from({ length: 7 }).map((_, i) => {
        const p = popE(t, T.fan + i * 0.07, 0.45);
        const a = (i - 3) * 9;
        return (
          <div key={i} style={{ position: "absolute", left: SW / 2 - 110 + (i - 3) * 170 * p, top: 120 + Math.abs(i - 3) * 30 * p, width: 220, height: 400, transform: `rotate(${a * p}deg) translateY(${(1 - p) * 200}px)`, borderRadius: 26, border: "6px solid #111", overflow: "hidden", boxShadow: "0 20px 40px rgba(0,0,0,0.5)", background: `linear-gradient(160deg,${COVERS[i]})` }}>
            <div style={{ position: "absolute", left: 16, right: 16, top: 150, fontFamily: SANS, fontWeight: 800, fontSize: 26, color: "#fff", textShadow: "0 2px 8px rgba(0,0,0,0.5)" }}>{["this is why", "3 cafés,", "I tried", "the 30-sec", "what I'd", "one rule", "save this"][i]}</div>
          </div>
        );
      })}
      <div style={{ position: "absolute", left: SW / 2 - 140, top: 560, width: 280, textAlign: "center", fontFamily: SANS, fontWeight: 800, fontSize: 30, color: "#fff", background: CORAL, borderRadius: 30, padding: "8px 0", transform: `scale(${popE(t, T.fan + 0.6)})` }}>7 reels ✓</div>
    </div>
  );
};

const Laptop: React.FC = () => {
  const t = useT();
  const k = CAMERA.findIndex(([at], i) => t >= at && (i === CAMERA.length - 1 || t < CAMERA[i + 1][0]));
  const a = CAMERA[k], b = CAMERA[Math.min(k + 1, CAMERA.length - 1)];
  const u = b[0] === a[0] ? 0 : Easing.inOut(Easing.cubic)(Math.min(1, (t - a[0]) / (b[0] - a[0])));
  const s = a[1] + (b[1] - a[1]) * u, dx = a[2] + (b[2] - a[2]) * u, dy = a[3] + (b[3] - a[3]) * u;
  return (
    <div style={{ position: "absolute", left: 540 + dx, top: 780 + dy, width: 0, height: 0, transform: `scale(${s})` }}>
      <div style={{ position: "absolute", left: -SW / 2 - 26, top: -SH / 2 - 26, width: SW + 52, height: SH + 52, borderRadius: 34, background: "#0d0d0f", border: "3px solid #2a2a2e", boxShadow: "0 40px 120px rgba(0,0,0,0.7)" }}>
        <div style={{ position: "absolute", left: 26, top: 26, width: SW, height: SH, borderRadius: 8, overflow: "hidden" }}><ScreenContent /></div>
        <Fan />
      </div>
      {/* hinge + deck with keys, seen from the front */}
      <div style={{ position: "absolute", left: -SW / 2 - 70, top: SH / 2 + 26, width: SW + 140, height: 26, borderRadius: "0 0 20px 20px", background: "linear-gradient(180deg,#c9cbd0,#8d9096)" }} />
      <div style={{ position: "absolute", left: -SW / 2 - 40, top: SH / 2 + 52, width: SW + 80, height: 560, background: "linear-gradient(180deg,#3a3b40,#1d1e22)", clipPath: "polygon(0 0, 100% 0, 92% 100%, 8% 100%)", padding: "40px 150px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(14, 1fr)", gap: 12 }}>
          {Array.from({ length: 70 }).map((_, i) => <div key={i} style={{ height: 52, borderRadius: 8, background: "#141518", boxShadow: "inset 0 -3px 0 #0a0a0c" }} />)}
        </div>
      </div>
    </div>
  );
};

/* ───────────── overlays ───────────── */

const Ground: React.FC = () => (
  <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 40%, #3a2618 0%, #1c130d 45%, #0b0806 100%)" }}>
    <AbsoluteFill style={{ background: "repeating-linear-gradient(90deg, rgba(255,255,255,0.015) 0 2px, transparent 2px 90px)" }} />
  </AbsoluteFill>
);

const HookLogos: React.FC = () => {
  const t = useT();
  if (t > T.zoomIn + 0.4) return null;
  const out = 1 - ease(t, T.zoomIn, 0.35);
  const items = [<div key="c" style={{ width: 120, height: 120, borderRadius: 30, background: CORAL, display: "flex", alignItems: "center", justifyContent: "center" }}><ClaudeMark size={84} color="#fff" /></div>, "+", <Mark key="s" size={120} />, "=", <span key="f" style={{ fontSize: 110 }}>🔥</span>];
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 230, display: "flex", justifyContent: "center", alignItems: "center", gap: 26, opacity: out, fontFamily: SANS, fontWeight: 800, fontSize: 80, color: "#fff" }}>
      {items.map((it, i) => <div key={i} style={{ transform: `scale(${popE(t, 0.05 + i * 0.12)})` }}>{it}</div>)}
    </div>
  );
};

const CommentPill: React.FC = () => {
  const t = useT();
  if (t < T.comment - 0.1) return null;
  const p = popE(t, T.comment - 0.1, 0.4);
  const word = typed(t, "SOCIA", T.comment + 0.4, T.comment + 0.9);
  const bob = Math.sin((t - T.comment) * 6) * 10;
  return (
    <>
      <div style={{ position: "absolute", left: 0, right: 0, top: 200, display: "flex", justifyContent: "center" }}>
        <div style={{ transform: `scale(${p})`, background: "#0b0b0b", borderRadius: 26, padding: "16px 40px", fontFamily: SANS, fontWeight: 800, fontSize: 84, color: "#fff", boxShadow: "0 10px 40px rgba(0,0,0,0.6)" }}>
          Comment "<span style={{ color: GOLD }}>{word}</span>"
        </div>
      </div>
      <svg style={{ position: "absolute", left: 490, top: 360 + bob }} width={100} height={170} viewBox="0 0 100 170"><path d="M 50 0 L 50 120 M 14 92 L 50 140 L 86 92" stroke={RED} strokeWidth={22} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={p} /></svg>
    </>
  );
};

/** Two words at a time, white with a soft shadow, as in the reference. */
const Caption: React.FC = () => {
  const t = useT();
  const groups: [number, number][] = [];
  for (let i = 0; i < WORDS.length; ) {
    const end = /[.,]$/.test(WORDS[i][0]) || i + 1 >= WORDS.length ? i : i + 1;
    groups.push([i, end]);
    i = end + 1;
  }
  const g = groups.reduce((v, gr, gi) => (t >= WORDS[gr[0]][1] - 0.02 ? gi : v), -1);
  if (g < 0) return null;
  const [a, b] = groups[g];
  const next = groups[g + 1];
  const fadeOut = next ? ease(t, WORDS[next[0]][1] - 0.06, 0.05) : 0;
  return (
    <div style={{ position: "absolute", left: 60, right: 60, top: 1290, textAlign: "center", fontFamily: SANS, fontWeight: 800, fontSize: 84, letterSpacing: -1.5, color: "#fff", textShadow: "0 4px 18px rgba(0,0,0,0.75)", opacity: 1 - fadeOut }}>
      {WORDS.slice(a, b + 1).map(([w, at], i) => {
        const p = ease(t, at, 0.22);
        return <span key={i} style={{ display: "inline-block", marginRight: "0.22em", opacity: p, transform: `translateY(${(1 - p) * 14}px) scale(${0.92 + 0.08 * p})`, filter: `blur(${(1 - p) * 5}px)`, color: ACCENT.has(w) ? GOLD : "#fff" }}>{w}</span>;
      })}
    </div>
  );
};

/* ───────────── sound, root ───────────── */

type Cue = { src: string; at: number; volume: number };
const CUES: Cue[] = [
  ...[0.05, 0.29, 0.53].map((at) => ({ src: sfxPop, at, volume: 0.45 })),
  { src: sfxWhoosh, at: T.zoomIn, volume: 0.4 },
  ...[T.customize, T.connectors, T.addBtn, T.connect, T.allow1, T.igToggle, T.allow2].map((at) => ({ src: sfxClick, at, volume: 0.55 })),
  { src: sfxPop, at: T.stamp, volume: 0.7 },
  { src: sfxClick, at: T.typeTo, volume: 0.5 },
  ...T.chips.map((at) => ({ src: sfxClick, at, volume: 0.45 })),
  { src: sfxWhoosh, at: T.fan, volume: 0.4 },
  ...[T.music, T.editor, T.ask, T.approve].map((at) => ({ src: sfxWhoosh, at: at - 0.05, volume: 0.25 })),
  { src: sfxPop, at: T.tracks + 0.9, volume: 0.45 },
  ...T.fixes.map((at) => ({ src: sfxClick, at: at + 0.4, volume: 0.45 })),
  { src: sfxPop, at: T.confirm, volume: 0.5 },
  { src: sfxPop, at: T.comment - 0.1, volume: 0.6 },
];

export const LaptopConnect: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: SANS }}>
    <Audio src={vo} />
    {CUES.map((c, i) => (
      <Sequence key={i} from={Math.max(0, Math.round(c.at * FPS))} name={`sfx ${i}`}>
        <Audio src={c.src} volume={c.volume} />
      </Sequence>
    ))}
    <Ground />
    <Laptop />
    <HookLogos />
    <CommentPill />
    <Caption />
  </AbsoluteFill>
);
