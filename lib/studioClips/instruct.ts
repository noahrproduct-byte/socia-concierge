// "Tell SOCIA what to change": a person types or says what they want done to
// a finished cut ("mute cut 3", "make the captions bigger", "cut the second
// shot", "add the line 'come see this rug' over the close-ups", "no music"),
// a model turns the words into the operations below (instructModel.ts), and
// this file applies them to the cut, one by one, saying what it did and what
// it could not. Every operation is bounded here: a cut number is checked
// against the cut, a level is clamped, a theme id must exist, a text line is
// fitted to its preset. Nothing here calls a model. Pure, unit-tested
// (instruct.test.ts).
import { z } from "zod";
import { TEXT_PRESETS, fitLine, isTextPresetId, presetForRole, type TextPresetId } from "@/lib/textPresets";
import { CAPTION_ANIMATIONS, CAPTION_STYLES, FONTS, type CaptionAnimation, type CaptionPosition, type CaptionSize, type CaptionStyleId, type FontId } from "./style";
import { REGENERATE_OPTIONS, TRANSITIONS, clipLabel, type Edl, type EdlSegment, type EdlText, type RegenerateDirective, type TransitionKind } from "./types";
import { applyTheme, setThemeOverride } from "./themes/apply";
import { THEMES, isThemeId } from "./themes";
import { SPEED_MAX, SPEED_MIN } from "./motion";
import { settleCut } from "./cutCheck";
import type { ClipForEdl } from "./edl";

const cutRef = z.union([z.number().int().min(1), z.literal("all")]);
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/** The operations a model may ask for. Numbers are the cut and line numbers the editor shows (1-based). */
export const opSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("remove_cut"), index: z.number().int().min(1) }),
  /** New clip-relative in/out seconds, or keep the first `lengthSec` seconds of the cut. */
  z.object({ op: z.literal("trim_cut"), index: z.number().int().min(1), startSec: z.number().min(0).optional(), endSec: z.number().min(0).optional(), lengthSec: z.number().min(0.3).optional() }),
  z.object({ op: z.literal("move_cut"), index: z.number().int().min(1), to: z.number().int().min(1) }),
  /** Replace the cut's footage with another clip (its number in the project), same length from the clip's best moment. */
  z.object({ op: z.literal("swap_clip"), index: z.number().int().min(1), clip: z.number().int().min(1) }),
  /** 0 mutes, 1 as recorded, 2 twice as loud. "silent" = every cut where no one speaks. */
  z.object({ op: z.literal("volume"), index: z.union([cutRef, z.literal("silent")]), level: z.number().min(0).max(2) }),
  z.object({ op: z.literal("speed"), index: cutRef, rate: z.number().min(SPEED_MIN).max(SPEED_MAX) }),
  z.object({ op: z.literal("zoom"), index: cutRef, kind: z.enum(["none", "in", "out"]), amount: z.number().min(1.02).max(1.6).optional() }),
  z.object({ op: z.literal("transition"), index: cutRef, kind: z.enum(TRANSITIONS.map((t) => t.id) as [string, ...string[]]) }),
  z.object({ op: z.literal("theme"), id: z.string() }),
  z.object({ op: z.literal("captions"), on: z.boolean() }),
  z.object({
    op: z.literal("caption_style"),
    preset: z.enum(CAPTION_STYLES.map((c) => c.id) as [string, ...string[]]).optional(),
    size: z.enum(["s", "m", "l"]).optional(),
    position: z.enum(["top", "middle", "lower", "bottom"]).optional(),
    highlight: hex.optional(),
    uppercase: z.boolean().optional(),
    animation: z.enum(CAPTION_ANIMATIONS.map((a) => a.id) as [string, ...string[]]).optional(),
    font: z.enum(FONTS.map((f) => f.id) as [string, ...string[]]).optional(),
    box: z.boolean().optional(),
  }),
  z.object({ op: z.literal("text_add"), text: z.string().min(1).max(120), atSec: z.number().min(0).optional(), endSec: z.number().min(0).optional(), slot: z.enum(["top", "middle", "bottom"]).optional(), role: z.enum(["opening", "mid", "cta"]).optional() }),
  z.object({ op: z.literal("text_edit"), index: z.number().int().min(1), text: z.string().min(1).max(120).optional(), atSec: z.number().min(0).optional(), endSec: z.number().min(0).optional(), slot: z.enum(["top", "middle", "bottom"]).optional() }),
  z.object({ op: z.literal("text_remove"), index: z.union([z.number().int().min(1), z.literal("all")]) }),
  z.object({ op: z.literal("end_card"), cta: z.string().max(40).optional(), location: z.string().max(60).optional(), site: z.string().max(80).optional(), off: z.boolean().optional() }),
  z.object({ op: z.literal("music"), on: z.boolean().optional(), volume: z.number().min(0).max(1).optional(), duck: z.boolean().optional() }),
  z.object({ op: z.literal("lower_third"), name: z.string().max(60).optional(), line: z.string().max(80).optional(), off: z.boolean().optional() }),
  z.object({ op: z.literal("accent"), color: hex }),
  /** A structural re-cut SOCIA makes again from the footage (the editor's Make it again), not an edit of this cut. */
  z.object({ op: z.literal("regenerate"), directive: z.enum(REGENERATE_OPTIONS.map((o) => o.id) as [string, ...string[]]) }),
]);
export type EditOp = z.infer<typeof opSchema>;

export type InstructClip = Pick<ClipForEdl, "id" | "position" | "durationSec" | "words"> & { moments?: { start: number; end: number }[] };

export type ApplyResult = {
  edl: Edl;
  /** What was done, one line each, in the person's terms. */
  done: string[];
  /** What could not be done, and why. */
  skipped: string[];
  /** A re-cut was asked for: the editor runs its Make it again with this directive after the edits above. */
  regenerate: RegenerateDirective | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

/** Every cut's output start and end (seconds), for text lines placed over a cut. */
export function cutSpans(edl: Edl): { start: number; end: number }[] {
  let t = 0;
  return edl.segments.map((s) => { const start = t; t += Math.max(0, s.out - s.in) / (s.motion?.speed?.rate ?? 1); return { start, end: t }; });
}

const spoken = (clip: InstructClip | undefined, s: Pick<EdlSegment, "in" | "out">) => Boolean(clip?.words?.some((w) => w.startMs < s.out * 1000 && w.endMs > s.in * 1000));

/**
 * The cut described for the model and the person: numbered cuts with their clip, times, sound and join;
 * numbered text lines; captions, theme, music and the ending; then the clips available.
 */
export function describeCut(edl: Edl, clips: InstructClip[]): string {
  const byId = new Map(clips.map((c) => [c.id, c]));
  const spans = cutSpans(edl);
  const cuts = edl.segments.map((s, i) => {
    const c = byId.get(s.clipId);
    const words = (c?.words ?? []).filter((w) => w.startMs < s.out * 1000 && w.endMs > s.in * 1000).map((w) => w.text).join(" ");
    const bits = [`cut ${i + 1}: ${c ? clipLabel(c.position) : "expired clip"} ${s.in.toFixed(1)}-${s.out.toFixed(1)}s (plays ${spans[i].start.toFixed(1)}-${spans[i].end.toFixed(1)}s)`];
    if (i > 0) bits.push(`join: ${s.transition ?? "cut"}`);
    bits.push(`sound: ${s.volume === 0 ? "muted" : s.volume != null ? `${Math.round(s.volume * 100)}%` : "as recorded"}`);
    if (s.motion?.speed) bits.push(`speed ${s.motion.speed.rate}x`);
    if (s.motion?.zoom) bits.push(`zoom ${s.motion.zoom.from}->${s.motion.zoom.to}`);
    bits.push(words ? `says: "${words}"` : "no speech");
    return bits.join("; ");
  });
  const text = edl.text.map((t, i) => `line ${i + 1}: "${t.text.replace(/\n/g, " / ")}" ${t.at.toFixed(1)}-${t.end.toFixed(1)}s (${t.role}${t.slot ? `, ${t.slot}` : ""})`);
  const st = edl.style;
  const lines = [
    `Length ${spans.length ? spans[spans.length - 1].end.toFixed(1) : "0"}s, ${edl.segments.length} cuts.`,
    ...cuts,
    text.length ? `Text lines:\n${text.join("\n")}` : "No text lines.",
    `Captions: ${edl.captions && !edl.captionsOff ? "on" : "off"}${st ? ` (style ${st.captions.preset}, size ${st.captions.size}, ${st.captions.position}, highlight ${st.captions.highlight}, font ${st.font}${st.captions.uppercase ? ", uppercase" : ""})` : ""}.`,
    `Theme: ${edl.theme?.id ?? "none"}. Themes available: ${THEMES.map((t) => `${t.id} (${t.name})`).join(", ")}.`,
    `Music: ${edl.soundtrack ? `on, "${edl.soundtrack.name}" at ${Math.round(edl.soundtrack.musicVolume * 100)}%${edl.soundtrack.duck ? ", ducked under speech" : ""}` : "none"}.`,
    `Ending: ${edl.endCard && (edl.endCard.cta || edl.endCard.location) ? `"${edl.endCard.cta}" / "${edl.endCard.location}" / "${edl.endCard.site}"` : "none"}.`,
    edl.lowerThird ? `Lower third: "${edl.lowerThird.name}" / "${edl.lowerThird.line}".` : "",
    `Clips in the project: ${clips.slice().sort((a, b) => a.position - b.position).map((c) => `${clipLabel(c.position)} (${c.durationSec.toFixed(1)}s${c.words?.length ? `, says "${c.words.slice(0, 8).map((w) => w.text).join(" ")}${c.words.length > 8 ? "…" : ""}"` : ""})`).join("; ")}.`,
  ];
  return lines.filter(Boolean).join("\n");
}

/** Apply the operations in order. The cut comes back checked (settleCut) when any cut changed. */
export function applyOps(edl: Edl, ops: EditOp[], clips: InstructClip[]): ApplyResult {
  const byId = new Map(clips.map((c) => [c.id, c]));
  const words = Object.fromEntries(clips.map((c) => [c.id, c.words]));
  const done: string[] = [], skipped: string[] = [];
  let out: Edl = { ...edl, segments: [...edl.segments], text: [...edl.text] };
  let regenerate: RegenerateDirective | null = null;
  let cutsChanged = false;
  const label = (i: number) => `cut ${i + 1}`;
  const segs = (ref: number | "all" | "silent"): number[] => {
    if (ref === "all") return out.segments.map((_, i) => i);
    if (ref === "silent") return out.segments.map((s, i) => (spoken(byId.get(s.clipId), s) ? -1 : i)).filter((i) => i >= 0);
    return ref >= 1 && ref <= out.segments.length ? [ref - 1] : [];
  };
  const noCut = (ref: number | string) => skipped.push(`there is no cut ${ref} (the cut has ${out.segments.length})`);
  const themed = () => Boolean(out.theme?.id);
  const styleOf = (e: Edl) => e.style ?? { font: "montserrat" as FontId, accent: "#ffd400", textBox: "outline" as const, captions: { position: "bottom" as CaptionPosition, size: "m" as CaptionSize, box: false, uppercase: false, preset: "classic" as CaptionStyleId, highlight: "#ffd60a" } };

  for (const op of ops) {
    switch (op.op) {
      case "remove_cut": {
        const [i] = segs(op.index);
        if (i == null) { noCut(op.index); break; }
        if (out.segments.length <= 1) { skipped.push("the cut needs at least one shot"); break; }
        out.segments = out.segments.filter((_, k) => k !== i); cutsChanged = true;
        done.push(`removed ${label(i)}`);
        break;
      }
      case "trim_cut": {
        const [i] = segs(op.index);
        if (i == null) { noCut(op.index); break; }
        const s = out.segments[i]; const dur = byId.get(s.clipId)?.durationSec ?? s.out;
        let inT = op.startSec != null ? clamp(op.startSec, 0, dur) : s.in;
        let outT = op.endSec != null ? clamp(op.endSec, 0, dur) : s.out;
        if (op.lengthSec != null) outT = clamp(inT + op.lengthSec, 0, dur);
        if (outT - inT < 0.3) { skipped.push(`${label(i)} would be shorter than 0.3s`); break; }
        inT = r2(inT); outT = r2(outT);
        out.segments[i] = { ...s, in: inT, out: outT }; cutsChanged = true;
        done.push(`${label(i)} now ${inT.toFixed(1)}-${outT.toFixed(1)}s (${(outT - inT).toFixed(1)}s)`);
        break;
      }
      case "move_cut": {
        const [i] = segs(op.index);
        const to = clamp(op.to, 1, out.segments.length) - 1;
        if (i == null) { noCut(op.index); break; }
        if (i === to) { done.push(`${label(i)} is already in place`); break; }
        const list = [...out.segments]; const [s] = list.splice(i, 1); list.splice(to, 0, s);
        out.segments = list; cutsChanged = true;
        done.push(`moved ${label(i)} to position ${to + 1}`);
        break;
      }
      case "swap_clip": {
        const [i] = segs(op.index);
        if (i == null) { noCut(op.index); break; }
        const clip = clips.find((c) => c.position === op.clip - 1);
        if (!clip) { skipped.push(`there is no clip ${op.clip} in this project`); break; }
        const s = out.segments[i]; const len = Math.min(s.out - s.in, clip.durationSec);
        const m = clip.moments?.[0]; const start = m ? clamp(m.start, 0, Math.max(0, clip.durationSec - len)) : 0;
        out.segments[i] = { ...s, clipId: clip.id, in: r2(start), out: r2(start + len) }; cutsChanged = true;
        done.push(`${label(i)} now plays ${clipLabel(clip.position)}`);
        break;
      }
      case "volume": {
        const idx = segs(op.index);
        if (!idx.length) { if (op.index === "silent") done.push("no cut is without speech"); else noCut(op.index); break; }
        for (const i of idx) out.segments[i] = { ...out.segments[i], volume: r2(op.level) };
        done.push(op.level === 0 ? `muted ${idx.length === out.segments.length ? "every cut" : idx.map(label).join(", ")}` : `${idx.length === out.segments.length ? "every cut" : idx.map(label).join(", ")} at ${Math.round(op.level * 100)}% sound`);
        break;
      }
      case "speed": {
        const idx = segs(op.index);
        if (!idx.length) { noCut(op.index); break; }
        for (const i of idx) { const s = out.segments[i]; const motion = { ...(s.motion ?? {}), locked: true as const, ...(op.rate === 1 ? {} : { speed: { rate: r2(op.rate), rampSec: s.motion?.speed?.rampSec ?? 0.4 } }) }; if (op.rate === 1) delete (motion as { speed?: unknown }).speed; out.segments[i] = { ...s, motion }; }
        cutsChanged = true;
        done.push(`${idx.length === out.segments.length ? "every cut" : idx.map(label).join(", ")} at ${op.rate}x`);
        break;
      }
      case "zoom": {
        const idx = segs(op.index);
        if (!idx.length) { noCut(op.index); break; }
        const far = op.amount ?? 1.1;
        for (const i of idx) {
          const s = out.segments[i]; const motion = { ...(s.motion ?? {}), locked: true as const };
          if (op.kind === "none") delete (motion as { zoom?: unknown }).zoom;
          else motion.zoom = op.kind === "in" ? { from: 1, to: far, x: 0.5, y: 0.5, ease: "inOut" } : { from: far, to: 1, x: 0.5, y: 0.5, ease: "inOut" };
          out.segments[i] = { ...s, motion };
        }
        done.push(op.kind === "none" ? `no zoom on ${idx.length === out.segments.length ? "any cut" : idx.map(label).join(", ")}` : `slow zoom ${op.kind} on ${idx.length === out.segments.length ? "every cut" : idx.map(label).join(", ")}`);
        break;
      }
      case "transition": {
        const idx = segs(op.index).filter((i) => i > 0);
        if (!idx.length) { if (op.index === 1) skipped.push("the first cut has no join before it"); else noCut(op.index); break; }
        const kind = op.kind as TransitionKind;
        for (const i of idx) { const s = { ...out.segments[i] }; if (kind === "cut") delete s.transition; else s.transition = kind; out.segments[i] = s; }
        if (op.index === "all" && themed()) out = setThemeOverride(out, { motion: { transition: kind } }, { words });
        done.push(`${idx.length >= out.segments.length - 1 ? "every join" : idx.map((i) => `the join into ${label(i)}`).join(", ")} is now ${TRANSITIONS.find((t) => t.id === kind)?.label.toLowerCase() ?? kind}`);
        break;
      }
      case "theme": {
        const id = op.id.toLowerCase().trim().replace(/\s+/g, "-");
        const theme = THEMES.find((t) => t.id === id || t.name.toLowerCase() === op.id.toLowerCase().trim());
        if (!theme || !isThemeId(theme.id)) { skipped.push(`there is no theme "${op.id}"; the themes are ${THEMES.map((t) => t.name).join(", ")}`); break; }
        out = applyTheme(out, theme, { words });
        done.push(`theme set to ${theme.name}`);
        break;
      }
      case "captions": {
        if (op.on) { const anyWords = out.segments.some((s) => (words[s.clipId] ?? []).length); if (!anyWords) { skipped.push("no clip in this cut has a transcript to caption"); break; } const { captionsOff: _o, ...rest } = out; void _o; out = { ...rest, captions: { source: "transcript" } }; done.push("captions on"); }
        else { out = { ...out, captions: null, captionsOff: true }; done.push("captions off"); }
        break;
      }
      case "caption_style": {
        const cur = styleOf(out);
        const patch: Record<string, unknown> = {};
        const caps = { ...cur.captions };
        if (op.preset) { caps.preset = op.preset as CaptionStyleId; patch.captionPreset = op.preset; }
        if (op.size) { caps.size = op.size; patch.sizeScale = op.size === "l" ? 1.2 : op.size === "s" ? 0.9 : 1; }
        if (op.position) { caps.position = op.position as CaptionPosition; patch.captionPosition = op.position; }
        if (op.highlight) { caps.highlight = op.highlight; patch.highlight = op.highlight; }
        if (op.uppercase != null) { caps.uppercase = op.uppercase; patch.transform = op.uppercase ? "upper" : "none"; }
        if (op.animation) { caps.animation = op.animation as CaptionAnimation; patch.captionAnimation = op.animation; }
        if (op.box != null) { caps.box = op.box; patch.pill = op.box; }
        const font = op.font as FontId | undefined;
        if (font) patch.font = font;
        if (!Object.keys(patch).length) { skipped.push("no caption change was named"); break; }
        out = themed() ? setThemeOverride(out, { typography: patch }, { words }) : { ...out, style: { ...cur, ...(font ? { font } : {}), captions: caps } };
        done.push(`captions: ${[op.preset && `style ${op.preset}`, op.size && `size ${op.size === "l" ? "large" : op.size === "s" ? "small" : "medium"}`, op.position, op.highlight && `highlight ${op.highlight}`, op.uppercase != null && (op.uppercase ? "uppercase" : "sentence case"), op.animation && `${op.animation} animation`, font && `font ${FONTS.find((f) => f.id === font)?.label ?? font}`, op.box != null && (op.box ? "with a box" : "no box")].filter(Boolean).join(", ")}`);
        break;
      }
      case "text_add": {
        const role = op.role ?? (out.text.some((t) => t.role === "opening") ? "mid" : "opening");
        const presetId = role === "opening" && out.theme?.id ? (THEMES.find((t) => t.id === out.theme!.id)?.typography.titlePreset as TextPresetId | undefined) : undefined;
        const preset = presetId && isTextPresetId(presetId) ? TEXT_PRESETS[presetId] : presetForRole(role);
        const fit = fitLine(op.text.trim(), preset);
        const total = cutSpans(out).at(-1)?.end ?? 0;
        const at = r2(clamp(op.atSec ?? 0, 0, Math.max(0, total - 0.5)));
        const end = r2(clamp(op.endSec ?? at + 2.5, at + 0.5, Math.max(at + 0.5, total)));
        const line: EdlText = { id: `t${Date.now().toString(36)}${out.text.length}`, at, end, text: fit.text, role, presetId: fit.preset.id, ...(op.slot ? { slot: op.slot } : fit.slot ? { slot: fit.slot } : {}), ...(fit.shortened ? { shortened: true as const } : {}) };
        out = { ...out, text: [...out.text, line].sort((a, b) => a.at - b.at) };
        done.push(`added the line "${fit.text.replace(/\n/g, " / ")}" at ${at.toFixed(1)}-${end.toFixed(1)}s${fit.shortened ? " (shortened to fit)" : ""}`);
        break;
      }
      case "text_edit": {
        const i = op.index - 1; const t = out.text[i];
        if (!t) { skipped.push(`there is no line ${op.index} (the cut has ${out.text.length})`); break; }
        const next: EdlText = { ...t };
        if (op.text) { const fit = fitLine(op.text.trim(), isTextPresetId(t.presetId) ? TEXT_PRESETS[t.presetId] : presetForRole(t.role)); next.text = fit.text; next.presetId = fit.preset.id; if (fit.shortened) next.shortened = true; else delete next.shortened; }
        if (op.atSec != null) next.at = r2(Math.max(0, op.atSec));
        if (op.endSec != null) next.end = r2(Math.max(next.at + 0.5, op.endSec));
        if (next.end <= next.at) next.end = r2(next.at + 2);
        if (op.slot) next.slot = op.slot;
        out = { ...out, text: out.text.map((x, k) => (k === i ? next : x)) };
        done.push(`line ${op.index} is now "${next.text.replace(/\n/g, " / ")}" at ${next.at.toFixed(1)}-${next.end.toFixed(1)}s`);
        break;
      }
      case "text_remove": {
        if (op.index === "all") { if (!out.text.length) { done.push("there were no lines"); break; } out = { ...out, text: [] }; done.push("removed every text line"); break; }
        const i = op.index - 1;
        if (!out.text[i]) { skipped.push(`there is no line ${op.index} (the cut has ${out.text.length})`); break; }
        out = { ...out, text: out.text.filter((_, k) => k !== i) };
        done.push(`removed line ${op.index}`);
        break;
      }
      case "end_card": {
        if (op.off) { const { endCard: _e, ...rest } = out; void _e; out = rest; done.push("no ending card"); break; }
        const cur = out.endCard ?? { location: "", cta: "", site: "" };
        const card = { location: op.location ?? cur.location, cta: op.cta ?? cur.cta, site: op.site ?? cur.site };
        out = { ...out, endCard: card };
        done.push(`ending: "${card.cta}"${card.location ? ` in ${card.location}` : ""}${card.site ? `, ${card.site}` : ""}`);
        break;
      }
      case "music": {
        if (op.on === false) { if (!out.soundtrack) { done.push("there was no music"); break; } const { soundtrack: _s, ...rest } = out; void _s; out = rest; done.push("music off"); break; }
        if (!out.soundtrack) { skipped.push(op.on ? "no sound is in this cut yet; drop one or pick one from your playlist in Sound" : "there is no music to change"); break; }
        const st = { ...out.soundtrack };
        if (op.volume != null) st.musicVolume = r2(op.volume);
        if (op.duck != null) { if (op.duck) st.duck = true; else delete st.duck; }
        out = { ...out, soundtrack: st };
        done.push(`music ${op.volume != null ? `at ${Math.round(st.musicVolume * 100)}%` : ""}${op.duck != null ? `${op.volume != null ? ", " : ""}${op.duck ? "ducked under speech" : "one level throughout"}` : ""}`.trim());
        break;
      }
      case "lower_third": {
        if (op.off) { const { lowerThird: _l, ...rest } = out; void _l; out = rest; done.push("no lower third"); break; }
        const cur = out.lowerThird ?? { name: "", line: "" };
        out = { ...out, lowerThird: { name: op.name ?? cur.name, line: op.line ?? cur.line } };
        done.push(`lower third: "${out.lowerThird!.name}" / "${out.lowerThird!.line}"`);
        break;
      }
      case "accent": {
        out = themed() ? setThemeOverride(out, { color: { accent: op.color } }, { words }) : { ...out, style: { ...styleOf(out), accent: op.color } };
        done.push(`brand colour ${op.color}`);
        break;
      }
      case "regenerate": {
        regenerate = op.directive as RegenerateDirective;
        done.push(`SOCIA makes it again: ${REGENERATE_OPTIONS.find((o) => o.id === op.directive)?.label.toLowerCase() ?? op.directive}`);
        break;
      }
    }
  }
  if (cutsChanged) {
    const forCheck = clips.map((c) => ({ ...c, silences: null, medianLuma: null, warmth: null, brightness: null, contrastLevel: null, rmsDb: null, audioLevel: null, hasSpeech: Boolean(c.words?.length) })) as ClipForEdl[];
    out = settleCut(out, forCheck, { keepTransitions: true }).edl;
  }
  return { edl: out, done, skipped, regenerate };
}

/** Read a model's answer: every operation that fits the schema, in order; the rest are named. */
export function parseOps(raw: unknown): { ops: EditOp[]; rejected: number } {
  const list = Array.isArray(raw) ? raw : [];
  const ops: EditOp[] = []; let rejected = 0;
  for (const item of list) { const p = opSchema.safeParse(item); if (p.success) ops.push(p.data); else rejected++; }
  return { ops, rejected };
}
