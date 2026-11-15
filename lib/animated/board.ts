// The storyboard: one scene language SOCIA's writer composes a whole animated
// video in, so each account gets a format built for it instead of one of a
// few fixed templates (Noah, 2026-11-15: "SOCIA should be able to build any
// type of format for any account"). The writer places building blocks on a
// stage (points, characters with poses, shapes, tags, markers, stamps, a
// counter, a meter) and ties every change to a caption phrase; the engine
// owns the frame, the type, the timing and the colours (the account's look),
// and components/animated/BoardScene.tsx draws it. Pure and browser-safe.
import { inventsNumbers, numberTokens } from "./spec";

/** The stage, in its own coordinates: x 0..STAGE_W, y 0..STAGE_H (top to bottom). The floor line is at FLOOR_Y. */
export const STAGE_W = 1080;
export const STAGE_H = 760;
export const FLOOR_Y = 704;
/** Seconds the end card stays up. */
export const END_SECONDS = 5.2;

/** A moment: `dt` seconds after caption phrase `ph` starts. ph = number of phrases means when the end card comes in. */
export type At = { ph: number; dt: number };
export const TONES = ["fg", "dim", "key", "accent", "bad"] as const;
export type Tone = (typeof TONES)[number];

export type BoardPoint = { name: string; x: number; y: number; draw: "hold" | "dot" | "none"; tone: Tone };
/** A character's pose: where the hips are, the lean in degrees, and the point each hand and foot is on ("" = relaxed). */
export type FigureKey = { at: At; x: number; y: number; lean: number; lh: string; rh: string; lf: string; rf: string; o: number };
export type BoardFigure = { id: string; scale: number; tone: Tone; keys: FigureKey[] };
export type ShapeKey = { at: At; x: number; y: number; w: number; h: number; rot: number; o: number };
export const SHAPES = ["rect", "ellipse", "triangle"] as const;
export type BoardShape = { shape: (typeof SHAPES)[number]; tone: Tone; keys: ShapeKey[] };
export type BoardTag = { text: string; tone: Tone; x: number; y: number; from: At; to: At };
export type BoardMarker = { label: string; point: string; at: At };
export type BoardStamp = { text: string; tone: Tone; x: number; y: number; at: At };
/** A dashed line from a character's hand to a point, with a label: a gap, a distance, a target. */
export type BoardLink = { figure: string; hand: "lh" | "rh"; point: string; label: string; tone: Tone; from: At; to: At };
export type BoardCard = { title: string; lines: string[]; x: number; y: number; w: number; from: At; to: At };
export const END_ICONS = ["chat", "follow", "send"] as const;
/** The longest line of an ending row. */
export const END_LINE = 40;

export type Storyboard = {
  version: 1;
  /** The captions, a phrase at a time; `em` is the words in it to set in the key colour. */
  phrases: { text: string; em: string }[];
  /** The small label top left, changing as the story moves. */
  chapters: { ph: number; label: string }[];
  /** Shown beside the chapter when numbers are illustrative ("Example heights"); "" when none are. */
  example: string;
  counter: { label: string; steps: { at: At; value: number }[]; goodAt: At } | null;
  meter: { label: string; keys: { at: At; value: number }[]; goodAt: At } | null;
  set: { floor: boolean; panels: boolean; spots: boolean; scatter: number };
  points: BoardPoint[];
  figures: BoardFigure[];
  shapes: BoardShape[];
  tags: BoardTag[];
  markers: BoardMarker[];
  stamps: BoardStamp[];
  links: BoardLink[];
  cards: BoardCard[];
  /** A scan line that sweeps down the stage and lights the drawn points; ph -1 for none. */
  sweep: { from: At; to: At };
  /** One flash of the accent colour, at the story's turn; ph -1 for none. */
  flash: At;
  end: { eyebrow: string; title: [string, string]; rows: { icon: (typeof END_ICONS)[number]; a: string; b: string }[] };
};

// ------------------------------------------------------------------ timing ----

const bare = (w: string) => w.replace(/[^\p{L}\p{N}']/gu, "");
/** How long a word takes to say at a natural pace, with the pause its punctuation asks for. */
const wordSeconds = (w: string) => 0.17 + 0.042 * bare(w).length + (/[.?!]["”']?$/.test(w) ? 0.28 : /[,;:]$/.test(w) ? 0.12 : 0);

export type BoardWord = { w: string; t: number; em: boolean };
export type BoardTimeline = { phrases: { start: number; end: number; words: BoardWord[] }[]; card: number; total: number };

/**
 * When every word appears. Without a voiceover the pace is a natural reading
 * pace; with one (`spoken`: each word's real start), the captions follow it.
 */
export function boardTimeline(board: Pick<Storyboard, "phrases">, spoken?: number[] | null): BoardTimeline {
  let t = 0.1, k = 0;
  const phrases = board.phrases.map((p) => {
    const em = new Set(p.em.toLowerCase().split(/\s+/).map(bare).filter(Boolean));
    const start = spoken?.[k] ?? t;
    const words = p.text.split(/\s+/).filter(Boolean).map((w) => {
      const at = spoken?.[k] ?? t;
      k++;
      t = at + wordSeconds(w);
      return { w, t: at, em: em.has(bare(w).toLowerCase()) };
    });
    return { start, end: t, words };
  });
  // Each phrase stays until the next one starts.
  for (let i = 0; i < phrases.length - 1; i++) phrases[i].end = phrases[i + 1].start;
  const card = (phrases[phrases.length - 1]?.end ?? 0) + 0.25;
  return { phrases, card, total: card + END_SECONDS };
}

/** A moment in seconds. */
export const atSeconds = (tl: BoardTimeline, at: At): number =>
  (at.ph >= tl.phrases.length ? tl.card : tl.phrases[Math.max(0, at.ph)]?.start ?? 0) + at.dt;

// ----------------------------------------------------------------- cleaning ----

const str = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").replace(/\s*[—–]\s*/g, ", ").trim().slice(0, n) : "");
const num = (v: unknown, lo: number, hi: number, d = lo) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown, n: number): Record<string, unknown>[] => (Array.isArray(v) ? v.slice(0, n).map(obj) : []);
const tone = (v: unknown, d: Tone = "fg"): Tone => ((TONES as readonly string[]).includes(String(v)) ? (v as Tone) : d);

/**
 * The writer's storyboard, made safe to draw: known blocks only, every
 * position on the stage, every moment inside the video, short texts, bounded
 * counts, and "Example numbers" on screen when a number isn't the brand's own.
 * null when there is no usable story (fewer than three phrases).
 */
export function cleanBoard(raw: unknown, sourceText: string): Storyboard | null {
  const r = obj(raw);
  // A phrase written as a bare string is still a phrase.
  const phrases = (Array.isArray(r.phrases) ? r.phrases.slice(0, 14) : [])
    .map((p) => (typeof p === "string" ? { text: p, em: "" } : obj(p)))
    .map((p) => ({ text: str(p.text, 90).split(" ").slice(0, 9).join(" "), em: str(p.em, 60) }))
    .filter((p) => p.text);
  if (phrases.length < 3) return null;
  const n = phrases.length;
  const at = (v: unknown, none = false): At => {
    const a = obj(v);
    const ph = Math.round(num(a.ph, none ? -1 : 0, n, none ? -1 : 0));
    return { ph, dt: Math.round(num(a.dt, -2, 12, 0) * 100) / 100 };
  };
  const sx = (v: unknown) => Math.round(num(v, 0, STAGE_W, STAGE_W / 2));
  const sy = (v: unknown) => Math.round(num(v, 0, STAGE_H, STAGE_H / 2));

  const points: BoardPoint[] = arr(r.points, 16)
    .map((p) => ({ name: str(p.name, 20), x: sx(p.x), y: sy(p.y), draw: (p.draw === "hold" || p.draw === "dot" ? p.draw : "none") as BoardPoint["draw"], tone: tone(p.tone, "dim") }))
    .filter((p) => p.name);
  const names = new Set(points.map((p) => p.name));
  const ref = (v: unknown) => (names.has(String(v)) ? String(v) : "");

  const figures: BoardFigure[] = arr(r.figures, 3)
    .map((f) => ({
      id: str(f.id, 12) || "a",
      scale: num(f.scale, 0.5, 1.15, 0.9),
      tone: tone(f.tone),
      keys: arr(f.keys, 40).map((k) => ({ at: at(k.at), x: sx(k.x), y: sy(k.y), lean: num(k.lean, -60, 60, 0), lh: ref(k.lh), rh: ref(k.rh), lf: ref(k.lf), rf: ref(k.rf), o: num(k.o, 0, 1, 1) })),
    }))
    .filter((f) => f.keys.length);
  const figureIds = new Set(figures.map((f) => f.id));

  const end = obj(r.end);
  const title = Array.isArray(end.title) ? end.title : [];
  const counter = obj(r.counter), meter = obj(r.meter), set = obj(r.set), sweep = obj(r.sweep);
  const counterSteps = arr(counter.steps, 12).map((s) => ({ at: at(s.at), value: Math.round(num(s.value, 0, 99999, 0)) }));
  const meterKeys = arr(meter.keys, 12).map((s) => ({ at: at(s.at), value: num(s.value, 0, 100, 0) }));

  const board: Storyboard = {
    version: 1,
    phrases,
    chapters: arr(r.chapters, 5).map((c) => ({ ph: Math.round(num(c.ph, 0, n - 1, 0)), label: str(c.label, 34) })).filter((c) => c.label),
    example: str(r.example, 24),
    counter: str(counter.label, 14) && counterSteps.length ? { label: str(counter.label, 14), steps: counterSteps, goodAt: at(counter.goodAt, true) } : null,
    meter: str(meter.label, 20) && meterKeys.length ? { label: str(meter.label, 20), keys: meterKeys, goodAt: at(meter.goodAt, true) } : null,
    set: { floor: set.floor !== false, panels: set.panels === true, spots: set.spots === true, scatter: Math.round(num(set.scatter, 0, 90, 0)) },
    points,
    figures,
    shapes: arr(r.shapes, 12)
      .map((s) => ({
        shape: ((SHAPES as readonly string[]).includes(String(s.shape)) ? s.shape : "rect") as BoardShape["shape"],
        tone: tone(s.tone, "dim"),
        keys: arr(s.keys, 12).map((k) => ({ at: at(k.at), x: sx(k.x), y: sy(k.y), w: Math.round(num(k.w, 0, STAGE_W, 80)), h: Math.round(num(k.h, 0, STAGE_H, 80)), rot: num(k.rot, -180, 180, 0), o: num(k.o, 0, 1, 1) })),
      }))
      .filter((s) => s.keys.length),
    tags: arr(r.tags, 8).map((t) => ({ text: str(t.text, 22), tone: tone(t.tone, "accent"), x: sx(t.x), y: sy(t.y), from: at(t.from), to: at(t.to, true) })).filter((t) => t.text),
    markers: arr(r.markers, 6).map((m) => ({ label: str(m.label, 2), point: ref(m.point), at: at(m.at) })).filter((m) => m.label && m.point),
    stamps: arr(r.stamps, 3).map((s) => ({ text: str(s.text, 14), tone: tone(s.tone, "accent"), x: sx(s.x), y: sy(s.y), at: at(s.at) })).filter((s) => s.text),
    links: arr(r.links, 4)
      .map((l) => ({ figure: str(l.figure, 12), hand: (l.hand === "rh" ? "rh" : "lh") as BoardLink["hand"], point: ref(l.point), label: str(l.label, 18), tone: tone(l.tone, "bad"), from: at(l.from), to: at(l.to) }))
      .filter((l) => l.point && figureIds.has(l.figure)),
    cards: arr(r.cards, 4)
      .map((c) => ({ title: str(c.title, 30), lines: (Array.isArray(c.lines) ? c.lines : []).map((x) => str(x, 44)).filter(Boolean).slice(0, 4), x: sx(c.x), y: sy(c.y), w: Math.round(num(c.w, 560, 960, 760)), from: at(c.from), to: at(c.to, true) }))
      .filter((c) => c.title),
    sweep: { from: at(sweep.from, true), to: at(sweep.to, true) },
    flash: at(r.flash, true),
    end: {
      eyebrow: str(end.eyebrow, 30),
      title: [str(title[0], 22), str(title[1], 22)],
      rows: arr(end.rows, 3)
        .map((x) => ({ icon: ((END_ICONS as readonly string[]).includes(String(x.icon)) ? x.icon : "chat") as (typeof END_ICONS)[number], a: str(x.a, END_LINE), b: str(x.b, END_LINE) }))
        .filter((x) => x.a),
    },
  };
  declutter(board);
  // A number that isn't the brand's own is an example, and the video says so.
  const source = numberTokens(sourceText);
  const shown = [...board.phrases.map((p) => p.text), ...board.tags.map((t) => t.text), ...board.chapters.map((c) => c.label), ...board.cards.flatMap((c) => [c.title, ...c.lines])].join(" ");
  if (!board.example && inventsNumbers(shown, source)) board.example = "Example numbers";
  // The ending never carries a number the brand didn't write.
  if (inventsNumbers([board.end.eyebrow, ...board.end.title, ...board.end.rows.flatMap((x) => [x.a, x.b])].join(" "), source)) board.end.rows = board.end.rows.filter((x) => !inventsNumbers(`${x.a} ${x.b}`, source));
  return board;
}

/** When each chapter after the first starts, in seconds. */
const chapterStarts = (b: Pick<Storyboard, "chapters">, tl: BoardTimeline): number[] =>
  b.chapters.map((c) => tl.phrases[c.ph]?.start ?? 0).filter((t) => t > 0.05);

/** When a stamp leaves: when the next stamp, the flash or the next chapter comes in after it, else at the ending card. A verdict on one part of the story never sits over the next part. */
export function stampEnd(b: Pick<Storyboard, "stamps" | "flash" | "chapters">, tl: BoardTimeline, i: number): number {
  const at = atSeconds(tl, b.stamps[i].at);
  const later = [...b.stamps.map((s) => atSeconds(tl, s.at)), ...(b.flash.ph >= 0 ? [atSeconds(tl, b.flash)] : []), ...chapterStarts(b, tl)].filter((t) => t > at + 0.05);
  return Math.min(tl.card, ...later);
}

/** When the counter leaves: at the first chapter that starts after its last count (once that count has had a moment to be read), else at the ending card. A finished count doesn't stay over the rest of the story. */
export function counterEnd(b: Pick<Storyboard, "counter" | "chapters">, tl: BoardTimeline): number {
  if (!b.counter?.steps.length) return 0;
  // Its last moment: the last count, or when it turns to the good colour if that comes later.
  const last = Math.max(...b.counter.steps.map((s) => atSeconds(tl, s.at)), b.counter.goodAt.ph >= 0 ? atSeconds(tl, b.counter.goodAt) : 0);
  const next = chapterStarts(b, tl).filter((t) => t > last + 0.05).sort((x, y) => x - y)[0];
  return next === undefined ? tl.card : Math.min(tl.card, Math.max(next, last + 0.8));
}

/** How wide a label, a stamp and a card are drawn, so the layout check and the renderer agree. */
export const TAG_H = 68;
export const tagWidth = (text: string) => text.length * 23 + 44;
export const stampWidth = (text: string, condensed: boolean) => text.length * (condensed ? 34 : 44) + 60;
export const cardHeight = (lines: number) => 124 + lines * 70;

/** Labels, stamps and cards that are up at the same time never sit on top of each other: the later one moves down, or up when there is no room. */
function declutter(b: Storyboard): void {
  const tl = boardTimeline(b);
  type Box = { x0: number; x1: number; y: number; h: number; from: number; to: number; set?: (y: number) => void };
  const until = (to: At) => (to.ph < 0 ? tl.card : atSeconds(tl, to));
  const placed: Box[] = b.cards.map((c) => ({ x0: c.x - c.w / 2, x1: c.x + c.w / 2, y: c.y, h: cardHeight(c.lines.length), from: atSeconds(tl, c.from), to: until(c.to) }));
  const movable: Box[] = [
    ...b.stamps.map((s, i) => { const w = stampWidth(s.text, false); return { x0: s.x - w / 2, x1: s.x + w / 2, y: s.y, h: 100, from: atSeconds(tl, s.at), to: stampEnd(b, tl, i), set: (y: number) => { s.y = y; } }; }),
    ...b.tags.map((t) => { const w = tagWidth(t.text); return { x0: t.x - w / 2, x1: t.x + w / 2, y: t.y, h: TAG_H + 4, from: atSeconds(tl, t.from), to: until(t.to), set: (y: number) => { t.y = y; } }; }),
  ];
  const hits = (a: Box, c: Box) => a.from < c.to && c.from < a.to && a.x0 < c.x1 && c.x0 < a.x1 && Math.abs(a.y - c.y) < (a.h + c.h) / 2 + 6;
  for (const m of movable) {
    for (let tries = 0; tries < 8; tries++) {
      const other = placed.find((q) => hits(m, q));
      if (!other) break;
      const below = other.y + (other.h + m.h) / 2 + 10;
      m.y = Math.round(below + m.h / 2 <= FLOOR_Y ? below : other.y - (other.h + m.h) / 2 - 10);
      m.y = Math.max(m.h / 2 + 4, Math.min(STAGE_H - m.h / 2 - 4, m.y));
    }
    m.set?.(m.y);
    placed.push(m);
  }
}

/** Every line the viewer reads, for the meaning check: each caption with what is on the stage while it is up, then the ending card. */
export function boardWords(b: Storyboard): string {
  const tl = boardTimeline(b);
  const until = (to: At) => (to.ph < 0 ? tl.card : atSeconds(tl, to));
  // On screen with a caption when they share a real stretch of it, not a few frames at its edge.
  const during = (from: number, to: number, a: number, z: number) => Math.min(to, z) - Math.max(from, a) >= Math.min(0.4, (z - a) / 2, to - from);
  const counterTo = counterEnd(b, tl);
  const lines = tl.phrases.map((ph, i) => {
    const chapter = [...b.chapters].sort((x, y) => y.ph - x.ph).find((c) => c.ph <= i);
    const stage = [
      ...b.cards.filter((c) => during(atSeconds(tl, c.from), until(c.to), ph.start, ph.end)).map((c) => `card "${c.title}"${c.lines.length ? ` (${c.lines.join("; ")})` : ""}`),
      ...b.tags.filter((t) => during(atSeconds(tl, t.from), until(t.to), ph.start, ph.end)).map((t) => `label "${t.text}"`),
      ...b.stamps.filter((s, k) => during(atSeconds(tl, s.at), stampEnd(b, tl, k), ph.start, ph.end)).map((s) => `stamp "${s.text}"`),
      ...b.links.filter((l) => l.label && during(atSeconds(tl, l.from), until(l.to), ph.start, ph.end)).map((l) => `label "${l.label}"`),
      ...(b.counter && during(Math.min(...b.counter.steps.map((s) => atSeconds(tl, s.at))), counterTo, ph.start, ph.end) ? [`counter "${b.counter.label}" up to ${Math.max(...b.counter.steps.map((s) => s.value))}`] : []),
      ...(b.meter ? [`meter "${b.meter.label}"`] : []),
    ];
    return `${i + 1}. [${chapter?.label ?? "no chapter label"}] "${b.phrases[i].text}"${stage.length ? ` · on the stage: ${stage.join(", ")}` : ""}`;
  });
  return [
    "Story video: captions appear one at a time over a stage of cards, labels and shapes. Each line below is one caption with what the stage shows while it is up.",
    b.example ? `Illustrative content is marked on screen for the whole video with the label "${b.example}".` : "",
    ...lines,
    `Ending card: ${[b.end.eyebrow, b.end.title.join(" ")].filter(Boolean).join(" / ")} / ${b.end.rows.map((x) => `${x.a} ${x.b}`.trim()).join("; ")}`,
  ].filter(Boolean).join("\n");
}

/** Which icon an ask goes with. */
const askIcon = (text: string): (typeof END_ICONS)[number] => (/\b(comment|reply)\b/i.test(text) ? "chat" : /\b(dm|message|send|share)\b/i.test(text) ? "send" : "follow");
const askWords = (text: string) => new Set(text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 3));

/**
 * The ending asks for what the account itself asks for. When the account has
 * its own call to action and the ending card doesn't already carry it, it
 * becomes the card's first row, in the account's words; the writer's other
 * rows follow, up to three in all. Pure.
 */
export function withOwnCta(b: Storyboard, cta: string | null | undefined, sourceText = ""): Storyboard {
  const own = str(cta, 80).replace(/[“”]/g, '"');
  if (!own) return b;
  const want = askWords(own);
  const kind = askIcon(own);
  const said = [b.end.title.join(" "), ...b.end.rows.map((x) => `${x.a} ${x.b}`)];
  const has = (text: string) => { const w = askWords(text); let n = 0; for (const x of want) if (w.has(x)) n++; return want.size > 0 && n / want.size >= 0.6; };
  // Already there, or the ending already asks for the same kind of thing (a post's own "comment ..." ask stands).
  if (said.some(has) || (kind !== "follow" && said.some((x) => askIcon(x) === kind))) return b;
  if (inventsNumbers(own, numberTokens(`${sourceText} ${own}`))) return b;
  // One line when it fits; otherwise two, split at the word boundary nearest the middle.
  let a = own, second = "";
  if (own.length > END_LINE) {
    const words = own.split(" ");
    let best = 1;
    for (let i = 1; i < words.length; i++) if (Math.abs(words.slice(0, i).join(" ").length - own.length / 2) < Math.abs(words.slice(0, best).join(" ").length - own.length / 2)) best = i;
    a = words.slice(0, best).join(" ").slice(0, END_LINE);
    second = words.slice(best).join(" ").slice(0, END_LINE);
  }
  const row = { icon: kind, a, b: second };
  return { ...b, end: { ...b.end, rows: [row, ...b.end.rows].slice(0, 3) } };
}
