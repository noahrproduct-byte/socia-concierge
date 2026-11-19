// Graphic scenes: short animated cards over the top of the picture, timed to
// what is said. Three kinds, and every word on them is a word that was spoken
// in the cut (nothing is written by a model, nothing is invented):
//   stat   a figure that was said, big, with the words it counts under it;
//   change two figures said as a change ("from 65 seconds to 38"): the old
//          one is struck out and the new one lands;
//   steps  a list said in order ("first ... second ... third"), each row
//          landing as its line is spoken;
//   line   a short sentence that carries the point, word by word.
// A scene is anchored to the word it starts on (captionKey: the clip and the
// word's time in it), not to a time in the output, so it stays on its words
// through trims and moves, and goes when its words are cut out. Pure,
// unit-tested (scenes.test.ts). Drawn by components/studio/remotion/SceneLayer.tsx.
import { captionKey } from "./captionMotion";
import { iconFor, isSceneIcon, type SceneIconId } from "./sceneIcons";
import { sanitizeArt, type SceneArt } from "./sceneArt";
import { FX_LINE_MAX, FX_TEXT_MAX, SCENE_FX, isSceneFx, type SceneFxId } from "./sceneFx";
import { captionsForEdl, FPS, timeline, type CaptionLike } from "./timeline";
import type { Edl, TranscriptWord } from "./types";

export type SceneKind = "stat" | "change" | "steps" | "line" | "picture" | "effect";
/** Where a card sits so it clears the person's head: at the top, a little lower, or under the middle of the frame. */
export type ScenePlace = "top" | "upper" | "lower";
export const SCENE_PLACES: ScenePlace[] = ["top", "upper", "lower"];
export const MAX_PICTURES = 4;
export type SceneItem = { /** the word the row lands on */ key: string; text: string };
export type EdlScene = {
  id: string;
  kind: SceneKind;
  /** the word it comes on with (lib/studioClips/captionMotion.ts captionKey) */
  key: string;
  /** how long it stays, seconds (a list stays until its last row has been read) */
  dur: number;
  /** stat: the figure. change: the figure it became. line: the sentence. steps: unused ("") */
  text: string;
  /** change: the figure it was */
  was?: string;
  /** stat: the words the figure counts */
  label?: string;
  /** steps: the rows, in the order said */
  items?: SceneItem[];
  /** a small line drawing that says what the card is about (lib/studioClips/sceneIcons.ts); not on a list */
  icon?: SceneIconId;
  /** effect: which one (lib/studioClips/sceneFx.ts) */
  fx?: SceneFxId;
  /** effect: its extra lines (headlines on a news wall, lines on a phone) */
  lines?: string[];
  /** picture: what is drawn (lib/studioClips/sceneArt.ts) */
  art?: SceneArt[];
  /** where the card sits, when the picture was looked at (lib/studioClips/placement.ts); absent = the cut's default */
  place?: ScenePlace;
};

export const MAX_SCENES = 6;
export const SCENE_TEXT_MAX = 60;
export const SCENE_LABEL_MAX = 40;
export const SCENE_ITEMS_MAX = 5;
const KEY = /^[\w-]{1,64}@\d{1,9}$/;
const KINDS: SceneKind[] = ["stat", "change", "steps", "line", "picture", "effect"];

/** The opening seconds belong to the hook line, the last to the ending. */
const HEAD_SEC = 3, TAIL_SEC = 2.5;
/** The picture is left alone this long after a scene before the next comes on, and a scene is never closer than CLEAR_SEC to a text line. */
const GAP_SEC = 1, CLEAR_SEC = 0.4;
const STAT_SEC = 2.4, LINE_MIN_SEC = 1.6, LINE_MAX_SEC = 3.5, ROW_HOLD_SEC = 1.6, STEPS_MAX_SEC = 14;
const LINE_MIN_WORDS = 3, LINE_MAX_WORDS = 7, ROW_MAX_WORDS = 5, LABEL_MAX_WORDS = 4;

const r2 = (n: number) => Math.round(n * 100) / 100;
const bare = (s: string) => s.trim().replace(/^["'“‘(]+|["'”’),;:]+$/g, "");
const plain = (s: string) => bare(s).replace(/[.!?]+$/, "");
const ends = (s: string) => /[.!?]["'”’)]*$/.test(s.trim());

/** A figure as it is said in a transcript: 200, 1,500, 4.5, $9, 30%, 10x, 3k. A bare year or a single digit is not one. */
const FIGURE = /^[$£€]?\d[\d,]*(\.\d+)?(%|x|k|m|\+)?$/i;
const YEAR = /^(19|20)\d\d$/;
const UNIT = /^(percent|dollars|bucks|cents|million|billion|thousand|hundred|times|hours|minutes|seconds|days|weeks|months|years|people|customers|clients|views|followers|orders|sales|calories|grams|pounds|miles|stars)$/i;
/** How a list is counted out loud. */
const ORDINALS: Record<string, number> = { first: 1, firstly: 1, second: 2, secondly: 2, third: 3, thirdly: 3, fourth: 4, fifth: 5 };
const COUNTED = /^(number|step|tip|rule|reason|lesson|mistake)$/i;
const CARDINAL: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5 };
const POINT_WORDS = /\b(free|save|secret|never|nobody|stop|mistake|best|worst|why|truth|wrong|only|every|always|without|nothing|everything|biggest|fastest|easiest)\b/i;
/** A label stops before one of these, and never ends on a small word or one of TRAILING. */
const JOINER = /^(and|but|so|because|that|which|when|if|then|while|or)$/i;
const TRAILING = /^(from|with|for|in|on|at|to|of|by|per|a|an|the|this|that|these|those|our|my|your|is|are)$/i;
/** The words a figure counts: up to LABEL_MAX_WORDS in order, cut where the sentence moves on, tidied at the end. */
function labelOf(wordsIn: string[]): string {
  const out: string[] = [];
  for (const w of wordsIn) { if (JOINER.test(w) || out.length >= LABEL_MAX_WORDS) break; out.push(w); }
  while (out.length > 1 && TRAILING.test(out[out.length - 1])) out.pop();
  return out.join(" ");
}
const SMALL = /^(a|an|the|and|or|but|so|to|of|in|on|at|is|it|its|it's|that|this|we|i|you|they|he|she|for|with|as|by|be|are|was|were)$/i;

type Tok = { text: string; startMs: number; endMs: number; key: string };
type Found = EdlScene & { at: number; rank: number };

/** The words of the cut in output order, each with its key, as the captions show them. */
export function tokens(edl: Edl, words: Record<string, TranscriptWord[] | null | undefined>): Tok[] {
  const { voiceover: _vo, ...own } = edl; void _vo;
  return captionsForEdl({ ...own, captions: { source: "transcript" } } as Edl, words)
    .filter((c): c is CaptionLike & { key: string } => typeof c.key === "string")
    .map((c) => ({ text: c.text.trim(), startMs: c.startMs, endMs: c.endMs, key: c.key }))
    .filter((t) => t.text)
    .sort((a, b) => a.startMs - b.startMs);
}

/** Sentences as index ranges [from, to] over the tokens: a sentence ends on its punctuation or on a pause of over a second. */
function sentenceRanges(toks: Tok[]): [number, number][] {
  const out: [number, number][] = [];
  let from = 0;
  for (let i = 0; i < toks.length; i++) {
    const last = i === toks.length - 1;
    if (last || ends(toks[i].text) || toks[i + 1].startMs - toks[i].endMs > 1000) { out.push([from, i]); from = i + 1; }
  }
  return out;
}

const phrase = (toks: Tok[], from: number, to: number) => toks.slice(from, to + 1).map((t) => t.text).join(" ").replace(/\s+/g, " ").trim();

function findStats(toks: Tok[], ranges: [number, number][]): Found[] {
  const out: Found[] = [];
  for (const [a, b] of ranges) {
    for (let i = a; i <= b; i++) {
      const w = bare(toks[i].text).replace(/[.!?]+$/, "");
      if (!FIGURE.test(w) || YEAR.test(w)) continue;
      let figure = w, next = i + 1;
      const unit = next <= b ? plain(toks[next].text) : "";
      if (/^percent$/i.test(unit)) { figure = `${w}%`; next += 1; }
      // A lone small number with nothing after it ("step 2") says nothing on its own.
      const strong = /[$£€%xkm+,.]/i.test(figure) || figure.replace(/\D/g, "").length >= 2;
      const after = toks.slice(next, b + 1).map((t) => plain(t.text)).filter(Boolean);
      const before = toks.slice(Math.max(a, i - 3), i).map((t) => plain(t.text)).filter(Boolean);
      // What the figure counts: the words after it in its sentence, else the ones before it.
      const label = after.length ? labelOf(after) : before.join(" ");
      if (!label || (!strong && !UNIT.test(after[0] ?? ""))) continue;
      if (COUNTED.test(before[before.length - 1] ?? "")) continue;
      out.push({ id: "", kind: "stat", key: toks[i].key, dur: STAT_SEC, text: figure.slice(0, SCENE_TEXT_MAX), label: label.slice(0, SCENE_LABEL_MAX), at: toks[i].startMs / 1000, rank: 2 });
      break;
    }
  }
  return out;
}

/** A change said with its two figures: "from 65 seconds to 38", "went from $200 to $90 a week". */
function findChanges(toks: Tok[], ranges: [number, number][]): Found[] {
  const out: Found[] = [];
  const fig = (i: number) => { const w = bare(toks[i].text).replace(/[.!?]+$/, ""); return FIGURE.test(w) && !YEAR.test(w) ? w : null; };
  for (const [a, b] of ranges) {
    for (let i = a; i + 3 <= b; i++) {
      if (!/^from$/i.test(plain(toks[i].text))) continue;
      const was = fig(i + 1);
      if (!was) continue;
      // The unit may be said after the first figure ("from 65 seconds to 38").
      let j = i + 2, unit = "";
      if (j <= b && !/^to$/i.test(plain(toks[j].text))) { unit = plain(toks[j].text); j += 1; }
      if (j + 1 > b || !/^to$/i.test(plain(toks[j].text))) continue;
      const now = fig(j + 1);
      if (!now) continue;
      const after = toks.slice(j + 2, b + 1).map((t) => plain(t.text)).filter(Boolean);
      const label = labelOf(after) || unit;
      out.push({ id: "", kind: "change", key: toks[i + 1].key, dur: STAT_SEC + 0.6, text: now.slice(0, SCENE_TEXT_MAX), was: was.slice(0, SCENE_TEXT_MAX), ...(label ? { label: label.slice(0, SCENE_LABEL_MAX) } : {}), at: toks[i + 1].startMs / 1000, rank: 2.5 });
      break;
    }
  }
  return out;
}

/** A list counted out loud: rows where the count runs 1, 2, 3 in order. */
function findSteps(toks: Tok[], ranges: [number, number][]): Found[] {
  type Row = { n: number; from: number; to: number };
  const rows: Row[] = [];
  for (const [a, b] of ranges) {
    const w0 = plain(toks[a].text).toLowerCase(), w1 = a + 1 <= b ? plain(toks[a + 1].text).toLowerCase() : "";
    let n = 0, from = a;
    if (ORDINALS[w0]) { n = ORDINALS[w0]; from = a + 1; }
    else if (COUNTED.test(w0) && CARDINAL[w1]) { n = CARDINAL[w1]; from = a + 2; }
    if (!n || from > b) continue;
    // "First of all" and a comma after the count are not part of the row.
    while (from <= b && /^(of|all|up|off|thing|is|,)$/i.test(plain(toks[from].text))) from += 1;
    if (from > b) continue;
    rows.push({ n, from, to: Math.min(b, from + ROW_MAX_WORDS - 1) });
  }
  const out: Found[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].n !== 1) continue;
    const run = [rows[i]];
    for (let j = i + 1; j < rows.length && rows[j].n === run.length + 1 && run.length < SCENE_ITEMS_MAX; j++) run.push(rows[j]);
    if (run.length < 2) continue;
    const first = toks[run[0].from], last = toks[run[run.length - 1].to];
    const dur = Math.min(STEPS_MAX_SEC, (last.endMs - first.startMs) / 1000 + ROW_HOLD_SEC);
    out.push({ id: "", kind: "steps", key: first.key, dur: r2(dur), text: "", items: run.map((r) => ({ key: toks[r.from].key, text: phrase(toks, r.from, r.to).replace(/[.!?,;:]+$/, "").slice(0, SCENE_TEXT_MAX) })), at: first.startMs / 1000, rank: 3 });
    i += run.length - 1;
  }
  return out;
}

function findLines(toks: Tok[], ranges: [number, number][]): Found[] {
  const out: Found[] = [];
  for (const [a, b] of ranges) {
    const n = b - a + 1;
    if (n < LINE_MIN_WORDS || n > LINE_MAX_WORDS) continue;
    const text = phrase(toks, a, b);
    if (!POINT_WORDS.test(text) && !/\?["'”’)]*$/.test(text)) continue;
    // A sentence of small words only ("so that is it") carries nothing.
    if (toks.slice(a, b + 1).every((t) => SMALL.test(plain(t.text)))) continue;
    const dur = Math.min(LINE_MAX_SEC, Math.max(LINE_MIN_SEC, (toks[b].endMs - toks[a].startMs) / 1000 + 0.5));
    out.push({ id: "", kind: "line", key: toks[a].key, dur: r2(dur), text: text.replace(/[.,;:]+$/, "").slice(0, SCENE_TEXT_MAX), at: toks[a].startMs / 1000, rank: 1 });
  }
  return out;
}

/**
 * The scenes a cut's own words support, in the order they are said. A list
 * wins over a figure, a figure over a line; scenes keep clear of the opening
 * line, the ending, every text line on the video, and each other.
 */
export function findScenes(edl: Edl, words: Record<string, TranscriptWord[] | null | undefined>): EdlScene[] {
  const toks = tokens(edl, words);
  if (toks.length < LINE_MIN_WORDS) return [];
  const total = timeline(edl).durationSec;
  const ranges = sentenceRanges(toks);
  const busy = edl.text.filter((t) => t.text.trim()).map((t) => [t.at - CLEAR_SEC, t.end + CLEAR_SEC] as [number, number]);
  const free = (at: number, dur: number) => at >= HEAD_SEC && at + dur <= total - TAIL_SEC && !busy.some(([s, e]) => at < e && at + dur > s);
  const found = [...findSteps(toks, ranges), ...findChanges(toks, ranges), ...findStats(toks, ranges), ...findLines(toks, ranges)].filter((f) => free(f.at, Math.min(f.dur, STAT_SEC)));
  // The strongest first, then anything that doesn't crowd one already taken.
  const taken: Found[] = [];
  for (const f of found.sort((x, y) => y.rank - x.rank || x.at - y.at)) {
    if (taken.length >= MAX_SCENES) break;
    if (taken.some((t) => (f.at >= t.at ? f.at < t.at + t.dur + GAP_SEC : t.at < f.at + f.dur + GAP_SEC))) continue;
    taken.push(f);
  }
  return taken.sort((x, y) => x.at - y.at).map(({ at: _at, rank: _rank, ...s }, i) => {
    void _at; void _rank;
    // The icon the card's own words call for (none on a list, whose rows carry their numbers).
    const icon = s.kind === "steps" ? undefined : iconFor(`${s.text} ${s.label ?? ""}`);
    return { ...s, id: `g${i + 1}`, ...(icon ? { icon } : {}) };
  });
}

export type SceneSpan = { scene: EdlScene; from: number; durationInFrames: number; /** steps: the frame each row lands on, counted from `from`; a row whose words were cut is left out */ rows: { text: string; at: number }[] };

/** Where each scene sits on the output timeline now. A scene whose word is no longer in the cut is not there. */
export function sceneSpans(edl: Edl, words: Record<string, TranscriptWord[] | null | undefined>, fps: number = FPS): SceneSpan[] {
  if (!edl.scenes?.length) return [];
  const at = new Map<string, number>();
  for (const t of tokens(edl, words)) if (!at.has(t.key)) at.set(t.key, t.startMs);
  const total = timeline(edl).durationFrames;
  const out: SceneSpan[] = [];
  for (const scene of edl.scenes) {
    const rows = (scene.items ?? []).flatMap((it) => (at.has(it.key) ? [{ text: it.text, ms: at.get(it.key)! }] : []));
    const startMs = scene.kind === "steps" ? (rows.length ? Math.min(...rows.map((r) => r.ms)) : undefined) : at.get(scene.key);
    if (startMs == null) continue;
    const from = Math.round((startMs / 1000) * fps);
    const frames = Math.min(Math.round(scene.dur * fps), total - from);
    if (frames < Math.round(fps * 0.8)) continue;
    out.push({ scene, from, durationInFrames: frames, rows: rows.sort((a, b) => a.ms - b.ms).map((r) => ({ text: r.text, at: Math.max(0, Math.round((r.ms / 1000) * fps) - from) })) });
  }
  // One scene at a time: a later one never starts under an earlier one.
  out.sort((a, b) => a.from - b.from);
  return out.filter((s, i) => i === 0 || s.from >= out[i - 1].from + out[i - 1].durationInFrames);
}

export type CutoutSpan = { /** the scene and the cut it is over */ id: string; seg: number; from: number; frames: number; /** frames into the cut where it starts */ offset: number };

/**
 * Where the person is drawn again above a scene: the part of each cut a scene
 * runs over. A cut whose speed was changed is left out (its frames don't map
 * one to one), and so is a sliver shorter than three frames.
 */
export function cutoutSpans(spans: SceneSpan[], segments: { startFrame: number; durationFrames: number; motion?: { speed?: { rate: number } } }[]): CutoutSpan[] {
  const out: CutoutSpan[] = [];
  for (const sp of spans) {
    segments.forEach((s, seg) => {
      if (s.motion?.speed && s.motion.speed.rate !== 1) return;
      const from = Math.max(sp.from, s.startFrame), to = Math.min(sp.from + sp.durationInFrames, s.startFrame + s.durationFrames);
      if (to - from >= 3) out.push({ id: `${sp.scene.id}-${seg}`, seg, from, frames: to - from, offset: from - s.startFrame });
    });
  }
  return out;
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/—/g, ",").replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Scenes from anywhere (the browser, stored JSON), bounded; undefined when there are none. */
export function sanitizeScenes(v: unknown, clipIds: Set<string>): EdlScene[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const okKey = (k: unknown): k is string => typeof k === "string" && KEY.test(k) && clipIds.has(k.slice(0, k.lastIndexOf("@")));
  const out: EdlScene[] = [];
  for (const raw of v.slice(0, 24)) {
    if (!raw || typeof raw !== "object" || out.length >= MAX_SCENES) continue;
    const o = raw as Record<string, unknown>;
    const kind = KINDS.find((k) => k === o.kind);
    if (!kind || !okKey(o.key) || typeof o.dur !== "number" || !Number.isFinite(o.dur)) continue;
    const scene: EdlScene = { id: `g${out.length + 1}`, kind, key: o.key, dur: r2(Math.min(STEPS_MAX_SEC, Math.max(0.8, o.dur))), text: str(o.text, SCENE_TEXT_MAX) };
    if (kind === "stat" || kind === "change") { const label = str(o.label, SCENE_LABEL_MAX); if (label) scene.label = label; }
    if (kind === "change") { const was = str(o.was, SCENE_TEXT_MAX); if (!was) continue; scene.was = was; }
    if (kind !== "steps" && kind !== "picture" && isSceneIcon(o.icon)) scene.icon = o.icon;
    if (kind === "effect") {
      if (!isSceneFx(o.fx)) continue;
      scene.fx = o.fx; scene.text = str(o.text, FX_TEXT_MAX);
      const label = str(o.label, SCENE_LABEL_MAX); if (label) scene.label = label;
      const lines = (Array.isArray(o.lines) ? o.lines : []).map((l) => str(l, FX_LINE_MAX)).filter(Boolean).slice(0, SCENE_FX[o.fx].lines);
      if (lines.length) scene.lines = lines;
      scene.dur = r2(Math.min(5, scene.dur));
      out.push(scene);
      continue;
    }
    if (kind === "picture") { const art = sanitizeArt(o.art); if (!art.length) continue; scene.art = art; const label = str(o.label, SCENE_LABEL_MAX); if (label) scene.label = label; }
    const place = SCENE_PLACES.find((p) => p === o.place);
    if (place) scene.place = place;
    if (kind === "steps") {
      const items = (Array.isArray(o.items) ? o.items : []).flatMap((it) => { const r = it as Record<string, unknown> | null; const text = str(r?.text, SCENE_TEXT_MAX); return r && okKey(r.key) && text ? [{ key: r.key, text }] : []; }).slice(0, SCENE_ITEMS_MAX);
      if (items.length < 2) continue;
      scene.items = items;
    } else if (!scene.text) continue;
    out.push(scene);
  }
  return out.length ? out : undefined;
}

/** What a scene shows, in a few words, for a list. */
export const sceneSummary = (s: EdlScene): string => (s.kind === "change" ? `${s.was ?? ""} to ${s.text}${s.label ? ` ${s.label}` : ""}` : s.kind === "stat" ? `${s.text}${s.label ? ` ${s.label}` : ""}` : s.kind === "steps" ? (s.items ?? []).map((i) => i.text).join(" · ") : s.text);
export const SCENE_KIND_LABEL: Record<SceneKind, string> = { stat: "Figure", change: "Before and after", steps: "List", line: "Key line", picture: "Picture", effect: "Effect" };
export { captionKey };

/**
 * Picture scenes put onto a cut that may already have scenes: the pictures go in, and any scene that
 * would be on screen with one, or within a second of it, comes out (a picture was asked for or chosen
 * for that moment; a card found by rule was not). Six scenes at most, pictures first.
 */
export function withPictures(edl: Edl, pictures: EdlScene[], words: Record<string, TranscriptWord[] | null | undefined>): EdlScene[] {
  const pics = sceneSpans({ ...edl, scenes: pictures.slice(0, MAX_SCENES) }, words);
  const gap = Math.round(GAP_SEC * FPS);
  const others = sceneSpans({ ...edl, scenes: (edl.scenes ?? []).filter((s) => s.kind !== "picture" && s.kind !== "effect") }, words)
    .filter((o) => !pics.some((p) => o.from < p.from + p.durationInFrames + gap && p.from < o.from + o.durationInFrames + gap));
  return [...pics, ...others.slice(0, Math.max(0, MAX_SCENES - pics.length))].sort((a, b) => a.from - b.from).map((x, i) => ({ ...x.scene, id: `g${i + 1}` }));
}

const FIGURE_LIKE = /^[$£€]?\d[\d,.]*(%|x|k|m|\+)?$/i;
/** The word that carries a stretch of speech: its longest word that is not a small one. */
const salient = (toks: Tok[]): string => toks.map((t) => plain(t.text).replace(/[^\p{L}\p{N}'-]/gu, "")).filter((w) => w && !SMALL.test(w)).reduce((best, w) => (w.length > best.length ? w : best), "");

/**
 * An effect scene on the word being said at `sec` of the cut (the next word, if none is being said), with
 * its words taken from what is said there: the word that carries the line for a cover, a glass word or a
 * cut-out; the figure said for a graph; the line itself for a headline. Null when the cut has no words.
 */
export function effectAt(edl: Edl, words: Record<string, TranscriptWord[] | null | undefined>, fx: SceneFxId, sec: number): EdlScene | null {
  const toks = tokens(edl, words);
  if (!toks.length) return null;
  let i = toks.findIndex((t) => t.endMs / 1000 > sec);
  if (i < 0) i = toks.length - 1;
  const near = toks.slice(i, i + 8);
  const word = salient(near).slice(0, FX_TEXT_MAX);
  const line = near.slice(0, 5).map((t) => plain(t.text)).join(" ").slice(0, FX_LINE_MAX);
  const figure = toks.slice(i, i + 14).map((t) => plain(t.text)).find((w) => FIGURE_LIKE.test(w));
  const half = (from: number) => near.slice(from, from + 3).map((t) => plain(t.text)).join(" ").slice(0, FX_TEXT_MAX);
  if (fx === "compare") return { id: "new", kind: "effect", fx, key: toks[i].key, dur: 3.6, text: half(0), ...(half(3) ? { label: half(3) } : {}) };
  if (fx === "title") return { id: "new", kind: "effect", fx, key: toks[i].key, dur: 3, text: near.slice(0, 3).map((t) => plain(t.text)).join(" ").slice(0, FX_TEXT_MAX) };
  if (fx === "stamp" || fx === "comment" || fx === "keys") return { id: "new", kind: "effect", fx, key: toks[i].key, dur: 3, text: fx === "keys" ? "cmd+k" : word };
  if (fx === "bars" || fx === "table" || fx === "flow" || fx === "code") return { id: "new", kind: "effect", fx, key: toks[i].key, dur: 4, text: fx === "code" ? "terminal" : half(0), lines: fx === "flow" ? [half(3)].filter(Boolean) : fx === "code" ? [line] : [half(0), half(3)].filter(Boolean) };
  if (fx === "chat" || fx === "notify" || fx === "search" || fx === "button") return { id: "new", kind: "effect", fx, key: toks[i].key, dur: fx === "chat" || fx === "notify" ? 4 : 3.2, text: (fx === "button" ? half(0) : line).slice(0, FX_TEXT_MAX) };
  const text = fx === "ribbon" ? word.replace(/^\p{Ll}/u, (c) => c.toUpperCase()) : fx === "cover" || fx === "glass" || fx === "paper" || fx === "canvas" ? word : fx === "graph" ? (figure ?? "").slice(0, 6) : fx === "news" ? line.slice(0, FX_TEXT_MAX) : fx === "reveal" || fx === "phone" ? word : "";
  const lines = fx === "phone" ? [line].filter(Boolean) : [];
  return { id: "new", kind: "effect", fx, key: toks[i].key, dur: fx === "ribbon" ? 3.6 : 3, text, ...(fx === "ribbon" && line ? { label: line.slice(0, SCENE_LABEL_MAX) } : {}), ...(lines.length ? { lines } : {}) };
}

/** A scene put onto a cut: whatever would be on screen with it, or within a second of it, comes out. Sorted by when they show. */
export function addScene(edl: Edl, words: Record<string, TranscriptWord[] | null | undefined>, scene: EdlScene): EdlScene[] {
  const [mine] = sceneSpans({ ...edl, scenes: [scene] }, words);
  if (!mine) return edl.scenes ?? [];
  const gap = Math.round(GAP_SEC * FPS);
  const kept = sceneSpans(edl, words).filter((o) => !(o.from < mine.from + mine.durationInFrames + gap && mine.from < o.from + o.durationInFrames + gap));
  return [...kept, mine].sort((a, b) => a.from - b.from).slice(0, MAX_SCENES).map((x, k) => ({ ...x.scene, id: `g${k + 1}` }));
}
