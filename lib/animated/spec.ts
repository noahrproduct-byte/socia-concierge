// "Make it with AI", animated style: a short vertical video built in code
// (components/animated/AnimatedComposition.tsx) from a few scenes of text. The
// model writes the scenes (lib/animated/write.ts); everything here is pure, so
// the browser preview, the render and the server agree on the same video.
// Client-safe: no server imports.

export const ANIMATED_FPS = 30;
export const ANIMATED_SIZE = { width: 1080, height: 1920 } as const;

export type AnimatedTheme = "ink" | "light" | "accent";

/** The colours a person can pick, and the model may choose from. */
export const ACCENTS = ["#2F5BFF", "#FF5A4E", "#F5A623", "#18B596", "#7C5CFF", "#E5487B"] as const;

export type AnimatedScene =
  | { type: "hook"; text: string; emphasis?: string }
  | { type: "point"; text: string; emphasis?: string }
  | { type: "list"; title: string; items: string[] }
  | { type: "quote"; text: string }
  | { type: "cta"; text: string; sub?: string };

/** Two lines of headline; `key` (words copied from the second line) is set in the italic accent. */
export type CompareHeadline = { lines: [string, string]; key: string };

/** How a column ends: the winner turns green, a bad result red, the others grey. */
export type CompareTone = "win" | "lose" | "neutral";

export type CompareColumn = { label: string; value: number; stamp: string; tone: CompareTone };

/**
 * The comparison template (after the reference study, scratchpad animref/fbf/timing.md):
 * one fixed frame, 2 to 4 columns measured on one number that count up together;
 * each stops at its value, snaps to its colour and gets a stamp. The headline
 * swaps hard three times (hook, turn, close) and it ends on a comment question.
 */
export type AnimatedCompare = {
  hook: CompareHeadline;
  turn: CompareHeadline;
  close: CompareHeadline;
  /** Small line under the headline: what was kept the same. */
  setup: string;
  /** "clock" shows the value as m:ss (value in seconds); "number" shows it with `unit`. */
  format: "clock" | "number";
  unit: string;
  columns: CompareColumn[];
  /** One line under the columns at the end. */
  note: string;
  /** The comment question at the end. */
  question: string;
  /** True when any value isn't written in the plan or brand details: the video then says "Example numbers". */
  illustrative: boolean;
};

/** One round of the counter: what changed (title), where the count ends, and the headline it leaves. */
export type CounterRound = { label: string; title: string; value: number; result: CompareHeadline };

/**
 * The counter template (after the π-collisions reference): one fixed frame, a
 * big number that counts up in 2 to 4 rounds that escalate. Each round counts
 * with an ease in and out, holds, the headline swaps hard to its result, and
 * a scoreboard of finished rounds builds up. Ends on a summary and a question.
 */
export type AnimatedCounter = {
  hook: CompareHeadline;
  close: CompareHeadline;
  /** Small line under the headline: the setup, or empty. */
  setup: string;
  /** What the big number counts, shown under it ("Collisions", "Cups poured"). */
  measure: string;
  format: "clock" | "number";
  unit: string;
  rounds: CounterRound[];
  note: string;
  question: string;
  illustrative: boolean;
};

export type AnimatedSpec = {
  version: 1;
  theme: AnimatedTheme;
  accent: string;
  scenes: AnimatedScene[];
  /** When set, the video is the comparison template and `scenes` is empty. */
  compare?: AnimatedCompare | null;
  /** When set, the video is the counter template and `scenes` is empty. */
  counter?: AnimatedCounter | null;
  /** Shown small at the end, e.g. the brand's name. Never invented. */
  signoff: string | null;
  caption: string;
  hashtags: string[];
};

export const MAX_SCENES = 6;
const MAX_WORDS = { hook: 9, point: 16, quote: 22, cta: 8, sub: 10, title: 8, item: 7 } as const;

const clean = (v: unknown, max: number): string =>
  typeof v === "string" ? v.replace(/\s+/g, " ").replace(/\s*[—–]\s*/g, ", ").trim().slice(0, max) : "";
const words = (s: string) => s.split(/\s+/).filter(Boolean);
const capWords = (s: string, n: number) => words(s).slice(0, n).join(" ");

/** Every token with a digit in it, lower-cased, without trailing punctuation. */
export function numberTokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of text.toLowerCase().split(/\s+/)) {
    const t = w.replace(/^[^\p{L}\p{N}$£€]+|[^\p{L}\p{N}%]+$/gu, "");
    if (/\d/.test(t)) out.add(t);
  }
  return out;
}

/** True when the text uses a number, price or percentage that isn't in the source. */
export function inventsNumbers(text: string, source: Set<string>): boolean {
  for (const t of numberTokens(text)) if (!source.has(t)) return true;
  return false;
}

function sceneText(s: AnimatedScene): string {
  if (s.type === "list") return [s.title, ...s.items].join(" ");
  if (s.type === "cta") return [s.text, s.sub ?? ""].join(" ");
  return s.text;
}

/**
 * The model's scenes, made safe: known types only, short lines, no em dashes,
 * no number the plan didn't contain (no invented prices, stats or results),
 * an emphasis word that is really in its line, at most MAX_SCENES, and a hook
 * first. null when there is no usable hook.
 */
export function cleanSpec(raw: unknown, sourceText: string, opts: { signoff?: string | null } = {}): AnimatedSpec | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const source = numberTokens(sourceText);
  const extras = {
    signoff: opts.signoff ? clean(opts.signoff, 40) || null : null,
    hashtags: (Array.isArray(r.hashtags) ? r.hashtags : []).filter((t): t is string => typeof t === "string").map((t) => t.replace(/^#/, "").replace(/[^\p{L}\p{N}_]/gu, "").slice(0, 40)).filter(Boolean).slice(0, 5),
  };
  const accent = ACCENTS.includes(r.accent as (typeof ACCENTS)[number]) ? (r.accent as string) : ACCENTS[0];
  const caption = clean(r.caption, 2200);
  const safeCaption = inventsNumbers(caption, source) ? "" : caption;
  if (r.format === "compare") {
    const compare = cleanCompare(r.compare, source);
    // The comparison is drawn on a dark or light ground only: green and red have to read on it.
    if (compare) return { version: 1, theme: r.theme === "light" ? "light" : "ink", accent, scenes: [], compare, caption: safeCaption, ...extras };
  }
  if (r.format === "counter") {
    const counter = cleanCounter(r.counter, source);
    if (counter) return { version: 1, theme: r.theme === "light" ? "light" : "ink", accent, scenes: [], counter, caption: safeCaption, ...extras };
  }
  const scenes: AnimatedScene[] = [];
  for (const s of Array.isArray(r.scenes) ? (r.scenes as Record<string, unknown>[]) : []) {
    if (!s || typeof s !== "object") continue;
    let scene: AnimatedScene | null = null;
    const emphasisIn = (text: string) => {
      const e = clean(s.emphasis, 40);
      return e && text.toLowerCase().includes(e.toLowerCase()) ? e : undefined;
    };
    if (s.type === "hook" || s.type === "point") {
      const text = capWords(clean(s.text, 160), s.type === "hook" ? MAX_WORDS.hook : MAX_WORDS.point);
      if (text) scene = { type: s.type, text, emphasis: emphasisIn(text) };
    } else if (s.type === "list") {
      const title = capWords(clean(s.title, 80), MAX_WORDS.title);
      const items = (Array.isArray(s.items) ? s.items : []).map((i) => capWords(clean(i, 80), MAX_WORDS.item)).filter(Boolean).slice(0, 4);
      if (title && items.length >= 2) scene = { type: "list", title, items };
    } else if (s.type === "quote") {
      const text = capWords(clean(s.text, 200), MAX_WORDS.quote);
      if (text) scene = { type: "quote", text };
    } else if (s.type === "cta") {
      const text = capWords(clean(s.text, 80), MAX_WORDS.cta);
      const sub = capWords(clean(s.sub, 80), MAX_WORDS.sub);
      if (text) scene = { type: "cta", text, ...(sub ? { sub } : {}) };
    }
    if (!scene || inventsNumbers(sceneText(scene), source)) continue;
    if (scene.type === "hook" && scenes.some((x) => x.type === "hook")) scene = { ...scene, type: "point" };
    scenes.push(scene);
    if (scenes.length >= MAX_SCENES) break;
  }
  const hook = scenes.findIndex((s) => s.type === "hook");
  if (hook < 0) return null;
  if (hook > 0) scenes.unshift(...scenes.splice(hook, 1));
  if (scenes.length < 2) return null;
  const theme: AnimatedTheme = r.theme === "light" || r.theme === "accent" ? r.theme : "ink";
  return { version: 1, theme, accent, scenes, caption: safeCaption, ...extras };
}

const COMPARE_WORDS = { line: 7, setup: 10, label: 3, stamp: 2, note: 10, question: 8 } as const;
const MAX_VALUE = 1e7;

function cleanHeadline(v: unknown, source: Set<string>): CompareHeadline | null {
  const h = (v ?? {}) as Record<string, unknown>;
  const raw = Array.isArray(h.lines) ? h.lines : [];
  const a = capWords(clean(raw[0], 80), COMPARE_WORDS.line);
  const b = capWords(clean(raw[1], 80), COMPARE_WORDS.line);
  if (!a || !b || inventsNumbers(`${a} ${b}`, source)) return null;
  const key = clean(h.key, 40);
  return { lines: [a, b], key: key && b.toLowerCase().includes(key.toLowerCase()) ? key : "" };
}

/** Plain text a line may show: short, and dropped when it uses a number the plan didn't contain. */
const safeLine = (v: unknown, n: number, source: Set<string>) => {
  const t = capWords(clean(v, 120), n);
  return t && !inventsNumbers(t, source) ? t : "";
};

/** The ways a value could be written in the plan ("28", "0:28", "36g", "$4.50"). */
function valueTokens(value: number, format: "clock" | "number", unit: string): string[] {
  const u = unit.toLowerCase();
  const out = [String(value), value.toFixed(2)].flatMap((n) => [n, `${n}${u}`, `${u}${n}`]);
  if (format === "clock") out.push(clockText(value));
  if (value >= 1000) out.push(value.toLocaleString("en-US"));
  return out;
}

/**
 * The model's comparison, made safe: 2 to 4 columns with a label, a value of
 * zero or more and a short stamp; headlines without invented numbers. Values
 * the plan didn't contain are allowed only as an illustration, and then the
 * video says so ("Example numbers"). null when it can't be drawn honestly.
 */
export function cleanCompare(v: unknown, source: Set<string>): AnimatedCompare | null {
  const c = (v ?? {}) as Record<string, unknown>;
  const hook = cleanHeadline(c.hook, source);
  const turn = cleanHeadline(c.turn, source);
  const close = cleanHeadline(c.close, source);
  if (!hook || !turn || !close) return null;
  const format = c.format === "clock" ? "clock" : "number";
  const unit = format === "clock" ? "" : clean(c.unit, 6);
  const columns: CompareColumn[] = [];
  for (const col of Array.isArray(c.columns) ? (c.columns as Record<string, unknown>[]) : []) {
    const label = capWords(clean(col?.label, 40), COMPARE_WORDS.label);
    const value = typeof col?.value === "number" ? Math.round(col.value * 100) / 100 : NaN;
    if (!label || !Number.isFinite(value) || value < 0 || value > MAX_VALUE) continue;
    const stamp = capWords(clean(col.stamp, 24), COMPARE_WORDS.stamp).toUpperCase();
    const tone: CompareTone = col.tone === "win" || col.tone === "lose" ? col.tone : "neutral";
    columns.push({ label, value, stamp: inventsNumbers(stamp, source) ? "" : stamp, tone });
    if (columns.length >= 4) break;
  }
  if (columns.length < 2 || Math.max(...columns.map((x) => x.value)) <= 0) return null;
  const illustrative = columns.some((col) => !valueTokens(col.value, format, unit).some((t) => source.has(t)));
  return {
    hook, turn, close, format, unit, columns, illustrative,
    setup: safeLine(c.setup, COMPARE_WORDS.setup, source),
    note: safeLine(c.note, COMPARE_WORDS.note, source),
    question: safeLine(c.question, COMPARE_WORDS.question, source),
  };
}

/**
 * The model's counter, made safe: 2 to 4 rounds with a label, a title and a
 * value above zero. A round's result line may use its own value (that's the
 * point of the round); every other line follows the no-invented-numbers rule.
 * Values the plan didn't contain mark the video "Example numbers".
 */
export function cleanCounter(v: unknown, source: Set<string>): AnimatedCounter | null {
  const c = (v ?? {}) as Record<string, unknown>;
  const hook = cleanHeadline(c.hook, source);
  const close = cleanHeadline(c.close, source);
  if (!hook || !close) return null;
  const format = c.format === "clock" ? "clock" : "number";
  const unit = format === "clock" ? "" : clean(c.unit, 6);
  const rounds: CounterRound[] = [];
  for (const r of Array.isArray(c.rounds) ? (c.rounds as Record<string, unknown>[]) : []) {
    const value = typeof r?.value === "number" ? Math.round(r.value * 100) / 100 : NaN;
    const title = capWords(clean(r?.title, 60), 5);
    if (!title || !Number.isFinite(value) || value <= 0 || value > MAX_VALUE || inventsNumbers(title, source)) continue;
    const label = capWords(clean(r.label, 24), 3);
    // The round's own value may appear in its result ("313 collisions").
    const own = new Set([...source, ...valueTokens(value, format, unit), compareValueText(value, format, unit).toLowerCase()]);
    const result = cleanHeadline(r.result, own);
    if (!result) continue;
    rounds.push({ label: label && !inventsNumbers(label, new Set([...source, String(rounds.length + 1)])) ? label : "", title, value, result });
    if (rounds.length >= 4) break;
  }
  if (rounds.length < 2) return null;
  return {
    hook, close, format, unit, rounds,
    setup: safeLine(c.setup, COMPARE_WORDS.setup, source),
    measure: safeLine(c.measure, 3, source),
    note: safeLine(c.note, COMPARE_WORDS.note, source),
    question: safeLine(c.question, COMPARE_WORDS.question, source),
    illustrative: rounds.some((x) => !valueTokens(x.value, format, unit).some((t) => source.has(t))),
  };
}

/** Round lengths in seconds: later rounds run longer as the numbers grow (the reference: 2.6, 4, 5.5, 5.7 s). */
const ROUND_SECONDS: Record<number, number[]> = { 2: [4, 6], 3: [3, 4.5, 6], 4: [2.6, 4, 5.5, 5.7] };
/** Between rounds only the round's content fades: out 0.4 s, 0.1 s empty, in 0.3 s. */
export const COUNTER_GAP = { out: 0.4, empty: 0.1, in: 0.3 } as const;
/** The last 0.5 s of a round holds its final value. */
export const COUNTER_HOLD = 0.5;

/** Where each round starts and ends, when the summary, note and question come in, and the length (seconds). */
export function counterTimeline(counter: Pick<AnimatedCounter, "rounds">): { rounds: { start: number; end: number }[]; close: number; question: number; total: number } {
  const lens = ROUND_SECONDS[Math.min(4, Math.max(2, counter.rounds.length))];
  const gap = COUNTER_GAP.out + COUNTER_GAP.empty + COUNTER_GAP.in;
  const rounds: { start: number; end: number }[] = [];
  let at = 0.3;
  for (let i = 0; i < counter.rounds.length; i++) {
    rounds.push({ start: at, end: at + lens[i] });
    at += lens[i] + gap;
  }
  const last = rounds[rounds.length - 1].end;
  return { rounds, close: last + 0.6, question: last + 2.2, total: Math.ceil(last + 6.5) };
}

/** The count shown during a round at `t` seconds: eases in and out from 0 to `value`, then holds. */
export function roundCount(t: number, round: { start: number; end: number }, value: number): number {
  const run = round.end - COUNTER_HOLD - round.start;
  const p = Math.min(1, Math.max(0, (t - round.start) / run));
  const e = p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
  return value * e;
}

/** A count of seconds as m:ss. */
export function clockText(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** A column's value as shown: m:ss, or the number with its unit (currency before, others after). */
export function compareValueText(value: number, format: "clock" | "number", unit: string, decimals = 0): string {
  if (format === "clock") return clockText(value);
  const n = value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  if (!unit) return n;
  return /^[$£€]$/.test(unit) ? `${unit}${n}` : `${n} ${unit}`;
}

/**
 * The comparison's timeline, in seconds (the template is a fixed 20 s): the
 * shared counter runs steadily to 40/45 of the top value by RUN_STEADY, then
 * slows into the top value by RUN_END, like the clock in the reference.
 */
export const COMPARE_TIMES = { runStart: 0.3, runSteady: 11, runEnd: 12.6, turn: 2, close: 13.8, question: 15.4, total: 20 } as const;

/** The shared counter's value at `t` seconds, for a comparison whose top value is `max`. */
export function compareCounter(t: number, max: number): number {
  const { runStart, runSteady, runEnd } = COMPARE_TIMES;
  const steady = (40 / 45) * max;
  if (t <= runStart) return 0;
  if (t <= runSteady) return ((t - runStart) / (runSteady - runStart)) * steady;
  const p = Math.min(1, (t - runSteady) / (runEnd - runSteady));
  return steady + (max - steady) * (1 - (1 - p) ** 3);
}

/** When (seconds) the counter reaches `value`: the moment that column stops. */
export function compareStopAt(value: number, max: number): number {
  const { runStart, runSteady, runEnd } = COMPARE_TIMES;
  const steady = (40 / 45) * max;
  if (value <= 0) return runStart;
  if (value <= steady) return runStart + (value / steady) * (runSteady - runStart);
  // Invert the ease-out part.
  const p = 1 - Math.cbrt(1 - Math.min(1, (value - steady) / (max - steady)));
  return runSteady + p * (runEnd - runSteady);
}

/** How long a scene stays up: long enough to read it twice at a relaxed pace. */
export function sceneFrames(s: AnimatedScene): number {
  const n = words(sceneText(s)).length;
  const sec = Math.min(5.5, Math.max(2, 0.9 + n / 3));
  return Math.round(sec * ANIMATED_FPS);
}

/** Where each scene starts, and the whole length, in frames. The sign-off adds a short end card. */
export function specTimeline(spec: AnimatedSpec): { starts: number[]; frames: number[]; end: number; total: number } {
  if (spec.compare) return { starts: [], frames: [], end: 0, total: Math.round(COMPARE_TIMES.total * ANIMATED_FPS) };
  if (spec.counter) return { starts: [], frames: [], end: 0, total: Math.round(counterTimeline(spec.counter).total * ANIMATED_FPS) };
  const frames = spec.scenes.map(sceneFrames);
  const starts: number[] = [];
  let at = 0;
  for (const f of frames) { starts.push(at); at += f; }
  const end = spec.signoff ? Math.round(1.6 * ANIMATED_FPS) : 0;
  return { starts, frames, end, total: at + end };
}

/** Black or white text, whichever reads better on `hex`. */
export function inkOn(hex: string): "#111111" | "#FFFFFF" {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#FFFFFF";
  const n = parseInt(m[1], 16);
  const lin = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.4 ? "#111111" : "#FFFFFF";
}

/** The colours for a theme: background, text, and the highlight behind the emphasis word. */
export function palette(spec: Pick<AnimatedSpec, "theme" | "accent">): { bg: string; fg: string; mark: string; markInk: string; dim: string } {
  if (spec.theme === "light") return { bg: "#F6F5F2", fg: "#141414", mark: spec.accent, markInk: inkOn(spec.accent), dim: "rgba(20,20,20,0.55)" };
  if (spec.theme === "accent") {
    const fg = inkOn(spec.accent);
    return { bg: spec.accent, fg, mark: fg, markInk: spec.accent, dim: fg === "#FFFFFF" ? "rgba(255,255,255,0.7)" : "rgba(17,17,17,0.6)" };
  }
  return { bg: "#101012", fg: "#F4F2EE", mark: spec.accent, markInk: inkOn(spec.accent), dim: "rgba(244,242,238,0.55)" };
}
