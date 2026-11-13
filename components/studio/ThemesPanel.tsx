"use client";

// The Themes tab: the eight themes as a strip of cards drawn on the person's
// own footage (the first clip's frame, the theme's look as a CSS filter, its
// title and caption in its own face), the active one marked; a tap applies
// the theme to the preview at once. "Compare" shows every theme as a small
// looping preview of the cut itself, so one can be chosen by eye. The
// person's changes on top of a theme are a diff the "Reset to theme"
// button clears.
import { useEffect, useMemo, useState } from "react";
import { Player } from "@remotion/player";
import { Check, LayoutGrid, RotateCcw, Rows3 } from "lucide-react";
import { ClipComposition } from "./remotion/ClipComposition";
import { THEMES, type Theme } from "@/lib/studioClips/themes";
import { applyTheme, type ApplyContext } from "@/lib/studioClips/themes/apply";
import { lookCssFilter } from "@/lib/studioClips/look";
import { familyOf, loadAllEditorFonts } from "@/lib/editorFonts";
import type { FontId } from "@/lib/studioClips/style";
import { timeline } from "@/lib/studioClips/timeline";
import { OUTPUT, type BuildSource, type Edl } from "@/lib/studioClips/types";
import { useMotionOk } from "@/components/dashboard/motion";

/** A compare preview loops this much of the cut, so eight of them stay light. */
const COMPARE_SEC = 6;

/** The cut's first seconds, for the compare grid: whole cuts up to the limit, the last one trimmed. */
export function previewSlice(edl: Edl, maxSec = COMPARE_SEC): Edl {
  const segments: Edl["segments"] = [];
  let total = 0;
  for (const s of edl.segments) {
    const len = s.out - s.in;
    if (total >= maxSec) break;
    const keep = Math.min(len, maxSec - total);
    if (keep < 0.8 && segments.length) break;
    segments.push(keep < len ? { ...s, out: Math.round((s.in + Math.max(0.8, keep)) * 100) / 100 } : s);
    total += keep;
  }
  const end = Math.max(0.5, total);
  return { ...edl, segments, text: edl.text.filter((t) => t.at < end).map((t) => ({ ...t, end: Math.min(t.end, end) })), broll: (edl.broll ?? []).filter((b) => b.at < end) };
}

function ThemeCard({ theme, thumb, active, hasOverrides, onPick, disabled }: { theme: Theme; thumb: string | null; active: boolean; hasOverrides: boolean; onPick: () => void; disabled: boolean }) {
  const ty = theme.typography;
  const font = familyOf(ty.font as FontId);
  const bars = theme.color.grade.letterbox;
  const title = theme.sample.title.split("\n");
  const cap = ty.transform === "upper" ? theme.sample.caption.toUpperCase() : theme.sample.caption;
  const pill = ty.pill ? `${theme.color.captionBg}b8` : "transparent";
  return (
    <button type="button" role="radio" aria-checked={active} className={`sd-theme${active ? " is-on" : ""}`} disabled={disabled} onClick={onPick}>
      <span className="sd-theme-frame" aria-hidden style={{ background: theme.color.primary }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a signed storage URL */}
        {thumb ? <img src={thumb} alt="" style={{ filter: lookCssFilter(theme.color.grade) }} /> : <span className="sd-theme-blank" />}
        {bars > 0 && <><i className="sd-theme-bar is-top" style={{ height: `${bars * 100}%` }} /><i className="sd-theme-bar is-bottom" style={{ height: `${bars * 100}%` }} /></>}
        {theme.color.grade.vignette > 0 && <i className="sd-theme-vignette" style={{ opacity: theme.color.grade.vignette }} />}
        <span className="sd-theme-title" style={{ fontFamily: font, fontWeight: ty.weight, color: theme.color.text, textTransform: ty.transform === "upper" ? "uppercase" : "none", letterSpacing: `${ty.letterSpacing}em`, textShadow: ty.textBox === "outline" ? "0 0 2px #000, 0 0 2px #000, 0 1px 2px #000" : "0 1px 6px rgba(0,0,0,0.75)" }}>
          {title.map((l, i) => <span key={i} style={ty.titlePreset === "hook_pair" && i === title.length - 1 && title.length > 1 ? { fontFamily: familyOf("serif"), fontStyle: "italic", fontWeight: 400, fontSize: "1.5em", textTransform: "none" } : undefined}>{l}</span>)}
        </span>
        <span className="sd-theme-cap" style={{ fontFamily: font, fontWeight: ty.weight >= 700 ? ty.weight : 700, color: theme.color.text, background: pill, textTransform: ty.transform === "upper" ? "uppercase" : "none", textAlign: ty.align, alignSelf: ty.align === "left" ? "flex-start" : "center", WebkitTextStroke: ty.textBox === "outline" ? "1px #000" : undefined, textShadow: ty.pill ? undefined : "0 1px 5px rgba(0,0,0,0.8)" }}>
          {cap.split(" ").map((w, i) => <span key={i} style={i === 1 ? { color: ty.highlight } : undefined}>{w} </span>)}
        </span>
        {theme.layout.progressBar && <i className="sd-theme-progress" style={{ background: theme.color.accent }} />}
        {theme.layout.lowerThird !== "none" && <i className="sd-theme-lower" style={{ background: theme.layout.lowerThird === "pill" ? theme.color.accent : "rgba(0,0,0,0.7)", borderLeft: theme.layout.lowerThird === "bar" ? `3px solid ${theme.color.accent}` : undefined }} />}
        {active && <span className="sd-theme-check"><Check size={12} aria-hidden /></span>}
      </span>
      <span className="sd-theme-name">{theme.name}{active && hasOverrides ? <small> (changed)</small> : null}</span>
      <span className="sd-theme-for">{theme.bestFor}</span>
    </button>
  );
}

export default function ThemesPanel({ edl, sources, ctx, canEdit, busy, onApply, onReset }: {
  edl: Edl;
  sources: Record<string, BuildSource>;
  /** words by clip, so a theme's punches and sentence steps land on the speech */
  ctx: ApplyContext;
  canEdit: boolean;
  busy: boolean;
  onApply: (theme: Theme) => void;
  onReset: () => void;
}) {
  const [compare, setCompare] = useState(false);
  const motionOk = useMotionOk();
  useEffect(() => { void loadAllEditorFonts(); }, []);
  const active = edl.theme?.id ?? null;
  const hasOverrides = Boolean(edl.theme?.overrides && Object.keys(edl.theme.overrides).length);
  const thumb = useMemo(() => { const first = edl.segments[0] ? sources[edl.segments[0].clipId] : undefined; return first?.thumb ?? Object.values(sources)[0]?.thumb ?? null; }, [edl.segments, sources]);
  const locked = !canEdit || busy;
  // The compare grid: the cut's first seconds in every theme, made once per cut.
  const slices = useMemo(() => (compare ? THEMES.map((t) => ({ theme: t, edl: applyTheme(previewSlice(edl), t, ctx) })) : []), [compare, edl, ctx]);
  return (
    <div className="sd-themes">
      <div className="sd-themes-head">
        <div>
          <b>Themes</b>
          <small>{active ? `${THEMES.find((t) => t.id === active)?.name ?? active}: your trims, words and music stay; the look, the motion and the joins follow the theme.` : "Pick a look: your trims, words and music stay; the look, the motion and the joins follow the theme."}</small>
        </div>
        <div className="sd-themes-actions">
          {active && hasOverrides && <button type="button" className="ov-btn ghost small" disabled={locked} onClick={onReset}><RotateCcw size={12} aria-hidden /> Reset to theme</button>}
          <button type="button" className="ov-btn ghost small" aria-pressed={compare} onClick={() => setCompare((c) => !c)}>{compare ? <Rows3 size={12} aria-hidden /> : <LayoutGrid size={12} aria-hidden />} {compare ? "Back to the strip" : "Compare all"}</button>
        </div>
      </div>
      {!compare ? (
        <div className="sd-theme-strip" role="radiogroup" aria-label="Theme">
          {THEMES.map((t) => <ThemeCard key={t.id} theme={t} thumb={thumb} active={t.id === active} hasOverrides={hasOverrides} disabled={locked} onPick={() => onApply(t)} />)}
        </div>
      ) : (
        <div className="sd-theme-grid" role="radiogroup" aria-label="Theme">
          {slices.map(({ theme, edl: sliced }) => {
            const tl = timeline(sliced);
            return (
              <button key={theme.id} type="button" role="radio" aria-checked={theme.id === active} className={`sd-theme sd-theme-live${theme.id === active ? " is-on" : ""}`} disabled={locked} onClick={() => onApply(theme)}>
                <span className="sd-theme-frame" aria-hidden>
                  <Player
                    component={ClipComposition}
                    inputProps={{ edl: sliced, sources, captionsOn: Boolean(sliced.captions) }}
                    durationInFrames={tl.durationFrames}
                    fps={OUTPUT.fps}
                    compositionWidth={sliced.width}
                    compositionHeight={sliced.height}
                    autoPlay={motionOk}
                    loop
                    initiallyMuted
                    controls={false}
                    clickToPlay={false}
                    acknowledgeRemotionLicense
                    style={{ width: "100%", aspectRatio: `${sliced.width} / ${sliced.height}` }}
                  />
                  {theme.id === active && <span className="sd-theme-check"><Check size={12} aria-hidden /></span>}
                </span>
                <span className="sd-theme-name">{theme.name}</span>
                <span className="sd-theme-for">{theme.bestFor}</span>
              </button>
            );
          })}
        </div>
      )}
      <p className="ov-source">Every theme keeps to the house style: a line on screen from the first second, captions a few words at a time with the key word coloured, the ask in the post text, and cuts by default outside the fast themes.</p>
    </div>
  );
}
