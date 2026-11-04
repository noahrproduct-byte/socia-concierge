import React from "react";
import { AbsoluteFill, Audio, Easing, Img, Sequence, interpolate, useCurrentFrame } from "remotion";
import { SFX, VO, BED } from "./sound";
import { SFX_FILES, VO_FILES } from "./audioFiles";
import mark from "../brand/socia-mark.png";
import { CHAPTERS, CONTEXT, CTA, FPS, HOOK, LOOP, MAKE, MEET, OUTLIERS, PLAN } from "./script";
import { B, BOX_GLOW, Body, C, Caption, Dashes, FONT, GLOW, Gold, GoldChip, InstagramIcon, Mono, Pop, Reveal, Scene, Script, StepChip, Title, fmtK, fmtN, progressAt, sec, useProgress } from "./ui";

// Every `at` below is seconds from the chapter's start and sits on the word of
// the narration that names the thing (whisper word timings of audio/vo/NN.mp3,
// plus the clip's 0.2 s offset; 0.11 s for the hook). See sound.ts.

const outCubic = Easing.out(Easing.cubic);

/* ───────────────────────── 1 · HOOK ───────────────────────── */

const COUNT_START = 10 / FPS; // hold on the first number for a third of a second
const COUNT_DUR = sec(1.65);

const useCount = (from: number, to: number) => {
  const f = useCurrentFrame();
  const p = interpolate(f - sec(COUNT_START), [0, COUNT_DUR], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.quad) });
  return from + (to - from) * p;
};

const ProfileCard: React.FC<{ tag: string; handle: string; a: { n: number; label: string }; b: { n: number; label: string }; active?: boolean }> = ({ tag, handle, a, b, active }) => (
  <div style={{ position: "relative", width: 420, borderRadius: 22, padding: "30px 24px 24px", background: active ? "rgba(59,124,255,0.06)" : C.panel, border: `2px solid ${active ? C.gold : C.panelLine}`, boxShadow: active ? BOX_GLOW : "none" }}>
    <div style={{ position: "absolute", top: -18, left: 22 }}>
      <Mono size={17} color={active ? C.bg : C.ink2} style={{ background: active ? C.gold : "#2a2724", padding: "6px 12px", borderRadius: 7, fontWeight: 600 }}>{tag}</Mono>
    </div>
    <div style={{ fontSize: 24, fontWeight: 800, color: C.ink, marginBottom: 14 }}>‹ {handle}</div>
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ width: 70, height: 70, borderRadius: 35, background: "linear-gradient(135deg,#1d2a4a,#141720)", border: `1.5px solid ${C.panelLine}`, display: "grid", placeItems: "center", fontSize: 30, fontWeight: 800, color: C.gold }}>S</div>
      <div style={{ display: "flex", gap: 10, flex: 1, justifyContent: "flex-end" }}>
        <Stat n={a.n} label={a.label} ring={active} />
        <Stat n={b.n} label={b.label} />
      </div>
    </div>
  </div>
);

const Stat: React.FC<{ n: number; label: string; ring?: boolean }> = ({ n, label, ring }) => (
  <div style={{ textAlign: "center", padding: "8px 14px", borderRadius: 40, border: `2px solid ${ring ? C.gold : "rgba(255,255,255,0.14)"}`, minWidth: 120 }}>
    <div style={{ fontSize: 30, fontWeight: 800, color: ring ? C.gold : C.ink, lineHeight: 1.05, letterSpacing: -1 }}>{fmtN(n)}</div>
    <div style={{ fontSize: 17, color: C.ink2, fontWeight: 600 }}>{label}</div>
  </div>
);

const Hook: React.FC = () => {
  const n = useCount(HOOK.from, HOOK.to);
  const afterViews = useCount(HOOK.cards.before.a.n, HOOK.cards.after.a.n);
  return (
    <Scene n={1}>
      <div style={{ position: "absolute", top: 250, left: 0, right: 0, display: "flex", justifyContent: "center", alignItems: "center", gap: 18 }}>
        <Img src={mark} style={{ width: 54, height: 54, borderRadius: 14 }} />
        <Dashes width={90} />
        <InstagramIcon size={54} />
      </div>
      <div style={{ position: "absolute", top: 330, left: 30, right: 30, textAlign: "center", lineHeight: 1 }}>
        <div style={{ fontSize: 72, fontWeight: 800, letterSpacing: -2 }}>{HOOK.line1}</div>
        <div style={{ fontSize: 150, fontWeight: 800, letterSpacing: -5, color: C.gold, textShadow: GLOW, marginTop: 8, fontVariantNumeric: "tabular-nums" }}>
          {fmtK(HOOK.from)} <span style={{ fontSize: 110, letterSpacing: 0 }}>→</span> {fmtK(n)}
        </div>
        <div style={{ fontSize: 60, fontWeight: 800, letterSpacing: -1.5, marginTop: 10, display: "flex", justifyContent: "center", alignItems: "center", gap: 16 }}>
          <span>{HOOK.line3a}</span>
          <Img src={mark} style={{ width: 52, height: 52, borderRadius: 13 }} />
          <span>{HOOK.line3b}</span>
        </div>
      </div>
      <Script at={3.27} top={700} size={48}>
        {HOOK.script.before}
        <span style={{ color: C.gold, textDecoration: "underline", textUnderlineOffset: 8 }}>{HOOK.script.em}</span>
        {HOOK.script.after}
      </Script>
      <div style={{ position: "absolute", top: 1010, left: 0, right: 0, display: "flex", justifyContent: "center", alignItems: "center", gap: 20 }}>
        <Reveal at={0.5} rise={20}>
          <ProfileCard {...HOOK.cards.before} />
        </Reveal>
        <Reveal at={1.0} rise={0}>
          <div style={{ color: C.gold, fontSize: 44, fontWeight: 800, lineHeight: 1 }}>→</div>
        </Reveal>
        <Reveal at={1.0} rise={20}>
          <ProfileCard {...HOOK.cards.after} a={{ n: afterViews, label: HOOK.cards.after.a.label }} active />
        </Reveal>
      </div>
      <Reveal at={3.0} style={{ position: "absolute", top: 1230, left: 60, right: 60, textAlign: "center" }}>
        <Mono size={17} color={C.ink3} style={{ textTransform: "none", letterSpacing: 0.5 }}>{HOOK.source}</Mono>
      </Reveal>
    </Scene>
  );
};

/* ───────────────────────── 2 · MEET SOCIA ───────────────────────── */

/** "reads / plans / makes / posts / learns", each on its word. */
const VERB_AT = [1.37, 2.45, 3.37, 4.43, 5.58];

const Meet: React.FC = () => (
  <Scene n={2}>
    <Pop at={0.1} from={0.8} style={{ position: "absolute", top: 230, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
      <Img src={mark} style={{ width: 84, height: 84, borderRadius: 22, boxShadow: BOX_GLOW }} />
    </Pop>
    <Title line1={MEET.line1} line2={MEET.line2} top={340} at={0.17} size1={64} size2={132} />
    <Body at={0.9} top={600}>
      {MEET.body.a}
      <B>{MEET.body.b}</B>
      {MEET.body.c}
    </Body>
    {MEET.verbs.map((v, i) => (
      <Pop key={v.word} at={VERB_AT[i]} from={0.9} style={{ position: "absolute", top: 720 + i * 136, left: 150, right: 150 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24, borderRadius: 20, padding: "22px 30px", background: C.panel, border: `1.5px solid ${C.panelLine}` }}>
          <div style={{ width: 54, height: 54, borderRadius: 27, background: "rgba(59,124,255,0.14)", border: `2px solid ${C.gold}`, display: "grid", placeItems: "center", color: C.gold, fontFamily: FONT.mono, fontSize: 22, fontWeight: 700 }}>{i + 1}</div>
          <div style={{ fontSize: 48, fontWeight: 800, color: C.gold, letterSpacing: -1.5, width: 220 }}>{v.word}</div>
          <div style={{ fontSize: 30, fontWeight: 600, color: C.ink2 }}>{v.sub}</div>
        </div>
      </Pop>
    ))}
  </Scene>
);

/* ───────────────────────── 3 · CONTEXT ───────────────────────── */

const HUB = { x: 540, y: 1075, r: 86 };
const SPOKE_POS: Record<string, { x: number; y: number }> = {
  tl: { x: 270, y: 925 },
  tr: { x: 810, y: 925 },
  bl: { x: 270, y: 1225 },
  br: { x: 810, y: 1225 },
  b: { x: 540, y: 1400 },
};
/** "your account, your niche, your audience, your competitors, every Reel" */
const SPOKE_AT = [6.26, 6.86, 7.49, 8.23, 9.42];
const CARD_W = 300;
const CARD_H = 112;

/** A dashed accent line that draws from the hub to the card over nine frames. */
const Connector: React.FC<{ to: { x: number; y: number }; at: number; id: string }> = ({ to, at, id }) => {
  const f = useCurrentFrame();
  const p = progressAt(f, at, 9);
  const dx = to.x - HUB.x;
  const dy = to.y - HUB.y;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const x1 = HUB.x + ux * HUB.r;
  const y1 = HUB.y + uy * HUB.r;
  // stop where the line meets the card's box, so it never runs behind the card
  const tx = Math.abs(ux) > 1e-6 ? (CARD_W / 2) / Math.abs(ux) : Infinity;
  const ty = Math.abs(uy) > 1e-6 ? (CARD_H / 2) / Math.abs(uy) : Infinity;
  const back = Math.min(tx, ty);
  const x2 = to.x - ux * back;
  const y2 = to.y - uy * back;
  // the visible part grows out from the hub; no mask, so the render agrees with the preview
  const xe = x1 + (x2 - x1) * p;
  const ye = y1 + (y2 - y1) * p;
  if (p <= 0) return null;
  return (
    <svg key={id} style={{ position: "absolute", inset: 0 }} width={1080} height={1920}>
      <line x1={x1} y1={y1} x2={xe} y2={ye} stroke={C.gold} strokeWidth="3" strokeDasharray="9 9" />
    </svg>
  );
};

const Context: React.FC = () => (
  <Scene n={3}>
    <Reveal at={0} rise={10}>
      <StepChip label={CONTEXT.step} />
    </Reveal>
    <Title line1={CONTEXT.line1} line2={CONTEXT.line2} top={330} at={0.18} />
    <Reveal at={1.27} style={{ position: "absolute", top: 640, left: 0, right: 0, display: "flex", justifyContent: "center", alignItems: "center", gap: 20 }}>
      <InstagramIcon size={70} />
      <Dashes width={110} />
      <Img src={mark} style={{ width: 70, height: 70, borderRadius: 18 }} />
      <span style={{ fontSize: 32, fontWeight: 700, color: C.ink, marginLeft: 6 }}>{CONTEXT.once}</span>
    </Reveal>
    <Reveal at={1.6} style={{ position: "absolute", top: 730, left: 0, right: 0, textAlign: "center" }}>
      <Mono size={18} color={C.ink3}>{CONTEXT.platforms}</Mono>
    </Reveal>
    {CONTEXT.spokes.map((s, i) => (
      <Connector key={s.key} id={s.key} to={SPOKE_POS[s.at]} at={SPOKE_AT[i]} />
    ))}
    {CONTEXT.spokes.map((s, i) => {
      const pos = SPOKE_POS[s.at];
      return (
        <Reveal key={s.key} at={SPOKE_AT[i] + 7 / FPS} rise={12} style={{ position: "absolute", left: pos.x - CARD_W / 2, top: pos.y - CARD_H / 2, width: CARD_W, height: CARD_H }}>
          <div style={{ width: "100%", height: "100%", boxSizing: "border-box", borderRadius: 16, padding: "16px 18px", background: "#151311", border: `1.5px solid ${C.panelLine}` }}>
            <Mono size={21} color={C.gold} style={{ textTransform: "lowercase", fontWeight: 600, letterSpacing: 1 }}>{s.key}</Mono>
            <div style={{ fontSize: 19, color: C.ink2, fontWeight: 600, lineHeight: 1.3, marginTop: 6 }}>{s.text}</div>
          </div>
        </Reveal>
      );
    })}
    <Pop at={5.23} style={{ position: "absolute", left: HUB.x - HUB.r, top: HUB.y - HUB.r, width: HUB.r * 2, height: HUB.r * 2 }}>
      <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: C.bg, border: `3px solid ${C.gold}`, boxShadow: `${BOX_GLOW}, inset 0 0 30px rgba(59,124,255,0.15)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
        <Img src={mark} style={{ width: 64, height: 64, borderRadius: 16 }} />
        <Mono size={15} color={C.ink} style={{ fontWeight: 600 }}>{CONTEXT.hub}</Mono>
      </div>
    </Pop>
    <Caption at={5.6} top={1490}>
      {CONTEXT.caption.before}
      <Gold>{CONTEXT.caption.em}</Gold>
    </Caption>
  </Scene>
);

/* ───────────────────────── 4 · OUTLIERS ───────────────────────── */

const Outliers: React.FC = () => {
  const f = useCurrentFrame();
  const flip = progressAt(f, 3.08, 6); // "median"
  return (
    <Scene n={4}>
      <Reveal at={0} rise={10}>
        <StepChip label={OUTLIERS.step} />
      </Reveal>
      <Title line1={OUTLIERS.line1} line2={OUTLIERS.line2} top={330} at={0.2} />
      <Body at={1.28} top={640}>
        {OUTLIERS.body.a}
        <B>{OUTLIERS.body.b}</B>
        {OUTLIERS.body.c}
        <B>{OUTLIERS.body.d}</B>
        {OUTLIERS.body.e}
      </Body>
      <Reveal at={0.3} rise={14} style={{ position: "absolute", top: 800, left: 60, right: 60 }}>
        <div style={{ borderRadius: 24, background: C.panel, border: `1.5px solid ${C.panelLine}`, padding: "26px 28px 18px", minHeight: 420 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <Mono size={18}>{OUTLIERS.panel.title}</Mono>
            <GoldChip>{OUTLIERS.panel.chip}</GoldChip>
          </div>
          {OUTLIERS.rows.map((r, i) => (
            <Reveal key={r.title} at={1.6 + i * 0.15} rise={18}>
              <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 0", borderTop: i ? `1px solid ${C.panelLine}` : "none" }}>
                <div style={{ width: 54, height: 54, borderRadius: 27, background: r.hue, display: "grid", placeItems: "center", fontSize: 24, fontWeight: 800, color: "#fff" }}>{r.initial}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.title}</div>
                  <Mono size={14}>{r.sub}</Mono>
                </div>
                <div style={{ fontSize: 26, fontWeight: 800, color: C.ink, display: "flex", alignItems: "center", gap: 8, fontVariantNumeric: "tabular-nums" }}>
                  <span style={{ fontSize: 18 }}>▶</span>
                  {r.views}
                </div>
                <div style={{ position: "relative", width: 112, height: 48 }}>
                  <div style={{ position: "absolute", inset: 0, opacity: 1 - flip, borderRadius: 10, background: "rgba(255,255,255,0.08)", display: "grid", placeItems: "center", color: C.ink3, fontSize: 24, fontWeight: 800 }}>--</div>
                  <div style={{ position: "absolute", inset: 0, opacity: flip, transform: `scale(${0.8 + 0.2 * flip})`, borderRadius: 10, background: C.gold, boxShadow: BOX_GLOW, display: "grid", placeItems: "center", color: C.bg, fontSize: 26, fontWeight: 800, letterSpacing: -0.5 }}>{r.x}</div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </Reveal>
      <Caption at={3.96} top={1270}>
        {OUTLIERS.caption.before}
        <Gold>{OUTLIERS.caption.em}</Gold>
        {OUTLIERS.caption.after}
      </Caption>
      {/* the optional extra, on "Claude" */}
      <Pop at={5.45} from={0.85} style={{ position: "absolute", top: 1390, left: 60, right: 60 }}>
        <div style={{ borderRadius: 20, border: `1.5px dashed ${C.gold}`, padding: "22px 28px", display: "flex", alignItems: "center", gap: 22, background: "rgba(59,124,255,0.05)" }}>
          <GoldChip style={{ whiteSpace: "nowrap" }}>{OUTLIERS.mcp.chip}</GoldChip>
          <div style={{ fontSize: 24, fontWeight: 600, color: C.ink2, lineHeight: 1.3 }}>{OUTLIERS.mcp.sub}</div>
        </div>
      </Pop>
    </Scene>
  );
};

/* ───────────────────────── 5 · PLAN ───────────────────────── */

const GRID = { x: 60, y: 900, labelW: 318, cellW: 128, cellH: 64, gap: 10 };
const SWEEP_START = 5.97; // "thirty-five decisions"
const SWEEP_DUR = 1.0;

const Plan: React.FC = () => {
  const f = useCurrentFrame();
  const cols = PLAN.cols.length;
  const rows = PLAN.rows.length;
  const total = rows * cols;
  const sweep = interpolate(f, [sec(SWEEP_START), sec(SWEEP_START + SWEEP_DUR)], [0, total], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const filled = Math.floor(sweep);
  const rowLabel = progressAt(f, 4.71, 10); // "a full week"
  const colLabel = progressAt(f, 5.3, 10); // "of posts"
  const winnerKey = new Set(PLAN.winners.map(([r, c]) => `${r}-${c}`));
  return (
    <Scene n={5}>
      <Reveal at={0} rise={10}>
        <StepChip label={PLAN.step} />
      </Reveal>
      <Script at={1.3} top={318} size={40}>
        {PLAN.script}
      </Script>
      <Title line1={PLAN.line1} line2={PLAN.line2} top={375} at={3.0} size1={72} size2={108} />
      <Body at={3.6} top={640}>
        {PLAN.body.a}
        <B>{PLAN.body.b}</B>
        {PLAN.body.c}
        <B>{PLAN.body.d}</B>
        {PLAN.body.e}
      </Body>
      {/* column labels */}
      {PLAN.cols.map((c, i) => (
        <div key={c} style={{ position: "absolute", left: GRID.x + GRID.labelW + i * (GRID.cellW + GRID.gap), top: GRID.y - 44, width: GRID.cellW, textAlign: "center", opacity: 0.25 + 0.75 * colLabel }}>
          <Mono size={13} color={C.gold} style={{ fontWeight: 600 }}>{c}</Mono>
        </div>
      ))}
      {PLAN.rows.map((r, ri) => (
        <React.Fragment key={r}>
          <div style={{ position: "absolute", left: GRID.x, top: GRID.y + ri * (GRID.cellH + GRID.gap), height: GRID.cellH, width: GRID.labelW - 16, display: "flex", alignItems: "center", opacity: 0.25 + 0.75 * rowLabel }}>
            <Mono size={14} color={C.ink} style={{ fontWeight: 600, letterSpacing: 1.5 }}>{r}</Mono>
          </div>
          {PLAN.cols.map((c, ci) => {
            const idx = ri * cols + ci;
            const tint = idx < filled ? 1 : idx === filled ? sweep - filled : 0;
            const win = winnerKey.has(`${ri}-${ci}`);
            const pop = win ? progressAt(f, 7.2, 10, Easing.out(Easing.back(1.8))) : 0; // "made for you"
            return (
              <div
                key={c}
                style={{
                  position: "absolute",
                  left: GRID.x + GRID.labelW + ci * (GRID.cellW + GRID.gap),
                  top: GRID.y + ri * (GRID.cellH + GRID.gap),
                  width: GRID.cellW,
                  height: GRID.cellH,
                  borderRadius: 12,
                  background: pop > 0.01 ? C.gold : `rgba(59,124,255,${0.05 + 0.2 * tint})`,
                  border: `1.5px solid ${pop > 0.01 ? C.gold : "rgba(255,255,255,0.08)"}`,
                  boxShadow: pop > 0.01 ? BOX_GLOW : "none",
                  transform: `scale(${1 + 0.08 * pop * (1 - pop) * 4})`,
                }}
              />
            );
          })}
        </React.Fragment>
      ))}
      <Reveal at={SWEEP_START} style={{ position: "absolute", top: 1450, left: 40, right: 40, textAlign: "center" }}>
        <div style={{ fontSize: 34, fontWeight: 800, color: C.ink, letterSpacing: -0.5 }}>
          {PLAN.caption.a}
          <Gold>{PLAN.caption.em.replace(String(PLAN.total), String(Math.max(1, Math.min(total, filled + 1))))}</Gold>
        </div>
      </Reveal>
    </Scene>
  );
};

/* ───────────────────────── 6 · MAKE (Content Studio) ───────────────────────── */

const CLIP_AT0 = 1.28; // "drop in clips"
const CLIP_STEP = 0.15;
const CUT_AT = [3.71, 4.1, 4.62]; // "keeps building videos"
/** "hook, pacing, clarity, visuals, call to action, audio" */
const RATER_AT = [6.74, 7.11, 7.6, 8.23, 8.87, 9.81];

const Make: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <Scene n={6}>
      <Reveal at={0} rise={10}>
        <StepChip label={MAKE.step} />
      </Reveal>
      <Title line1={MAKE.line1} line2={MAKE.line2} top={330} at={0.2} size1={64} size2={96} />
      {/* the clip bin */}
      <Reveal at={0.6} rise={14} style={{ position: "absolute", top: 600, left: 60, right: 60 }}>
        <div style={{ borderRadius: 24, background: C.panel, border: `1.5px solid ${C.panelLine}`, padding: "22px 28px 22px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <Mono size={18}>{MAKE.bin.title}</Mono>
            <GoldChip>{MAKE.bin.chip}</GoldChip>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            {MAKE.bin.clips.map((day, i) => (
              <Pop key={i} at={CLIP_AT0 + i * CLIP_STEP} from={0.5} style={{ flex: 1 }}>
                <div style={{ height: 96, borderRadius: 14, background: `linear-gradient(160deg, rgba(59,124,255,0.28), rgba(59,124,255,0.06))`, border: `1.5px solid rgba(59,124,255,0.4)`, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "10px 10px" }}>
                  <div style={{ width: 0, height: 0, borderLeft: "12px solid rgba(242,239,233,0.8)", borderTop: "7px solid transparent", borderBottom: "7px solid transparent" }} />
                  <Mono size={13} color={C.ink2} style={{ fontWeight: 600 }}>{day}</Mono>
                </div>
              </Pop>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 20 }}>
            <Reveal at={CUT_AT[0] - 0.3} rise={0}>
              <div style={{ color: C.gold, fontSize: 40, fontWeight: 800, lineHeight: 1, paddingLeft: 6 }}>{MAKE.bin.arrow}</div>
            </Reveal>
            <div style={{ flex: 1 }}>
              <Reveal at={CUT_AT[0] - 0.3} rise={8}>
                <Mono size={15} color={C.gold} style={{ fontWeight: 600 }}>{MAKE.bin.cuts.title}</Mono>
              </Reveal>
              <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
                {MAKE.bin.cuts.items.map((it, i) => (
                  <Pop key={it} at={CUT_AT[i]} from={0.85} style={{ flex: 1 }}>
                    <div style={{ borderRadius: 12, padding: "12px 14px", background: "rgba(59,124,255,0.1)", border: `1.5px solid ${C.gold}`, fontSize: 21, fontWeight: 700, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it}</div>
                  </Pop>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Reveal>
      {/* the rater */}
      <Reveal at={5.27} rise={14} style={{ position: "absolute", top: 990, left: 60, right: 60 }}>
        <div style={{ borderRadius: 24, background: C.panel, border: `1.5px solid ${C.panelLine}`, padding: "22px 28px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <Mono size={18}>{MAKE.rater.title}</Mono>
            <GoldChip>{MAKE.rater.chip}</GoldChip>
          </div>
          {MAKE.rater.categories.map((c, i) => {
            const p = progressAt(f, RATER_AT[i], 8);
            const dots = progressAt(f, RATER_AT[i] + 4 / FPS, 10);
            return (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 18, padding: "11px 0", borderTop: i ? `1px solid ${C.panelLine}` : "none", opacity: p, transform: `translateX(${(1 - p) * -14}px)` }}>
                <div style={{ width: 120, fontSize: 25, fontWeight: 800, color: C.ink }}>{c.id}</div>
                <div style={{ display: "flex", gap: 6, width: 130 }}>
                  {Array.from({ length: MAKE.rater.max }, (_, d) => {
                    const on = Math.max(0, Math.min(1, dots * MAKE.rater.max - d)) * (d < c.score ? 1 : 0);
                    return <div key={d} style={{ width: 20, height: 20, borderRadius: 10, background: on > 0.5 ? C.gold : "rgba(255,255,255,0.1)", boxShadow: on > 0.5 ? `0 0 10px rgba(59,124,255,0.6)` : "none" }} />;
                  })}
                </div>
                <div style={{ flex: 1, fontSize: 21, fontWeight: 600, color: C.ink2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.fix}</div>
              </div>
            );
          })}
        </div>
      </Reveal>
      <Caption at={10.55} top={1540}>
        {MAKE.caption.before}
        <Gold>{MAKE.caption.em}</Gold>
      </Caption>
    </Scene>
  );
};

/* ───────────────────────── 7 · LOOP ───────────────────────── */

const SQ = 66;
const Strip: React.FC<{ title: string; sub: string; n: number; active: boolean; lit: (i: number) => number; top: number }> = ({ title, sub, n, active, lit, top }) => (
  <div style={{ position: "absolute", top, left: 60, right: 60, borderRadius: 22, padding: "24px 28px", display: "flex", alignItems: "center", gap: 26, background: active ? "rgba(59,124,255,0.06)" : C.panel, border: `2px solid ${active ? C.gold : C.panelLine}`, boxShadow: active ? BOX_GLOW : "none", opacity: active ? 1 : 0.55 }}>
    <div style={{ width: 300 }}>
      <div style={{ fontSize: 34, fontWeight: 800, color: active ? C.gold : C.ink, letterSpacing: -1 }}>{title}</div>
      <div style={{ fontSize: 21, color: C.ink2, fontWeight: 600 }}>{sub}</div>
    </div>
    <div style={{ display: "flex", gap: 12, flex: 1, justifyContent: "flex-end" }}>
      {Array.from({ length: n }, (_, i) => {
        const l = lit(i);
        return <div key={i} style={{ width: SQ, height: SQ, borderRadius: 12, background: `rgba(59,124,255,${0.08 + 0.92 * l})`, boxShadow: l > 0.9 ? `0 0 16px rgba(59,124,255,${0.5 * l})` : "none", transform: `scale(${1 + 0.1 * Math.sin(Math.PI * l) * (l < 1 ? 1 : 0)})` }} />;
      })}
    </div>
  </div>
);

const Loop: React.FC = () => {
  const f = useCurrentFrame();
  const n1 = LOOP.strip1.n;
  const fill1 = interpolate(f, [sec(1.29), sec(2.3)], [0, n1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }); // "schedule the week"
  const drop = progressAt(f, 4.3, 8); // "then double down"
  const winners = progressAt(f, 5.0, 8, Easing.out(Easing.back(1.5))); // "double down"
  const active2 = progressAt(f, 5.45, 6); // "on what"
  const fill2 = interpolate(f, [sec(5.6), sec(6.3)], [0, LOOP.strip2.n], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const lit1 = (i: number) => {
    const sweep = Math.max(0, Math.min(1, fill1 - i)) * (1 - drop) * 0.3;
    const win = LOOP.winners.includes(i) ? winners : 0;
    return Math.max(sweep, win);
  };
  const lit2 = (i: number) => Math.max(0, Math.min(1, fill2 - i));
  return (
    <Scene n={7}>
      <Reveal at={0} rise={10}>
        <StepChip label={LOOP.step} />
      </Reveal>
      <Title line1={LOOP.line1} line2={LOOP.line2} top={330} at={0.2} size1={64} size2={116} />
      <Strip {...LOOP.strip1} active lit={lit1} top={810} />
      <Caption at={3.1} top={990}>
        {LOOP.caption.before}
        <Gold>{LOOP.caption.em}</Gold>
      </Caption>
      <Pop at={4.35} style={{ position: "absolute", top: 1120, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <GoldChip>{LOOP.chip}</GoldChip>
      </Pop>
      <div style={{ position: "absolute", inset: 0, opacity: 0.55 + 0.45 * active2 }}>
        <Strip {...LOOP.strip2} active={active2 > 0.5} lit={lit2} top={1210} />
      </div>
    </Scene>
  );
};

/* ───────────────────────── 8 · CTA ───────────────────────── */

// "Follow, then comment early access, and I'll send you the link. The first fifty get a week free."

const Cta: React.FC = () => (
  <Scene n={8}>
    <Pop at={0} from={0.85} dur={10} style={{ position: "absolute", top: 280, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
      <div style={{ width: 380, height: 380, borderRadius: "50%", border: `5px solid ${C.gold}`, boxShadow: `${BOX_GLOW}, 0 0 90px rgba(59,124,255,0.25)`, overflow: "hidden", background: "#111" }}>
        <Img src={mark} style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scale(1.02)" }} />
      </div>
    </Pop>
    <div style={{ position: "absolute", top: 760, left: 40, right: 40, display: "flex", justifyContent: "center", gap: 22 }}>
      <Reveal at={0.3} rise={12}>
        <div style={{ fontSize: 78, fontWeight: 800, letterSpacing: -2 }}>{CTA.follow}</div>
      </Reveal>
      <Reveal at={0.78} rise={12}>
        <div style={{ fontSize: 78, fontWeight: 800, letterSpacing: -2 }}>{CTA.line1}</div>
      </Reveal>
    </div>
    <Pop at={1.48} from={0.7} style={{ position: "absolute", top: 850, left: 20, right: 20, textAlign: "center" }}>
      <div style={{ fontSize: 118, fontWeight: 800, letterSpacing: -4, color: C.gold, textShadow: GLOW, lineHeight: 1 }}>{CTA.word}</div>
    </Pop>
    <Body at={2.66} top={1010}>
      {CTA.body.a}
      <B>{CTA.body.b}</B>
      {CTA.body.c}
    </Body>
    {/* the launch offer, on "the first fifty" */}
    <Pop at={3.63} from={0.8} style={{ position: "absolute", top: 1160, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
      <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: -1, color: C.bg, background: C.gold, borderRadius: 18, padding: "18px 36px", boxShadow: BOX_GLOW }}>{CTA.offer}</div>
    </Pop>
  </Scene>
);

/* ───────────────────────── ROOT ───────────────────────── */

const chapters: { key: keyof typeof CHAPTERS; C: React.FC }[] = [
  { key: "hook", C: Hook },
  { key: "meet", C: Meet },
  { key: "context", C: Context },
  { key: "outliers", C: Outliers },
  { key: "plan", C: Plan },
  { key: "make", C: Make },
  { key: "loop", C: Loop },
  { key: "cta", C: Cta },
];

/** Voice and effects, each cue one frame after its picture. No music bed. */
const Soundtrack: React.FC = () => (
  <>
    {VO.map((c, i) => (
      <Sequence key={`vo-${i}`} from={sec(c.at)} name={`vo ${c.file}`}>
        <Audio src={VO_FILES[c.file]} volume={c.volume ?? 1} />
      </Sequence>
    ))}
    {SFX.map((c, i) => (
      <Sequence key={`sfx-${i}`} from={sec(c.at) + 1} name={`sfx ${c.file}`}>
        <Audio src={SFX_FILES[c.file]} volume={c.volume ?? 0.6} />
      </Sequence>
    ))}
  </>
);

export const Method: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg, fontFamily: FONT.display }}>
    <Soundtrack />
    {chapters.map(({ key, C: Chapter }) => {
      const { start, end } = CHAPTERS[key];
      return (
        <Sequence key={key} from={sec(start)} durationInFrames={sec(end) - sec(start)} name={key}>
          <Chapter />
        </Sequence>
      );
    })}
  </AbsoluteFill>
);

// keep the eased helpers referenced for the type checker
void outCubic;
void useProgress;
void BED;
